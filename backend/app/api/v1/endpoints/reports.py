"""`/api/v1/reports` — an execution rendered, and the files it produces.

Reports are **derived, not stored**. A stored report would drift from the
execution it describes the moment the builder improved, and there would be no
way to tell a report written by an old renderer from one written by the current
version. Building on read costs milliseconds over data already in the database
and guarantees the two agree.

Artifacts are derived the same way, which is what makes a download link stable:
the same execution always produces the same bytes, so a digest is meaningful
and a cached download stays valid.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Path, Query, Response

from app.api.auth import CurrentKey
from app.api.deps import ExecutionStoreDep
from app.core.exceptions import NotFoundError
from app.engine.analytics import Event, track
from app.engine.compare import compare
from app.engine.report import Report, build_report
from app.repositories.api_keys import KeyIdentity

router = APIRouter(tags=["reports"])


def _scope(identity: KeyIdentity) -> str | None:
    return None if identity.is_admin else identity.id


def _report_for(store: Any, execution_id: str, identity: KeyIdentity) -> Report:
    from app.api.v1.endpoints.execute import to_response

    result = store.get_result(execution_id, _scope(identity))
    if result is None:
        raise NotFoundError(
            f"No execution found with id '{execution_id}'.",
            details={"execution_id": execution_id},
            suggested_action="Check the id, or run the analysis again.",
        )

    return build_report(to_response(result).model_dump(mode="json"))


@router.get(
    "/{execution_id}",
    summary="An execution as a structured report",
    description=(
        "Every section the platform produces: summary, findings, warnings, "
        "what could not be established, recommendations, confidence, timeline, "
        "performance, and sources. Derived on read, so it always matches the "
        "execution rather than a snapshot taken when the renderer was older."
    ),
)
async def get_report(
    store: ExecutionStoreDep,
    identity: CurrentKey,
    execution_id: str = Path(description="Execution id."),
) -> dict[str, Any]:
    report = _report_for(store, execution_id, identity)
    await track(Event.REPORT_VIEWED, key_id=identity.id, sections=len(report.sections))
    return report.to_dict()


@router.get(
    "/{execution_id}/artifacts",
    summary="Every file this execution produces",
    description="Metadata only. Fetch one artifact to get its bytes.",
)
async def list_artifacts(
    store: ExecutionStoreDep,
    identity: CurrentKey,
    execution_id: str = Path(description="Execution id."),
) -> dict[str, Any]:
    report = _report_for(store, execution_id, identity)
    return {
        "execution_id": execution_id,
        "items": [artifact.to_dict() for artifact in report.artifacts],
        "total": len(report.artifacts),
    }


@router.get(
    "/{execution_id}/artifacts/{filename}",
    summary="Download one artifact",
    description=(
        "Returns the file itself with its own media type, not a JSON envelope "
        "around it — so a browser renders markdown, a spreadsheet opens the "
        "CSV, and an archive tool opens the bundle."
    ),
    response_class=Response,
)
async def download_artifact(
    store: ExecutionStoreDep,
    identity: CurrentKey,
    execution_id: str = Path(description="Execution id."),
    filename: str = Path(description="Artifact filename, e.g. report.md."),
    download: bool = Query(
        default=False,
        description="Force a save dialog rather than rendering in the browser.",
    ),
) -> Response:
    report = _report_for(store, execution_id, identity)

    artifact = next((a for a in report.artifacts if a.filename == filename), None)
    if artifact is None:
        raise NotFoundError(
            f"This execution produced no artifact named '{filename}'.",
            details={
                "execution_id": execution_id,
                "available": [a.filename for a in report.artifacts],
            },
        )

    await track(
        Event.ARTIFACT_DOWNLOADED,
        key_id=identity.id,
        kind=artifact.kind.value,
        size_bytes=artifact.size_bytes,
        inline=not download,
    )

    disposition = "attachment" if download else "inline"
    return Response(
        content=artifact.decoded(),
        media_type=artifact.media_type,
        headers={
            "content-disposition": f'{disposition}; filename="{artifact.filename}"',
            # The digest is over the content, so the same execution always
            # yields the same tag and a conditional request can be answered
            # without rebuilding anything.
            "etag": f'"{artifact.digest}"',
            "x-artifact-id": artifact.id,
        },
    )


@router.get(
    "/{execution_id}/compare/{other_id}",
    summary="Compare two subjects",
    description=(
        "Two different subjects at the same moment — token against token, site "
        "against site. Distinct from change detection, which compares one "
        "subject to its own past. "
        "Checks that only one side ran, or that either side could not "
        "establish, are listed as **not comparable** rather than scored: the "
        "difference there is in the coverage, not in the subjects. A verdict is "
        "withheld entirely when too little is shared."
    ),
)
async def compare_executions(
    store: ExecutionStoreDep,
    identity: CurrentKey,
    execution_id: str = Path(description="The first execution."),
    other_id: str = Path(description="The execution to compare it against."),
) -> dict[str, Any]:
    from app.api.v1.endpoints.execute import to_response

    scope = _scope(identity)
    pair: list[dict[str, Any]] = []
    for wanted in (execution_id, other_id):
        stored = store.get_result(wanted, scope)
        if stored is None:
            raise NotFoundError(
                f"No execution found with id '{wanted}'.",
                details={"execution_id": wanted},
                suggested_action="Both executions must exist and belong to this key.",
            )
        pair.append(to_response(stored).model_dump(mode="json"))

    comparison = compare(pair[0], pair[1])
    await track(
        Event.COMPARISON_RUN,
        key_id=identity.id,
        shared_checks=len(comparison.shared),
        incomparable=len(comparison.not_comparable),
        # Whether a verdict was reachable is the interesting product question:
        # too many withheld verdicts means subjects are not being checked
        # consistently enough to compare.
        verdict=comparison.verdict or "withheld",
    )
    return comparison.to_dict()
