"""Code execution in an E2B sandbox.

The only provider here that runs *arbitrary code*, which makes its failure
modes different in kind from the others. A search that misbehaves returns bad
results; a sandbox that misbehaves runs somebody's code somewhere it should
not. Three things follow, and all three are enforced rather than documented:

* **Every sandbox is closed.** Lifecycle goes through `session()`, which kills
  the sandbox in a `finally`. A leaked sandbox bills until its own timeout.
* **Every run is bounded.** Both the sandbox and the individual execution
  carry a timeout, because an infinite loop inside a live sandbox is exactly
  what an untrusted snippet produces.
* **Artifacts are captured, not guessed.** Files the code wrote are read back
  from the sandbox; nothing is fabricated from what the code *said* it did.

E2B is used through its official SDK rather than raw HTTP — the sandbox
protocol is not a REST API, and reimplementing it would be a liability. The
import is deferred so the package is optional: a deployment that never runs
code does not need it installed.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, ClassVar

from app.logging import get_logger
from app.providers.base import Provider
from app.providers.types import Capability, ProviderResult

logger = get_logger(__name__)

#: How long a sandbox may live before E2B reclaims it. A ceiling, not a target.
DEFAULT_SANDBOX_TIMEOUT = 120

#: How long one snippet may run inside a live sandbox.
DEFAULT_EXECUTION_TIMEOUT = 60

#: Largest artifact read back. A plot is kilobytes; a runaway loop writing to
#: disk is not, and pulling that into a JSON response would take the API down.
MAX_ARTIFACT_BYTES = 8_000_000

#: Where generated files are collected from. Fixed so the prompt, the code,
#: and the collector agree without the model having to be told each time.
ARTIFACT_DIR = "/home/user/artifacts"


@dataclass(slots=True)
class Artifact:
    """A file the executed code produced."""

    name: str
    path: str
    kind: str
    size_bytes: int
    #: Base64 for anything binary; plain text otherwise. The distinction is
    #: recorded so a consumer never has to guess how to decode it.
    encoding: str
    content: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "path": self.path,
            "kind": self.kind,
            "size_bytes": self.size_bytes,
            "encoding": self.encoding,
            "content": self.content,
        }


@dataclass(slots=True)
class ExecutionOutput:
    """Everything one run produced."""

    stdout: str = ""
    stderr: str = ""
    error: str | None = None
    results: list[dict[str, Any]] = field(default_factory=list)
    artifacts: list[Artifact] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "stdout": self.stdout,
            "stderr": self.stderr,
            "error": self.error,
            "results": self.results,
            "artifacts": [item.to_dict() for item in self.artifacts],
        }


#: Extension to a kind the report can group by.
_KINDS: dict[str, str] = {
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".svg": "image",
    ".csv": "data",
    ".json": "data",
    ".parquet": "data",
    ".md": "document",
    ".txt": "document",
    ".pdf": "document",
    ".html": "document",
}

#: Kinds that survive a round trip as text. Everything else is base64.
_TEXT_KINDS = frozenset({".csv", ".json", ".md", ".txt", ".html", ".svg"})


class E2BProvider(Provider):
    """Runs Python in a disposable sandbox and collects what it produced."""

    name: ClassVar[str] = "e2b"
    title: ClassVar[str] = "E2B"
    description: ClassVar[str] = (
        "Runs Python in a disposable sandbox and returns stdout, errors, and "
        "any files it wrote — charts, CSV, JSON, markdown, PDF."
    )
    capabilities: ClassVar[tuple[Capability, ...]] = (Capability.RUN_CODE,)
    required_env: ClassVar[tuple[str, ...]] = ("E2B_API_KEY",)

    def __init__(self, *, template: str = "", **kwargs: Any) -> None:
        super().__init__(**kwargs)
        #: Optional custom sandbox image. Empty means E2B's default.
        self._template = template

    @property
    def sdk_available(self) -> bool:
        """Whether the optional SDK is installed.

        Reported rather than assumed: a deployment with a valid key and no
        package would otherwise look healthy and fail on first use.
        """
        try:
            import e2b_code_interpreter  # noqa: F401
        except ImportError:
            return False
        return True

    def _unavailable_detail(self) -> str:
        if self.state.is_usable and not self.sdk_available:
            return (
                "Key present, but the `e2b-code-interpreter` package is not "
                "installed. Add it to requirements to enable code execution."
            )
        return super()._unavailable_detail()

    async def _probe(self) -> str:
        if not self.sdk_available:
            raise RuntimeError(
                "e2b-code-interpreter is not installed; code execution is unavailable"
            )

        # The only honest probe is starting a sandbox and running something
        # trivial in it — the credential is not validated until then.
        async with self.session(timeout_seconds=30) as sandbox:
            await asyncio.to_thread(sandbox.run_code, "1 + 1")
        return "Sandbox started and executed."

    async def _perform(self, capability: Capability, /, **kwargs: Any) -> ProviderResult:
        return await self.run(**kwargs)

    # --- lifecycle ---------------------------------------------------------

    @contextlib.asynccontextmanager
    async def session(
        self, *, timeout_seconds: int = DEFAULT_SANDBOX_TIMEOUT
    ) -> AsyncIterator[Any]:
        """A sandbox that is always killed.

        The `finally` is the entire reason this is a context manager: a sandbox
        left running bills until its own timeout expires, and an exception
        mid-execution is exactly when that happens.
        """
        # Optional dependency: a deployment that never runs code need not
        # install it, so the import is deferred and unresolved for the type
        # checker rather than made a hard requirement.
        from e2b_code_interpreter import Sandbox

        options: dict[str, Any] = {"api_key": self.key, "timeout": timeout_seconds}
        if self._template:
            options["template"] = self._template

        # The SDK is synchronous, so every call crosses to a worker thread
        # rather than blocking the event loop for the life of the sandbox.
        sandbox = await asyncio.to_thread(Sandbox.create, **options)
        logger.info("sandbox_started", provider=self.name)

        try:
            yield sandbox
        finally:
            with contextlib.suppress(Exception):
                await asyncio.to_thread(sandbox.kill)
            logger.info("sandbox_stopped", provider=self.name)

    # --- work --------------------------------------------------------------

    async def run(
        self,
        *,
        code: str,
        timeout_seconds: int = DEFAULT_EXECUTION_TIMEOUT,
        collect_artifacts: bool = True,
        **_: Any,
    ) -> ProviderResult:
        """Execute one snippet and return everything it produced.

        A snippet that raises is *not* a provider failure — the sandbox worked
        and the code did not. That distinction matters: reporting a Python
        traceback as an outage would send the router looking for a different
        provider to run the same broken code.
        """
        if not self.sdk_available:
            return ProviderResult.failure(
                self.name,
                Capability.RUN_CODE,
                self._unavailable_detail(),
                error_code="sdk_missing",
            )

        output = ExecutionOutput()

        async with self.session(
            timeout_seconds=max(timeout_seconds + 30, DEFAULT_SANDBOX_TIMEOUT)
        ) as sandbox:
            if collect_artifacts:
                await asyncio.to_thread(
                    sandbox.run_code,
                    f"import os; os.makedirs({ARTIFACT_DIR!r}, exist_ok=True)",
                )

            execution = await asyncio.to_thread(
                sandbox.run_code, code, timeout=timeout_seconds
            )

            output.stdout = "\n".join(getattr(execution.logs, "stdout", []) or [])
            output.stderr = "\n".join(getattr(execution.logs, "stderr", []) or [])

            if getattr(execution, "error", None) is not None:
                error = execution.error
                name = getattr(error, "name", "Error")
                value = getattr(error, "value", "")
                output.error = f"{name}: {value}".strip(": ")

            output.results = _results_from(execution)

            if collect_artifacts:
                output.artifacts = await self._collect(sandbox)

        return ProviderResult.success(
            self.name,
            Capability.RUN_CODE,
            data=output.to_dict(),
            warnings=([f"The code raised {output.error}"] if output.error else []),
        )

    async def _collect(self, sandbox: Any) -> list[Artifact]:
        """Read back the files the code wrote.

        Best-effort throughout: a file that cannot be read is skipped rather
        than failing a run whose output is already captured.
        """
        try:
            entries = await asyncio.to_thread(sandbox.files.list, ARTIFACT_DIR)
        except Exception as exc:
            logger.debug("artifact_listing_failed", error=str(exc))
            return []

        artifacts: list[Artifact] = []
        for entry in entries or []:
            name = getattr(entry, "name", None)
            if not name:
                continue

            path = f"{ARTIFACT_DIR}/{name}"
            suffix = _suffix(name)
            as_text = suffix in _TEXT_KINDS

            try:
                if as_text:
                    raw = await asyncio.to_thread(sandbox.files.read, path)
                    content = raw if isinstance(raw, str) else str(raw)
                    encoding = "utf-8"
                else:
                    raw = await asyncio.to_thread(
                        sandbox.files.read, path, format="bytes"
                    )
                    data = raw if isinstance(raw, bytes | bytearray) else bytes(raw)
                    content = base64.b64encode(data).decode("ascii")
                    encoding = "base64"
            except Exception as exc:
                logger.debug("artifact_read_failed", path=path, error=str(exc))
                continue

            size = len(content)
            if size > MAX_ARTIFACT_BYTES:
                logger.warning("artifact_too_large", path=path, size_bytes=size)
                continue

            artifacts.append(
                Artifact(
                    name=name,
                    path=path,
                    kind=_KINDS.get(suffix, "file"),
                    size_bytes=size,
                    encoding=encoding,
                    content=content,
                )
            )

        return artifacts


def _suffix(name: str) -> str:
    _, _, extension = name.rpartition(".")
    return f".{extension.lower()}" if extension and extension != name else ""


def _results_from(execution: Any) -> list[dict[str, Any]]:
    """Rich results — a chart, a table — that the interpreter rendered.

    Only the presence and format of each is recorded here, not the payload:
    a rendered PNG belongs in artifacts, and duplicating it inline would
    double the size of every response containing a plot.
    """
    results: list[dict[str, Any]] = []
    for item in getattr(execution, "results", []) or []:
        formats: list[str] = []
        for candidate in ("png", "jpeg", "svg", "html", "markdown", "json", "chart"):
            if getattr(item, candidate, None):
                formats.append(candidate)

        text = getattr(item, "text", None)
        results.append({"formats": formats, "text": text})
    return results
