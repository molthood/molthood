"""Execution engine, router, agents, and evidence handling.

All deterministic: services are fakes, so these assert behaviour rather than
whatever the chain happens to look like today.
"""

from __future__ import annotations

import pytest

from app.core.exceptions import UnroutableRequestError
from app.engine.context import ExecutionContext, ExecutionRequest
from app.engine.engine import ExecutionEngine
from app.engine.router import AnalysisTarget, ExecutionRouter
from app.models.enums import AgentKind, ExecutionStatus, PipelineStage

TOKEN = "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34"
WALLET = "0xe8f445954c429290340370091bd15fb5ff3b6f70"


def engine_with(services) -> ExecutionEngine:
    return ExecutionEngine(services=services)


# --- Router -----------------------------------------------------------------


async def test_router_uses_explicit_target(fake_services) -> None:
    router = ExecutionRouter(services=fake_services)
    decision = await router.route(
        ExecutionRequest(
            request="anything", metadata={"target": "token", "address": TOKEN}
        )
    )

    assert decision.target is AnalysisTarget.TOKEN
    assert decision.primary_agent is AgentKind.MARKET
    assert decision.address == TOKEN


async def test_router_matches_keywords(fake_services) -> None:
    router = ExecutionRouter(services=fake_services)

    decision = await router.route(
        ExecutionRequest(request=f"audit the contract at {TOKEN}")
    )
    assert decision.target is AnalysisTarget.CONTRACT
    assert decision.primary_agent is AgentKind.CONTRACT


async def test_router_probes_chain_for_bare_address(fake_contract_services) -> None:
    """A bare address with no noun is classified by asking the chain."""
    router = ExecutionRouter(services=fake_contract_services)
    decision = await router.route(ExecutionRequest(request=f"look into {TOKEN}"))

    # The fake reports a contract, and the explorer knows it as a token.
    assert decision.target is AnalysisTarget.TOKEN


async def test_router_classifies_eoa_as_wallet(fake_services) -> None:
    router = ExecutionRouter(services=fake_services)
    decision = await router.route(ExecutionRequest(request=f"look into {WALLET}"))

    assert decision.target is AnalysisTarget.WALLET
    assert decision.primary_agent is AgentKind.PROJECT


async def test_router_rejects_unroutable_text(fake_services) -> None:
    router = ExecutionRouter(services=fake_services)

    with pytest.raises(UnroutableRequestError) as excinfo:
        await router.route(ExecutionRequest(request="hello there"))

    assert excinfo.value.status_code == 422
    assert excinfo.value.suggested_action


async def test_router_requires_address_for_token(fake_services) -> None:
    router = ExecutionRouter(services=fake_services)

    with pytest.raises(UnroutableRequestError):
        await router.route(ExecutionRequest(request="analyze this token please"))


async def test_risk_follows_every_addressed_target(fake_services) -> None:
    router = ExecutionRouter(services=fake_services)
    decision = await router.route(
        ExecutionRequest(request="token", metadata={"target": "token", "address": TOKEN})
    )

    assert AgentKind.RISK in decision.agents


# --- Full pipeline ----------------------------------------------------------


async def test_token_analysis_runs_all_five_stages(fake_services) -> None:
    result = await engine_with(fake_services).analyze(target="token", address=TOKEN)

    assert result.status is ExecutionStatus.SUCCEEDED
    assert [stage.stage for stage in result.stages] == [
        PipelineStage.INPUT,
        PipelineStage.AGENTS,
        PipelineStage.ENGINE,
        PipelineStage.EVIDENCE,
        PipelineStage.REPORT,
    ]
    assert all(stage.success for stage in result.stages)


async def test_result_carries_the_standard_fields(fake_services) -> None:
    result = await engine_with(fake_services).analyze(target="token", address=TOKEN)

    assert result.execution_id
    assert result.status
    assert result.target == "token"
    assert result.evidence
    assert result.sources
    assert result.execution_time_ms is not None
    assert result.agents_used == ["market", "risk"]
    assert "blockscout" in result.services_called


