"""Artifacts and the report builder.

Both are pure functions over a finished execution, so every test here runs
offline. The theme is the same one that runs through the codebase: a section
that could not be filled must not read like a section that was filled and came
back clean.
"""

from __future__ import annotations

import base64
import io
import json
import zipfile

from app.engine.artifacts import (
    ArtifactKind,
    build,
    bundle,
    csv_table,
    json_document,
    markdown_report,
)
from app.engine.report import build_report


def _execution(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "execution_id": "ex_test",
        "target": "token",
        "address": "0x1234567890abcdef1234",
        "status": "succeeded",
        "summary": "A written summary.",
        "summary_status": "generated",
        "execution_time_ms": 8000,
        "evidence": [],
        "sources": [],
        "stages": [],
        "facts": {},
    }
    base.update(overrides)
    return base


# --- Artifacts --------------------------------------------------------------


def test_text_is_stored_verbatim_and_binary_is_encoded() -> None:
    """Encoding follows the media type, never the file extension."""
    text = build(
        kind=ArtifactKind.REPORT,
        filename="a.md",
        media_type="text/markdown",
        data="# hi",
        label="t",
    )
    binary = build(
        kind=ArtifactKind.IMAGE,
        filename="a.png",
        media_type="image/png",
        data=b"\x89PNG\r\n",
        label="b",
    )

    assert text.is_text and text.content == "# hi"
    assert not binary.is_text
    assert base64.b64decode(binary.content) == b"\x89PNG\r\n"
    assert binary.decoded() == b"\x89PNG\r\n"


def test_digest_identifies_content_not_encoding() -> None:
    """The same bytes have one digest whether stored raw or base64."""
    payload = b"identical bytes"
    as_text = build(
        kind=ArtifactKind.DATA,
        filename="a.txt",
        media_type="text/plain",
        data=payload,
        label="a",
    )
    as_binary = build(
        kind=ArtifactKind.DATA,
        filename="a.bin",
        media_type="application/octet-stream",
        data=payload,
        label="b",
    )

    assert as_text.digest == as_binary.digest
    assert as_text.size_bytes == as_binary.size_bytes == len(payload)


def test_listing_an_artifact_does_not_carry_its_payload() -> None:
    """Twenty artifacts in a list must not mean twenty payloads over the wire."""
    artifact = json_document("x", {"a": 1}, label="X")

    assert "content" not in artifact.to_dict()
    assert "content" in artifact.to_dict(include_content=True)


def test_csv_header_is_the_union_of_every_row() -> None:
    """Records differ in shape — a finding with a reason and one without.

    Taking the first row as authoritative silently drops every later column.
    """
    artifact = csv_table(
        "rows",
        [{"a": 1}, {"a": 2, "b": "later"}],
        label="Rows",
    )

    header = artifact.content.splitlines()[0]
    assert set(header.strip().split(",")) == {"a", "b"}


def test_nested_values_survive_csv_as_json() -> None:
    """`str(dict)` produces Python repr, which no parser reads back."""
    artifact = csv_table("rows", [{"tags": ["x", "y"]}], label="Rows")

    body = artifact.content.splitlines()[1]
    assert json.loads(body.strip().strip('"').replace('""', '"')) == ["x", "y"]


def test_a_bundle_is_deterministic() -> None:
    """Same inputs, same bytes — which is what makes the digest meaningful."""
    items = [
        json_document("b", {"k": 2}, label="B"),
        json_document("a", {"k": 1}, label="A"),
    ]

    first = bundle(items)
    second = bundle(list(reversed(items)))

    assert first.digest == second.digest

    with zipfile.ZipFile(io.BytesIO(first.decoded())) as archive:
        assert archive.namelist() == ["a.json", "b.json"]


def test_markdown_report_omits_empty_sections() -> None:
    artifact = markdown_report("Title", [("Kept", "body"), ("Dropped", "   ")])

    assert "## Kept" in artifact.content
    assert "## Dropped" not in artifact.content


# --- Report -----------------------------------------------------------------


def test_warnings_and_unknowns_are_printed_even_when_empty() -> None:
    """The one deliberate exception to omitting empty sections.

    "we checked and found nothing" and "we did not look" are the two things
    this platform exists to keep apart, so neither may be silence.
    """
    report = build_report(_execution())
    headings = [heading for heading, _ in report.sections]

    assert "Warnings" in headings
    assert "Not established" in headings


def test_an_unknown_finding_is_never_reported_as_negative() -> None:
    report = build_report(
        _execution(
            evidence=[
                {
                    "label": "Contract verified",
                    "state": "unknown",
                    "reason": "No published source.",
                }
            ]
        )
    )
    body = dict(report.sections)["Not established"]

    assert "not** negative results" in body
    assert "No published source." in body


def test_a_score_with_missing_checks_is_reported_as_a_ceiling() -> None:
    report = build_report(
        _execution(
            facts={"risk": {"score": 88, "level": "low", "signals": []}},
            evidence=[{"label": "x", "state": "unknown", "reason": "r"}],
        )
    )
    summary = dict(report.sections)["Executive summary"]

    assert "88/100 (low)" in summary
    assert "higher is safer" in summary
    assert "ceiling" in summary


def test_confidence_is_unknown_rather_than_low_when_nothing_ran() -> None:
    report = build_report(_execution(evidence=[]))

    assert "**unknown**" in dict(report.sections)["Confidence"]


def test_confidence_falls_when_most_checks_could_not_run() -> None:
    report = build_report(
        _execution(
            evidence=[{"label": str(i), "state": "unknown"} for i in range(8)]
            + [{"label": "ok", "state": "confirmed"}]
        )
    )

    assert "**low**" in dict(report.sections)["Confidence"]


def test_recommendations_come_from_evidence_not_from_a_template() -> None:
    """Advice nobody's data produced is filler, and filler here is worse than
    silence."""
    empty = build_report(_execution())
    assert "Recommendations" not in dict(empty.sections)

    with_unknowns = build_report(
        _execution(evidence=[{"label": "x", "state": "unknown", "reason": "r"}])
    )
    assert "Re-run later" in dict(with_unknowns.sections)["Recommendations"]


def test_every_execution_produces_downloadable_artifacts() -> None:
    report = build_report(
        _execution(
            evidence=[{"label": "x", "state": "confirmed", "value": 1}],
            sources=[{"label": "Chain explorer", "url": "https://example.test/a"}],
        )
    )
    names = [artifact.filename for artifact in report.artifacts]

    assert "report.md" in names
    assert "evidence.csv" in names
    assert "sources.csv" in names
    assert "execution.json" in names
    assert "molthood-export.zip" in names


def test_the_bundle_never_contains_itself() -> None:
    report = build_report(_execution())
    archive = next(a for a in report.artifacts if a.kind is ArtifactKind.BUNDLE)

    with zipfile.ZipFile(io.BytesIO(archive.decoded())) as zipped:
        assert "molthood-export.zip" not in zipped.namelist()


def test_a_missing_summary_says_why() -> None:
    report = build_report(_execution(summary=None, summary_status="not_configured"))

    assert "not configured" in dict(report.sections)["Executive summary"]
