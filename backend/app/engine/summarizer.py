"""AI summarizer.

Turns collected evidence into readable prose via OpenRouter. Two rules keep
the output trustworthy:

1. The model is given **only** the evidence the services returned, and is
   instructed not to add anything outside it.
2. If OpenRouter is unconfigured or fails, the execution still returns its
   evidence and reports `summary_status` — it never substitutes invented text.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from app.core.exceptions import ConfigurationError, MolthoodError
from app.engine.context import ExecutionContext
from app.engine.labels import redact_facts
from app.logging import get_logger

logger = get_logger(__name__)

SYSTEM_PROMPT = """\
You are an on-chain analyst for Molthood, an execution platform on Robinhood Chain.

You will be given a JSON object of facts collected from block explorer and RPC
calls. Write a concise analysis of it.

Rules:
- Use ONLY the facts provided. Never invent numbers, names, or history.
- If something important is missing from the facts, say it is unavailable.
- Do not speculate about price direction or give financial advice.
- Lead with what matters most, then support it with the specific figures.
- Plain prose, 120-200 words, no markdown headings, no bullet lists.
- Refer to concrete values (counts, percentages, amounts) rather than adjectives.
"""


@dataclass(slots=True)
class SummaryOutcome:
    """Result of the summarization attempt, successful or not."""

    status: str
    text: str | None = None
    detail: str | None = None
    model: str | None = None


class AISummarizer:
    """Wraps the OpenRouter client with prompt construction and safe failure."""

    def _precondition(self, context: ExecutionContext) -> SummaryOutcome | None:
        """The two reasons not to call the model at all.

        Shared by both paths so a streamed run and a buffered one refuse for
        exactly the same reasons and report them with the same wording.
        """
        if not context.services.openrouter.is_configured:
            return SummaryOutcome(
                status="not_configured",
                detail=(
                    "OPENROUTER_API_KEY is not set, so no summary was generated. "
                    "The evidence below is complete and unaffected."
                ),
            )

        if not context.facts:
            return SummaryOutcome(
                status="skipped",
                detail="No evidence was collected, so there was nothing to summarise.",
            )

        return None

    async def stream(self, context: ExecutionContext) -> SummaryOutcome:
        """Generate the summary, publishing each fragment as it arrives.

        Returns the same outcome as `summarize` — the deltas are an extra, not
        a replacement. A caller that ignored every event still gets the whole
        text, which is what keeps the stored result identical either way.
        """
        refusal = self._precondition(context)
        if refusal is not None:
            return refusal

        client = context.services.openrouter
        target = context.routing.target.value if context.routing else "subject"
        prompt = self._build_prompt(target, context)

        pieces: list[str] = []
        model: str | None = None

        try:
            chunks = client.stream_summarize(
                system_prompt=SYSTEM_PROMPT, user_prompt=prompt
            )
            async for chunk in chunks:
                model = chunk.model or model
                if chunk.text:
                    pieces.append(chunk.text)
                    await context.publish("summary_delta", text=chunk.text)
        except ConfigurationError as exc:
            return SummaryOutcome(status="not_configured", detail=exc.message)
        except MolthoodError as exc:
            logger.warning(
                "summary_stream_failed",
                code=exc.code,
                detail=exc.message,
                execution_id=context.execution_id,
            )
            return SummaryOutcome(status="failed", detail=exc.message)
        except Exception as exc:
            logger.exception("summary_stream_unexpected_error", error=str(exc))
            return SummaryOutcome(status="failed", detail=type(exc).__name__)

        context.note_service("openrouter")
        text = "".join(pieces).strip()

        if not text:
            return SummaryOutcome(
                status="failed",
                detail="The model returned an empty response.",
                model=model,
            )

        return SummaryOutcome(status="generated", text=text, model=model)

    async def summarize(self, context: ExecutionContext) -> SummaryOutcome:
        refusal = self._precondition(context)
        if refusal is not None:
            return refusal

        client = context.services.openrouter
        target = context.routing.target.value if context.routing else "subject"
        prompt = self._build_prompt(target, context)

        try:
            response = await client.summarize(
                system_prompt=SYSTEM_PROMPT, user_prompt=prompt
            )
        except ConfigurationError as exc:
            return SummaryOutcome(status="not_configured", detail=exc.message)
        except MolthoodError as exc:
            logger.warning(
                "summary_failed",
                code=exc.code,
                detail=exc.message,
                execution_id=context.execution_id,
            )
            return SummaryOutcome(status="failed", detail=exc.message)
        except Exception as exc:
            logger.exception("summary_unexpected_error", error=str(exc))
            return SummaryOutcome(status="failed", detail=type(exc).__name__)

        context.note_service("openrouter")
        text = response.text

        if not text:
            return SummaryOutcome(
                status="failed",
                detail="The model returned an empty response.",
                model=response.model,
            )

        return SummaryOutcome(status="generated", text=text, model=response.model)

    def _build_prompt(self, target: str, context: ExecutionContext) -> str:
        # Redacted before serialising, not after: the model can only repeat a
        # supplier's name if the name reached its input. It reached its input
        # through fact keys like `codex` and `deployer_share_goplus_pct`, and
        # duly appeared in published prose as "via Codex".
        payload = json.dumps(
            redact_facts(context.facts), indent=2, default=str, sort_keys=True
        )
        # Guard the prompt budget: evidence for a busy address can be large.
        if len(payload) > 12_000:
            payload = payload[:12_000] + "\n… (truncated)"

        return (
            f"Analysis target: {target}\n"
            f"Original request: {context.request.request}\n\n"
            f"Collected facts (JSON):\n{payload}\n\n"
            "Write the analysis now."
        )


summarizer = AISummarizer()
