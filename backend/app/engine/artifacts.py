"""Artifacts: the files an execution produces.

An artifact is something a reader can take away — a markdown report, the
evidence as CSV, a chart, a bundle of all of it. Findings answer "what did you
learn"; artifacts answer "give me that in a form I can use".

Three properties are load-bearing:

- **Content is addressed by digest.** Two executions that produce byte-identical
  output share one stored blob, and a download can be cached forever because
  the digest changes when the bytes do.
- **Bytes are never guessed.** An artifact carries its own media type and
  encoding, so a caller never infers "this is probably UTF-8 text" from a file
  extension and never hands a browser a PNG labelled as JSON.
- **Generation cannot fail an execution.** A report that could not be rendered
  is a missing artifact with a reason attached, exactly as an unrunnable check
  is a finding with a reason. It is never an exception that loses the analysis
  the artifact was describing.
"""

from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import zipfile
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from app.utils.ids import prefixed_id
from app.utils.time import utcnow


class ArtifactKind(StrEnum):
    """What an artifact *is*, independent of how it is encoded."""

    REPORT = "report"
    DATA = "data"
    CHART = "chart"
    IMAGE = "image"
    TABLE = "table"
    BUNDLE = "bundle"
    LOG = "log"


#: Media type to whether the payload is text. Binary artifacts are stored
#: base64-encoded, and this is the single place that decides which is which —
#: a caller inferring it from the extension gets it wrong for `.md` vs `.png`
#: exactly once, in production, on a download nobody can open.
_TEXT_TYPES = frozenset(
    {
        "text/markdown",
        "text/plain",
        "text/csv",
        "application/json",
        "text/html",
        "image/svg+xml",
    }
)


@dataclass(frozen=True, slots=True)
class Artifact:
    """One produced file, with everything needed to serve it."""

    id: str
    execution_id: str | None
    kind: ArtifactKind
    #: The name a download is offered under.
    filename: str
    media_type: str
    #: Text payloads verbatim; binary payloads base64. `is_text` says which.
    content: str
    size_bytes: int
    #: sha256 of the *decoded* bytes, so it identifies content rather than
    #: encoding — the same PNG has one digest whether stored raw or base64.
    digest: str
    label: str
    description: str | None = None
    created_at: str = field(default_factory=lambda: utcnow().isoformat())

    @property
    def is_text(self) -> bool:
        return self.media_type in _TEXT_TYPES

    def decoded(self) -> bytes:
        return (
            self.content.encode("utf-8")
            if self.is_text
            else base64.b64decode(self.content)
        )

    def to_dict(self, *, include_content: bool = False) -> dict[str, Any]:
        """Metadata by default.

        A list of twenty artifacts must not carry twenty payloads: the console
        renders names and sizes, and fetches bytes only when someone asks for
        them.
        """
        payload: dict[str, Any] = {
            "id": self.id,
            "execution_id": self.execution_id,
            "kind": self.kind.value,
            "filename": self.filename,
            "media_type": self.media_type,
            "size_bytes": self.size_bytes,
            "digest": self.digest,
            "label": self.label,
            "description": self.description,
            "is_text": self.is_text,
            "created_at": self.created_at,
        }
        if include_content:
            payload["content"] = self.content
        return payload


def build(
    *,
    kind: ArtifactKind,
    filename: str,
    media_type: str,
    data: str | bytes,
    label: str,
    description: str | None = None,
    execution_id: str | None = None,
) -> Artifact:
    """Create an artifact, encoding by media type rather than by guesswork."""
    raw = data.encode("utf-8") if isinstance(data, str) else data
    is_text = media_type in _TEXT_TYPES
    content = (
        raw.decode("utf-8", errors="replace")
        if is_text
        else base64.b64encode(raw).decode()
    )

    return Artifact(
        id=prefixed_id("art"),
        execution_id=execution_id,
        kind=kind,
        filename=filename,
        media_type=media_type,
        content=content,
        size_bytes=len(raw),
        digest=hashlib.sha256(raw).hexdigest(),
        label=label,
        description=description,
    )


# --- Builders ---------------------------------------------------------------


def markdown_report(
    title: str, sections: list[tuple[str, str]], **kwargs: Any
) -> Artifact:
    """A readable report. The format people actually paste into somewhere else."""
    lines = [f"# {title}", ""]
    for heading, body in sections:
        if not body.strip():
            continue
        lines.extend([f"## {heading}", "", body.strip(), ""])

    return build(
        kind=ArtifactKind.REPORT,
        filename="report.md",
        media_type="text/markdown",
        data="\n".join(lines).strip() + "\n",
        label="Report",
        description="The full analysis as markdown.",
        **kwargs,
    )


def json_document(name: str, payload: Any, *, label: str, **kwargs: Any) -> Artifact:
    return build(
        kind=ArtifactKind.DATA,
        filename=f"{name}.json",
        media_type="application/json",
        # `default=str` so a datetime that reached this far is serialised
        # rather than raising and losing the whole artifact.
        data=json.dumps(payload, indent=2, default=str),
        label=label,
        **kwargs,
    )


def csv_table(
    name: str, rows: list[dict[str, Any]], *, label: str, **kwargs: Any
) -> Artifact:
    """Rows to CSV, with the union of every key as the header.

    Union rather than the first row's keys: records that differ in shape are
    normal — a finding with a `reason` and one without — and taking the first
    row as authoritative silently drops every column it happens to lack.
    """
    columns: list[str] = []
    for row in rows:
        for key in row:
            if key not in columns:
                columns.append(key)

    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer, fieldnames=columns or ["value"], extrasaction="ignore"
    )
    writer.writeheader()
    for row in rows:
        writer.writerow({column: _flatten(row.get(column)) for column in columns})

    return build(
        kind=ArtifactKind.TABLE,
        filename=f"{name}.csv",
        media_type="text/csv",
        data=buffer.getvalue(),
        label=label,
        **kwargs,
    )


def _flatten(value: Any) -> Any:
    """CSV holds text. Nested values are JSON-encoded rather than stringified.

    `str(dict)` produces Python repr with single quotes, which no spreadsheet
    and no parser reads back.
    """
    if value is None or isinstance(value, str | int | float | bool):
        return value
    return json.dumps(value, default=str)


def bundle(
    artifacts: list[Artifact], *, label: str = "Everything", **kwargs: Any
) -> Artifact:
    """Every artifact in one ZIP.

    Deterministic: entries are sorted and timestamps fixed, so the same inputs
    produce the same bytes — which is what makes the digest meaningful and lets
    a re-download be recognised as unchanged.
    """
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for item in sorted(artifacts, key=lambda a: a.filename):
            info = zipfile.ZipInfo(item.filename, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, item.decoded())

    return build(
        kind=ArtifactKind.BUNDLE,
        filename="molthood-export.zip",
        media_type="application/zip",
        data=buffer.getvalue(),
        label=label,
        description=f"{len(artifacts)} file(s).",
        **kwargs,
    )
