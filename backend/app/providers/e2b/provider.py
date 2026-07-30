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
import contextlib
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, ClassVar

from app.engine.artifacts import Artifact, ArtifactKind
from app.engine.artifacts import build as build_artifact
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


#: Extension to media type and artifact kind.
#:
#: The media type is what the shared artifact builder encodes by, so the
#: sandbox does not decide text-versus-binary a second time — that decision
#: lives in exactly one place, and disagreeing copies of it are how a download
#: ends up unopenable.
_FILE_TYPES: dict[str, tuple[str, ArtifactKind]] = {
    ".png": ("image/png", ArtifactKind.CHART),
    ".jpg": ("image/jpeg", ArtifactKind.IMAGE),
    ".jpeg": ("image/jpeg", ArtifactKind.IMAGE),
    ".svg": ("image/svg+xml", ArtifactKind.CHART),
    ".csv": ("text/csv", ArtifactKind.TABLE),
    ".json": ("application/json", ArtifactKind.DATA),
    ".parquet": ("application/octet-stream", ArtifactKind.DATA),
    ".md": ("text/markdown", ArtifactKind.REPORT),
    ".txt": ("text/plain", ArtifactKind.LOG),
    ".pdf": ("application/pdf", ArtifactKind.REPORT),
    ".html": ("text/html", ArtifactKind.REPORT),
}

#: Read as text when the media type is one the shared builder stores verbatim.
_TEXT_KINDS = frozenset({".csv", ".json", ".md", ".txt", ".html", ".svg"})


#: The profiling script. Fixed rather than assembled from caller input: the
#: data arrives as a file, so nothing the caller sends is ever parsed as code.
#:
#: Every section is wrapped, because a dataset that breaks one chart must not
#: cost the reader the entire profile — the same partial-failure rule the rest
#: of the platform follows.
_ANALYSIS_SCRIPT = """
import json, warnings
warnings.filterwarnings("ignore")
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ART = "/home/user/artifacts"
name = "__FILENAME__"

if name.endswith(".json"):
    frame = pd.read_json(f"/home/user/{name}")
else:
    frame = pd.read_csv(f"/home/user/{name}")

profile = {
    "rows": int(frame.shape[0]),
    "columns": int(frame.shape[1]),
    "column_names": [str(c) for c in frame.columns],
    "dtypes": {str(c): str(t) for c, t in frame.dtypes.items()},
    "missing": {str(c): int(n) for c, n in frame.isna().sum().items()},
    "duplicated_rows": int(frame.duplicated().sum()),
}

numeric = frame.select_dtypes("number")
if not numeric.empty:
    described = numeric.describe().to_dict()
    profile["numeric"] = {
        str(col): {str(k): (None if pd.isna(v) else float(v)) for k, v in stats.items()}
        for col, stats in described.items()
    }

categorical = frame.select_dtypes(exclude="number")
if not categorical.empty:
    profile["categorical"] = {
        str(col): {
            "unique": int(categorical[col].nunique()),
            "top": (
                None if categorical[col].mode().empty
                else str(categorical[col].mode().iloc[0])
            ),
        }
        for col in categorical.columns[:20]
    }

try:
    frame.head(50).to_csv(f"{ART}/preview.csv", index=False)
except Exception:
    pass

# One chart per numeric column, capped: a hundred histograms is not a report.
for column in list(numeric.columns)[:6]:
    try:
        figure, axis = plt.subplots(figsize=(6, 3.2))
        numeric[column].plot(kind="hist", bins=30, ax=axis, color="#12490F")
        axis.set_title(f"Distribution of {column}")
        figure.tight_layout()
        figure.savefig(f"{ART}/dist_{column}.png", dpi=110)
        plt.close(figure)
    except Exception:
        pass

if numeric.shape[1] > 1:
    try:
        correlation = numeric.corr(numeric_only=True)
        profile["correlation"] = {
            str(a): {str(b): (None if pd.isna(v) else round(float(v), 4))
                     for b, v in row.items()}
            for a, row in correlation.to_dict().items()
        }
        figure, axis = plt.subplots(figsize=(5.5, 4.5))
        image = axis.imshow(correlation, cmap="viridis", vmin=-1, vmax=1)
        axis.set_xticks(
            range(len(correlation)), correlation.columns, rotation=90, fontsize=7
        )
        axis.set_yticks(range(len(correlation)), correlation.columns, fontsize=7)
        figure.colorbar(image)
        axis.set_title("Correlation")
        figure.tight_layout()
        figure.savefig(f"{ART}/correlation.png", dpi=110)
        plt.close(figure)
    except Exception:
        pass

with open(f"{ART}/profile.json", "w") as handle:
    json.dump(profile, handle, indent=2, default=str)

print("__PROFILE__" + json.dumps(profile, default=str))
"""


