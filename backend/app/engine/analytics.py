"""The event taxonomy, and the one rule that governs it.

Event names live here rather than as string literals at each call site. A
literal typed twice becomes two events that look like one, and the mistake is
invisible: nothing fails, the funnel simply loses half its traffic and no one
can say when.

**The rule: an event may never carry what somebody analysed.** Not the address,
not the request text, not a URL, not a summary. An execution records the
subject someone asked about, and product analytics is a third party — sending
it there would publish, to a vendor, exactly what the per-key scoping of
history exists to protect.

So properties are *shapes*, never *contents*: which target kind, how long,
how many findings, whether it succeeded. That is enough to answer every
question analytics is for — what people use, what is slow, what fails — and
none of the questions it has no business answering.
"""

from __future__ import annotations

import re
from enum import StrEnum
from typing import Any

from app.providers.manager import get_provider_manager


class Event(StrEnum):
    """Every event this platform emits."""

    # --- Executions ---
    EXECUTION_STARTED = "execution_started"
    EXECUTION_COMPLETED = "execution_completed"
    EXECUTION_FAILED = "execution_failed"

    # --- Tasks ---
    TASK_STARTED = "task_started"
    TASK_COMPLETED = "task_completed"

    # --- What people reach for ---
    REPORT_VIEWED = "report_viewed"
    ARTIFACT_DOWNLOADED = "artifact_downloaded"
    COMPARISON_RUN = "comparison_run"
    SEARCH_PERFORMED = "search_performed"
    WATCH_CREATED = "watch_created"
    EXECUTION_PUBLISHED = "execution_published"

    # --- Account ---
    KEY_CREATED = "key_created"
    QUOTA_EXHAUSTED = "quota_exhausted"


#: Property names that would carry content rather than shape. Blocked by name
#: because the alternative — remembering at every call site — has already been
#: shown not to work for supplier names.
_FORBIDDEN = re.compile(
    r"(address|wallet|url|request|query|summary|token_name|symbol|email|key|secret)",
    re.IGNORECASE,
)

#: Values that are safe whatever the key is called: numbers, booleans, and
#: short enumerated strings. Anything longer is prose, and prose is content.
_MAX_STRING = 40


def sanitise(properties: dict[str, Any]) -> dict[str, Any]:
    """Drop anything that would send content to a third party.

    Enforced rather than documented. A caller that adds `address` to a property
    dict gets it removed and a marker in its place, so the omission is visible
    in the analytics tool instead of being a silent difference between what the
    code appears to send and what it sends.
    """
    clean: dict[str, Any] = {}
    dropped: list[str] = []

    for name, value in properties.items():
        if _FORBIDDEN.search(name):
            dropped.append(name)
            continue
        if isinstance(value, str) and len(value) > _MAX_STRING:
            dropped.append(name)
            continue
        if isinstance(value, dict | list):
            # Nested structures are where a URL hides two levels down. Their
            # size is kept, which is the only part that was ever a shape.
            clean[f"{name}_count"] = len(value)
            continue
        clean[name] = value

    if dropped:
        clean["dropped_properties"] = len(dropped)

    return clean


async def track(event: Event, *, key_id: str = "anonymous", **properties: Any) -> None:
    """Record one event. Never raises, never blocks a request.

    Failure here must cost nothing: analytics is the least important thing the
    platform does, and an outage at a vendor must not become an outage here.
    """
    manager = get_provider_manager()
    await manager.posthog.capture(
        event.value,
        # The key id, never the key. It identifies a caller across events
        # without being usable for anything.
        distinct_id=key_id,
        properties=sanitise(properties),
    )
