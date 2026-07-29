"""Pagination helpers shared by every list endpoint."""

from __future__ import annotations

from dataclasses import dataclass

from app.core.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE


@dataclass(frozen=True, slots=True)
class Pagination:
    page: int = 1
    page_size: int = DEFAULT_PAGE_SIZE

    def __post_init__(self) -> None:
        if self.page < 1:
            raise ValueError("page must be >= 1")
        if not 1 <= self.page_size <= MAX_PAGE_SIZE:
            raise ValueError(f"page_size must be between 1 and {MAX_PAGE_SIZE}")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size