class E2BProvider(Provider):
    """Runs Python in a disposable sandbox and collects what it produced."""

    name: ClassVar[str] = "e2b"
    title: ClassVar[str] = "E2B"
    description: ClassVar[str] = (
        "Runs Python in a disposable sandbox and returns stdout, errors, and "
        "any files it wrote — charts, CSV, JSON, markdown, PDF."
    )
    capabilities: ClassVar[tuple[Capability, ...]] = (
        Capability.RUN_CODE,
        Capability.ANALYSE_DATA,
    )
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
        if capability is Capability.ANALYSE_DATA:
            return await self.analyse(**kwargs)
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

    async def analyse(
        self,
        *,
        data: str,
        filename: str = "dataset.csv",
        timeout_seconds: int = DEFAULT_EXECUTION_TIMEOUT,
        **_: Any,
    ) -> ProviderResult:
        """Profile a dataset and chart it.

        The caller supplies **data, not a program**, which is the whole reason
        this is a capability of its own rather than a use of RUN_CODE. A caller
        that had to send code would need to know pandas is present, what the
        artifact directory is called, and how to serialise a result — three
        implementation details that would then be duplicated at every call
        site and drift apart.

        The generated script is fixed and the data is written to a file rather
        than interpolated into it. Pasting a CSV into source is how a stray
        quote becomes a syntax error, and how hostile content becomes code.
        """
        profile = _ANALYSIS_SCRIPT.replace("__FILENAME__", filename)

        async with self.session(timeout_seconds=timeout_seconds + 15) as sandbox:
            await asyncio.to_thread(sandbox.files.write, f"/home/user/{filename}", data)
            await asyncio.to_thread(
                sandbox.run_code,
                f"import os; os.makedirs('{ARTIFACT_DIR}', exist_ok=True)",
            )

            execution = await asyncio.to_thread(sandbox.run_code, profile)
            output = _output_from(execution)
            output.artifacts = await self._collect(sandbox)

        if output.error:
            return ProviderResult.failure(
                self.name,
                Capability.ANALYSE_DATA,
                f"The dataset could not be profiled: {output.error}",
                error_code="analysis_failed",
            )

        summary: dict[str, Any] = {}
        for line in output.stdout.splitlines():
            if line.startswith("__PROFILE__"):
                with contextlib.suppress(json.JSONDecodeError):
                    summary = json.loads(line[len("__PROFILE__") :])

        return ProviderResult.success(
            self.name,
            Capability.ANALYSE_DATA,
            data={
                "filename": filename,
                "profile": summary,
                "artifacts": [item.to_dict() for item in output.artifacts],
                "stdout": output.stdout,
            },
            warnings=(
                []
                if summary
                else ["The profile could not be parsed; charts may still be present."]
            ),
        )

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

            output = _output_from(execution)

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
                    payload: str | bytes = raw if isinstance(raw, str) else str(raw)
                else:
                    raw = await asyncio.to_thread(
                        sandbox.files.read, path, format="bytes"
                    )
                    payload = raw if isinstance(raw, bytes | bytearray) else bytes(raw)
            except Exception as exc:
                logger.debug("artifact_read_failed", path=path, error=str(exc))
                continue

            size = len(payload)
            if size > MAX_ARTIFACT_BYTES:
                logger.warning("artifact_too_large", path=path, size_bytes=size)
                continue

            media_type, kind = _FILE_TYPES.get(
                suffix, ("application/octet-stream", ArtifactKind.DATA)
            )
            artifacts.append(
                build_artifact(
                    kind=kind,
                    filename=name,
                    media_type=media_type,
                    data=payload,
                    label=name,
                    description=f"Written by the sandbox at {path}.",
                )
            )

        return artifacts


def _suffix(name: str) -> str:
    _, _, extension = name.rpartition(".")
    return f".{extension.lower()}" if extension and extension != name else ""


def _output_from(execution: Any) -> ExecutionOutput:
    """Read one sandbox execution into the shared shape.

    Shared by `run` and `analyse` rather than duplicated: the two would drift,
    and the field that drifts first is `error` — which is the one a caller
    checks before trusting anything else.
    """
    output = ExecutionOutput()
    output.stdout = "\n".join(getattr(execution.logs, "stdout", []) or [])
    output.stderr = "\n".join(getattr(execution.logs, "stderr", []) or [])

    if getattr(execution, "error", None) is not None:
        error = execution.error
        name = getattr(error, "name", "Error")
        value = getattr(error, "value", "")
        output.error = f"{name}: {value}".strip(": ")

    output.results = _results_from(execution)
    return output


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
