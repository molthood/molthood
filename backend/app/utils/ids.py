"""Identifier helpers."""

from __future__ import annotations

import uuid


def new_id() -> str:
    """32-character hex id, matching the ORM primary key format."""
    return uuid.uuid4().hex


def prefixed_id(prefix: str, *, length: int = 6) -> str:
    """Human-scannable id such as `exe_9f4c21`."""
    return f"{prefix}_{uuid.uuid4().hex[:length]}"


def short_id(value: str, *, length: int = 8) -> str:
    return value[:length]
