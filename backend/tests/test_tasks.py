"""One task in, one structured report out.

The orchestrator is where the provider layer becomes a platform, so these
tests guard the properties that make its output trustworthy: a skipped step is
visible, a failed step does not fail the task, confidence reflects what
actually ran, and identical work is done once.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import time
from typing import Any

import pytest

from app.api.v1.endpoints.hooks import verify_signature
from app.providers.inputs import extract
from app.providers.manager import ProviderManager
from app.providers.orchestrator import TaskOrchestrator, fingerprint
from app.providers.types import Capability, ProviderResult
from app.providers.workflows import TaskKind


@pytest.fixture
def orchestrator() -> TaskOrchestrator:
    """Built on a keyless manager, so only Jina is available.

    That is the useful case to test: a partially-configured deployment is what
    most of these properties exist for.
    """
    return TaskOrchestrator(ProviderManager())


# --- Extracting arguments from a free-form request --------------------------


def test_a_url_is_found_and_made_absolute() -> None:
    assert extract("audit example.com/pricing").url == "https://example.com/pricing"
    assert extract("look at https://a.io/b?c=d").url == "https://a.io/b?c=d"


def test_prose_that_looks_like_a_domain_is_not_a_url() -> None:
    """ "compare vue.js and react" would otherwise be audited as a website."""
    assert extract("compare vue.js and react").url is None


def test_only_a_fenced_block_counts_as_code() -> None:
    """Treating prose as code would send whatever somebody typed to a Python
    interpreter. "calculate the mean" is a request *about* code, not code."""
    assert extract("calculate the mean of 1 2 3").code is None

    fenced = extract("run this:\n```python\nprint(1)\n```")
    assert fenced.code == "print(1)"


def test_a_code_block_is_not_searched_for() -> None:
    """Searching the web for a Python snippet is nonsense."""
    query = extract("run this:\n```\nimport os\n```").query

    assert "import os" not in query


def test_a_capability_with_no_input_gets_no_arguments() -> None:
    """Returning None rather than a partial call is the point: a crawl with no
    URL would otherwise be aimed at a guessed host."""
    task = extract("what is a proxy contract")

    assert task.arguments_for(Capability.CRAWL_SITE) is None
    assert task.arguments_for(Capability.RUN_CODE) is None
    assert task.arguments_for(Capability.WEB_SEARCH) == {"query": task.query}


# --- The report tells the truth about what ran ------------------------------


async def test_a_blocked_task_returns_a_report_not_an_exception(
    orchestrator: TaskOrchestrator,
) -> None:
    """Everything in it — what was attempted, what is missing, what would fix
    it — is useful, and raising would throw all of it away."""
    report = await orchestrator.run("research stablecoin depegs", use_cache=False)

    assert report.kind == TaskKind.RESEARCH.value
    assert report.confidence == "unknown"
    assert "EXA_API_KEY" in report.blocked_by
    assert report.error is not None
    # The plan is still reported in full, so a reader can see what would have
    # happened.
    assert len(report.timeline) == 4


async def test_a_skipped_step_appears_with_its_reason(
    orchestrator: TaskOrchestrator,
) -> None:
    """A reader who cannot see that the crawl never ran has no way to tell
    thorough coverage from a missing key."""
    report = await orchestrator.run("audit https://example.com", use_cache=False)

    skipped = [step for step in report.timeline if step.provider is None]

    assert skipped
    assert all(step.skipped_because for step in skipped)
    assert any("FIRECRAWL_API_KEY" in (step.skipped_because or "") for step in skipped)


async def test_confidence_is_never_a_reassuring_default(
    orchestrator: TaskOrchestrator,
) -> None:
    """`unknown` when nothing was established — not `low`, which implies
    something was weighed and found weak."""
    report = await orchestrator.run("research anything at all", use_cache=False)

    assert report.confidence == "unknown"
    assert report.confidence_reason


async def test_a_partially_served_task_reports_medium_not_high(
    orchestrator: TaskOrchestrator, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Jina alone can read a page, so an audit runs — but three of its four
    steps have no provider and the confidence has to say so."""

    async def read(self: Any, capability: Capability, /, **kwargs: Any) -> Any:
        return ProviderResult.success(
            "jina", capability, data={"text": "hello", "title": "Example"}
        )

    monkeypatch.setattr(type(orchestrator._manager.jina), "_perform", read, raising=False)

    report = await orchestrator.run("audit https://example.com", use_cache=False)

    assert report.confidence == "medium"
    assert report.performance.steps_run == 1
    assert report.performance.steps_skipped == 3