async def test_evidence_is_separate_from_summary(fake_services) -> None:
    """Evidence must be service-derived and traceable, never AI prose."""
    result = await engine_with(fake_services).analyze(target="token", address=TOKEN)

    assert result.summary is None  # no key configured in tests
    assert result.summary_status == "not_configured"
    assert any(item["source_url"] for item in result.evidence)

    # A confirmed finding carries a value; an unknown one carries a reason
    # instead. This used to assert that every item had a value, which is what
    # made a failed lookup indistinguishable from a clean result.
    for item in result.evidence:
        if item["state"] == "confirmed":
            assert item["value"] is not None, item["label"]
        elif item["state"] == "unknown":
            assert item["reason"], item["label"]


async def test_a_failed_check_is_reported_rather_than_dropped(fake_services) -> None:
    """Codex is unconfigured in tests, so its absence must be visible.

    The regression this guards against is silent omission: the declared-links
    check simply vanished from the evidence, leaving no trace that it had been
    attempted at all.
    """
    result = await engine_with(fake_services).analyze(target="token", address=TOKEN)

    unknowns = [item for item in result.evidence if item["state"] == "unknown"]
    assert unknowns, "an unconfigured service must leave an unknown finding"
    assert any("Codex" in (item["reason"] or "") for item in unknowns)


async def test_missing_ai_key_does_not_fail_the_run(fake_services) -> None:
    result = await engine_with(fake_services).analyze(target="token", address=TOKEN)

    assert result.succeeded
    assert result.summary_status == "not_configured"
    assert "OPENROUTER_API_KEY" in (result.summary_detail or "")


async def test_market_agent_computes_holder_concentration(fake_services) -> None:
    result = await engine_with(fake_services).analyze(target="token", address=TOKEN)

    token_facts = result.facts["token"]
    # 3 holders holding 100e18 each, out of a 1000e18 supply.
    assert token_facts["top10_holder_share_pct"] == 30.0
    assert token_facts["holders_count"] == 1500


async def test_contract_agent_detects_source_markers(fake_contract_services) -> None:
    result = await engine_with(fake_contract_services).analyze(
        target="contract", address=TOKEN
    )

    contract_facts = result.facts["contract"]
    assert contract_facts["is_verified"] is True
    assert "Has owner-gated functions" in contract_facts["source_markers"]
    assert contract_facts["is_contract"] is True


async def test_risk_agent_scores_from_evidence(fake_contract_services) -> None:
    result = await engine_with(fake_contract_services).analyze(
        target="contract", address=TOKEN
    )

    risk = result.facts["risk"]
    assert 0 <= risk["score"] <= 100
    assert risk["level"] in {"low", "moderate", "elevated", "high"}
    # The owner-gated marker must be the reason the score dropped.
    assert any("owner" in signal["detail"].lower() for signal in risk["signals"])


async def test_wallet_analysis_reads_balance_and_activity(fake_services) -> None:
    result = await engine_with(fake_services).analyze(target="wallet", address=WALLET)

    wallet = result.facts["wallet"]
    assert wallet["native_balance"] == pytest.approx(1.5)
    assert wallet["transactions_count"] == 120
    assert wallet["nonce"] == 77


async def test_chain_overview_needs_no_address(fake_services) -> None:
    result = await engine_with(fake_services).analyze(target="project")

    chain = result.facts["chain"]
    assert chain["chain_id"] == 4663
    assert chain["total_blocks"] == 21_000_000
    assert chain["head_block"] == 21_000_123
    assert result.agents_used == ["project"]


async def test_unroutable_request_fails_the_run_cleanly(fake_services) -> None:
    result = await engine_with(fake_services).submit(
        ExecutionRequest(request="hello there")
    )

    assert result.status is ExecutionStatus.FAILED
    assert result.error
    assert result.evidence == []


async def test_executions_are_recorded_in_the_store(fake_services) -> None:
    from app.repositories import get_execution_store

    await engine_with(fake_services).analyze(target="token", address=TOKEN)
    store = get_execution_store()

    assert store.count() == 1
    record = store.all()[0]
    assert record.target == "token"
    assert record.status == "succeeded"
    assert record.evidence_count > 0


async def test_context_deduplicates_sources(fake_services) -> None:
    context = ExecutionContext(
        request=ExecutionRequest(request="x"), services=fake_services
    )
    context.add_source("A", "https://example.test")
    context.add_source("A again", "https://example.test")

    assert len(context.sources) == 1
