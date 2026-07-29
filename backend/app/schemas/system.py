"""Schemas for the health, version, and status endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import SchemaBase

DependencyState = Literal["live", "not_configured", "unavailable", "configured"]


class HealthResponse(SchemaBase):
    status: Literal["ok"] = "ok"
    uptime_seconds: float = Field(description="Seconds since process start.")
    timestamp: datetime


class VersionResponse(SchemaBase):
    name: str
    version: str
    environment: str
    api_prefix: str
    python_version: str


class DependencyStatus(SchemaBase):
    name: str
    state: DependencyState
    detail: str


class ComponentStatus(SchemaBase):
    name: str
    ready: bool
    detail: str


class WebCapability(SchemaBase):
    """A configured web-intelligence source. Reported, not probed."""

    name: str
    endpoint: str
    requires_key: bool
    detail: str


class StatusResponse(SchemaBase):
    """A fuller picture than `/health`: what exists and what is wired."""

    status: Literal["ok", "degraded"]
    environment: str
    version: str
    uptime_seconds: float
    timestamp: datetime
    agents_registered: int
    pipelines_registered: int
    components: list[ComponentStatus]
    dependencies: list[DependencyStatus]
    #: Listed from configuration rather than health-probed — crt.sh alone can
    #: take 30s, which would make this endpoint unusable.
    web_intelligence: list[WebCapability] = Field(default_factory=list)
