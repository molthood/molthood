"""OpenRouter inference client.

Powers the AI summarizer stage. Fully implemented and key-ready: with
`OPENROUTER_API_KEY` set it performs real inference; without one it raises a
`ConfigurationError` naming the missing variable rather than returning an
invented summary.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, ClassVar

from app.models.enums import ServiceName
from app.services.base import BaseServiceClient
from app.services.http import TimeoutPolicy, validate_response
from app.services.models import ChatCompletionResponse

#: Inference is slower than an explorer call, so it gets its own budget.
INFERENCE_TIMEOUT = TimeoutPolicy(connect_seconds=5.0, read_seconds=45.0)

#: OpenRouter emits SSE comment lines (`: OPENROUTER PROCESSING`) as a
#: keep-alive while a model warms up. They carry no content and must be skipped
#: rather than parsed as JSON.
_SSE_DATA_PREFIX = "data:"
_SSE_DONE = "[DONE]"


@dataclass(frozen=True, slots=True)
class StreamChunk:
    """One piece of a streamed completion.

    Carries the model alongside the text because a stream has no envelope to
    read it from afterwards, and the UI labels generated prose with the model
    that wrote it.
    """

    text: str = ""
    model: str | None = None


class OpenRouterClient(BaseServiceClient):
    """Chat-completion access for agents that need language capability."""

    service: ClassVar[ServiceName] = ServiceName.OPENROUTER
    api_key_env: ClassVar[str | None] = "OPENROUTER_API_KEY"
    operations: ClassVar[tuple[str, ...]] = ("summarize", "complete", "list_models")

    def __init__(self, *, base_url: str, model: str, **kwargs: Any) -> None:
        kwargs.setdefault("timeout", INFERENCE_TIMEOUT)
        super().__init__(base_url=base_url, **kwargs)
        self.model = model

    def _auth_headers(self) -> dict[str, str]:
        headers = super()._auth_headers()
        # OpenRouter attributes traffic using these; harmless when absent.
        headers["http-referer"] = "https://molthood.org"
        headers["x-title"] = "Molthood"
        return headers

    async def ping(self) -> dict[str, Any]:
        self.ensure_configured()
        models = await self.list_models()
        return {"service": self.service.value, "models": len(models), "ok": True}

    async def list_models(self) -> list[dict[str, Any]]:
        self.ensure_configured()
        payload = await self.http.get_json("/models", operation="list_models")
        data = payload.get("data") if isinstance(payload, dict) else None
        return data if isinstance(data, list) else []

    async def complete(
        self,
        *,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int = 900,
    ) -> ChatCompletionResponse:
        """One chat completion. Raises `ConfigurationError` if no key is set.

        `temperature` defaults to unset on purpose: Claude Opus 4.7 and every
        Claude 5-family model reject a non-default sampling parameter with a
        400. Pass one only for a model known to accept it.
        """
        self.ensure_configured()

        payload: dict[str, Any] = {
            "model": model or self.model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        body = await self.http.post_json(
            "/chat/completions", json_body=payload, operation="complete"
        )
        return validate_response(
            body,
            ChatCompletionResponse,
            service=self.service.value,
            operation="complete",
        )

    async def summarize(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int = 900,
    ) -> ChatCompletionResponse:
        return await self.complete(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    async def stream_summarize(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        model: str | None = None,
        max_tokens: int = 900,
    ) -> AsyncIterator[StreamChunk]:
        """The same completion, delivered token by token.

        Worth the extra code path because the summary is the slowest part of an
        analysis by a wide margin — the evidence is ready in a third of the
        total time and then sits behind prose the reader has not asked to wait
        for. Streaming does not make it faster; it stops it blocking everything
        that was already finished.
        """
        self.ensure_configured()

        payload: dict[str, Any] = {
            "model": model or self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
            "stream": True,
        }

        lines = self.http.stream_lines(
            "POST", "/chat/completions", json_body=payload, operation="stream_summarize"
        )
        async for line in lines:
            chunk = _parse_sse_line(line)
            if chunk is not None:
                yield chunk


def _parse_sse_line(line: str) -> StreamChunk | None:
    """Turn one SSE line into a chunk, or None if it carries nothing.

    Tolerant on purpose: a keep-alive comment, a blank separator, or a payload
    whose shape shifts must not take down a summary that is already half
    delivered.
    """
    if not line.startswith(_SSE_DATA_PREFIX):
        return None

    body = line[len(_SSE_DATA_PREFIX) :].strip()
    if not body or body == _SSE_DONE:
        return None

    try:
        payload = json.loads(body)
    except ValueError:
        return None

    if not isinstance(payload, dict):
        return None

    model = payload.get("model")
    choices = payload.get("choices")
    text = ""

    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            delta = first.get("delta")
            if isinstance(delta, dict):
                content = delta.get("content")
                if isinstance(content, str):
                    text = content

    if not text and not isinstance(model, str):
        return None
    return StreamChunk(text=text, model=model if isinstance(model, str) else None)