async def test_one_failing_step_does_not_fail_the_task(
    orchestrator: TaskOrchestrator, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Providers return results, not exceptions, so losing one leaves the rest
    intact."""

    async def broken(self: Any, capability: Capability, /, **kwargs: Any) -> Any:
        raise RuntimeError("upstream exploded")

    monkeypatch.setattr(
        type(orchestrator._manager.jina), "_perform", broken, raising=False
    )

    report = await orchestrator.run("audit https://example.com", use_cache=False)

    assert report.error is None
    failed = [step for step in report.timeline if step.ok is False]
    assert failed
    assert "upstream exploded" in (failed[0].error or "")


async def test_a_step_whose_input_is_missing_says_so(
    orchestrator: TaskOrchestrator, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A code-execution request with no fenced block has nothing to run."""
    monkeypatch.setattr(
        type(orchestrator._manager.e2b), "has_credentials", property(lambda self: True)
    )

    report = await orchestrator.run("plot a chart of my data", use_cache=False)

    step = report.timeline[0]
    assert step.skipped_because
    assert "fenced code block" in step.skipped_because


# --- Doing identical work once ----------------------------------------------


def test_the_fingerprint_ignores_cosmetic_differences() -> None:
    a = fingerprint(TaskKind.RESEARCH, "Research  Stablecoin   Depegs")
    b = fingerprint(TaskKind.RESEARCH, "research stablecoin depegs")

    assert a == b


def test_different_requests_do_not_collide() -> None:
    a = fingerprint(TaskKind.RESEARCH, "research stablecoins")
    b = fingerprint(TaskKind.RESEARCH, "research bridges")

    assert a != b


async def test_concurrent_identical_requests_run_once(
    orchestrator: TaskOrchestrator, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Four callers asking the same thing at the same time must not each pay.

    Verified live against four concurrent audits, which produced one task id.
    """
    runs = 0
    original = orchestrator._execute

    async def counted(*args: Any, **kwargs: Any) -> Any:
        nonlocal runs
        runs += 1
        await asyncio.sleep(0.05)
        return await original(*args, **kwargs)

    monkeypatch.setattr(orchestrator, "_execute", counted)

    reports = await asyncio.gather(
        *(orchestrator.run("audit https://example.com") for _ in range(4))
    )

    assert runs == 1
    assert len({report.task_id for report in reports}) == 1


async def test_a_failed_run_is_cleared_from_the_in_flight_map(
    orchestrator: TaskOrchestrator, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A task left in the map after failing would make every later caller
    await a dead future."""

    async def explode(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("boom")

    monkeypatch.setattr(orchestrator, "_execute", explode)

    with pytest.raises(RuntimeError):
        await orchestrator.run("audit https://example.com")

    assert orchestrator._in_flight == {}


# --- Queue deliveries are a security boundary -------------------------------


CURRENT_KEY = "sig_current"
NEXT_KEY = "sig_next"


def _sign(body: bytes, key: str, *, expires_in: int = 300, bind_body: bool = True) -> str:
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    claims: dict[str, Any] = {"iss": "Upstash", "exp": int(time.time()) + expires_in}
    if bind_body:
        claims["body"] = _b64(hashlib.sha256(body).digest())
    payload = _b64(json.dumps(claims).encode())
    signature = _b64(
        hmac.new(key.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    )
    return f"{header}.{payload}.{signature}"


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


BODY = b'{"job":"refresh"}'


def test_a_genuine_delivery_is_accepted() -> None:
    ok, _ = verify_signature(_sign(BODY, CURRENT_KEY), BODY, [CURRENT_KEY, NEXT_KEY])

    assert ok


def test_the_next_signing_key_is_accepted_too() -> None:
    """Both keys are checked so a rotation does not drop messages already in
    flight."""
    ok, _ = verify_signature(_sign(BODY, NEXT_KEY), BODY, [CURRENT_KEY, NEXT_KEY])

    assert ok


def test_a_forged_signature_is_rejected() -> None:
    ok, reason = verify_signature(_sign(BODY, "attacker"), BODY, [CURRENT_KEY, NEXT_KEY])

    assert not ok
    assert "does not match" in reason


def test_a_captured_signature_cannot_be_replayed_over_a_different_body() -> None:
    """The attack the body hash exists to stop.

    Without binding the signature to the payload, anyone who observed one
    valid delivery could resend that signature with any instruction they liked.
    """
    ok, reason = verify_signature(
        _sign(BODY, CURRENT_KEY), b'{"job":"delete-everything"}', [CURRENT_KEY]
    )

    assert not ok
    assert "Body does not match" in reason


def test_an_expired_signature_is_rejected() -> None:
    ok, reason = verify_signature(
        _sign(BODY, CURRENT_KEY, expires_in=-3600), BODY, [CURRENT_KEY]
    )

    assert not ok
    assert "expired" in reason


@pytest.mark.parametrize("signature", ["", "nonsense", "a.b", "a.b.c.d"])
def test_a_malformed_signature_is_rejected(signature: str) -> None:
    ok, _ = verify_signature(signature, BODY, [CURRENT_KEY])

    assert not ok


def test_no_signing_key_accepts_nothing() -> None:
    """An unverified public endpoint that executes work is worse than no
    queue at all, so the absence of a key refuses everything."""
    ok, _ = verify_signature(_sign(BODY, CURRENT_KEY), BODY, [])

    assert not ok
