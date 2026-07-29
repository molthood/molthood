"""Shared schema building blocks."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class SchemaBase(BaseModel):
    """Base for every schema in the application."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        str_strip_whitespace=True,
        extra="forbid",
    )


class PageMeta(SchemaBase):
    total: int = Field(description="Total items matching the query.")
    page: int = Field(description="1-indexed page number.")
    page_size: int = Field(description="Items per page.")
    pages: int = Field(description="Total number of pages.")

    @classmethod
    def build(cls, *, total: int, page: int, page_size: int) -> PageMeta:
        pages = max(1, -(-total // page_size))  # ceiling division
        return cls(total=total, page=page, page_size=page_size, pages=pages)


class Page(SchemaBase, Generic[T]):
    """Envelope for every list endpoint."""

    items: list[T]
    meta: PageMeta


class ErrorDetail(SchemaBase):
    code: str = Field(description="Machine-readable error code.")
    message: str = Field(description="What went wrong.")
    suggested_action: str = Field(description="What the caller should do about it.")
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(SchemaBase):
    """The single error shape returned by every failure path."""

    error: ErrorDetail
    request_id: str | None = None
