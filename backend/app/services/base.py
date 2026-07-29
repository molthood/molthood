"""Base class for outbound service clients.

Every client owns a `ResilientHTTPClient`, so retries, backoff, timeouts,
structured errors, and logging behave identically across integrations. Clients
add only the shape of their own API.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, ClassVar

from pydantic import SecretStr

from app.core.exceptions import ConfigurationError
from app.logging import get_logger
from app.models.enums import ServiceName
from app.services.http import ResilientHTTPClient, RetryPolicy, TimeoutPolicy

logger = get_logger(__name__)


class BaseServiceClient(ABC):
    """Shared lifecycle, configuration checks, and transport for integrations."""

    service: ClassVar[ServiceName]
    #: Operations this client exposes. Surfaced by `/api/v1/status`.
    operations: ClassVar[tuple[str, ...]] = ()
    #: Environment variable a deployment must set for this client to work.
    api_key_env: ClassVar[str | None] = None

    def __init__(
        self,
        *,
        base_url: str,
        api_key: SecretStr | None = None,
        retry: RetryPolicy | None = None,
        timeout: TimeoutPolicy | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._http = ResilientHTTPClient(
            service=self.service.value,
            base_url=self.base_url,
            headers=self._auth_headers(),
            retry=retry,
            timeout=timeout,
        )

    # --- configuration ---

    @property
    def requires_api_key(self) -> bool:
        return self.api_key_env is not None

    @property
    def is_configured(self) -> bool:
        """True when the client has everything it needs to be used."""
        if not self.base_url:
            return False
        return not (self.requires_api_key and self._api_key is None)

    def ensure_configured(self) -> None:
        """Fail loudly and specifically rather than calling with no credential."""
        if self.is_configured:
            return
        raise ConfigurationError(
            f"{self.service.value} is not configured.",
            details={"service": self.service.value, "missing": self.api_key_env},
            suggested_action=(
                f"Set {self.api_key_env} in the environment and restart the service."
                if self.api_key_env
                else "Set the base URL for this service and restart."
            ),
        )

    def _auth_headers(self) -> dict[str, str]:
        """Credentials live only in headers — never in logs, URLs, or responses."""
        if self._api_key is None:
            return {}
        return {"authorization": f"Bearer {self._api_key.get_secret_value()}"}

    # --- transport ---

    @property
    def http(self) -> ResilientHTTPClient:
        return self._http

    async def aclose(self) -> None:
        await self._http.aclose()

    # --- introspection ---

    @abstractmethod
    async def ping(self) -> dict[str, Any]:
        """Cheap liveness probe against the real dependency."""

    def describe(self) -> dict[str, Any]:
        return {
            "service": self.service.value,
            "base_url": self.base_url,
            "configured": self.is_configured,
            "requires_api_key": self.requires_api_key,
            "api_key_env": self.api_key_env,
            # Never leak the key itself — only whether one is present.
            "api_key_present": self._api_key is not None,
            "operations": list(self.operations),
        }
