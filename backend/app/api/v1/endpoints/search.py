"""`/api/v1/search` — one query across everything this key has done.

Searched live over stored executions rather than against an index. That is a
deliberate trade at this size: an index is another thing that can be stale, and
a search that quietly returns yesterday's data is worse than one that takes an
extra fifty milliseconds. When the row count makes this slow, the fix is a real
index — not a cache in front of a scan, which would reintroduce staleness with
none of the speed.

Scoped to the caller's key, exactly as execution history is. An execution
records the address somebody asked about, and search is not a way around that.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.api.auth import CurrentKey
from app.api.deps import ExecutionStoreDep
from app.engine.labels import describe_source
from app.repositories.api_keys import KeyIdentity

router = APIRouter(tags=["search"])

#: Results per group. Enough to find what you meant, few enough that the
#: response stays readable rather than becoming a second search problem.
GROUP_LIMIT = 10


def _scope(identity: KeyIdentity) -> str | None:
    return None if identity.is_admin else identity.id


def _score(haystack: str, terms: list[str]) -> int:
    """How well one record matches. Zero means it does not.

    Every term must appear — an OR search over a short query returns almost
    everything, which is the same as returning nothing useful.
    """
    total = 0
    for term in terms:
        if term not in haystack:
            return 0
        total += haystack.count(term)
    return total


@router.get(
    "",
    summary="Search everything you have run",
    description=(
        "Executions, subjects, and the files they produced. Grouped by kind so "
        "a match on an address and a match on a summary are not shuffled "
        "together. Scoped to your key."
    ),
)
async def search(
    store: ExecutionStoreDep,
    identity: CurrentKey,
    q: str = Query(description="What to look for.", min_length=1),
) -> dict[str, Any]:
    terms = [term for term in q.lower().split() if term]
    owner = _scope(identity)

    if not terms:
        return {"query": q, "groups": [], "total": 0}

    executions: list[dict[str, Any]] = []
    for record in store.all(owner):
        haystack = " ".join(
            str(part).lower()
            for part in (
                record.request,
                record.address,
                record.target,
                record.summary,
                record.status,
                " ".join(record.agents_used or []),
            )
            if part
        )
        weight = _score(haystack, terms)
        if weight:
            executions.append(
                {
                    "id": record.id,
                    "target": record.target,
                    "address": record.address,
                    "request": record.request[:160],
                    "status": record.status,
                    # Summaries are model prose and can quote a supplier that
                    # an older run learned before facts were redacted.
                    "summary": (
                        describe_source(record.summary[:200]) if record.summary else None
                    ),
                    "created_at": record.created_at.isoformat(),
                    "weight": weight,
                }
            )

    subjects: list[dict[str, Any]] = []
    for subject in store.subjects(owner):
        haystack = " ".join(
            str(part).lower()
            for part in (subject.get("target"), subject.get("address"))
            if part
        )
        weight = _score(haystack, terms)
        if weight:
            subjects.append({**subject, "weight": weight})

    executions.sort(key=lambda item: (-item["weight"], item["created_at"]), reverse=False)
    subjects.sort(key=lambda item: -item["weight"])

    groups = [
        {
            "kind": "executions",
            "label": "Executions",
            "items": executions[:GROUP_LIMIT],
            # The count is of everything that matched, not of what is shown.
            # A reader who sees ten results needs to know whether that is all
            # of them or the first page of two hundred.
            "total": len(executions),
        },
        {
            "kind": "subjects",
            "label": "Subjects",
            "items": subjects[:GROUP_LIMIT],
            "total": len(subjects),
        },
    ]

    return {
        "query": q,
        "groups": [group for group in groups if group["total"]],
        "total": len(executions) + len(subjects),
    }
