"""Application exception hierarchy.

Every error raised deliberately by application code inherits from
`MolthoodError`, so the handler in `app.core.errors` can render one consistent
envelope regardless of which layer failed.

Each error carries a machine-readable `code`, a human `message`, and a
`suggested_action` telling the caller what to do about it.
"""

from __future__ import annotations

from typing import Any


class MolthoodError(Exception):
    """Base class for every deliberate application error."""

    status_code: int = 500
    code: str = "internal_error"
    message: str = "An unexpected error occurred."
    suggested_action: str = "Retry the request. If it persists, contact support."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        status_code: int | None = None,
        suggested_action: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message or self.message
        self.code = code or self.code
        self.status_code = status_code or self.status_code
        self.suggested_action = suggested_action or self.suggested_action
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "suggested_action": self.suggested_action,
            "details": self.details,
        }


class NotFoundError(MolthoodError):
    status_code = 404
    code = "not_found"
    message = "The requested resource does not exist."
    suggested_action = "Check the identifier and try again."


class ValidationError(MolthoodError):
    status_code = 422
    code = "validation_error"
    message = "The request payload failed validation."
    suggested_action = "Correct the highlighted fields and resubmit."


class ConflictError(MolthoodError):
    status_code = 409
    code = "conflict"
    message = "The request conflicts with the current state."
    suggested_action = "Refetch the resource and retry with current state."


class NotImplementedYetError(MolthoodError):
    """Raised by architecture that exists but has no behaviour yet."""

    status_code = 501
    code = "not_implemented"
    message = "This capability is not implemented yet."
    suggested_action = "This ships in a later phase; no action is available now."


class ConfigurationError(MolthoodError):
    """A required credential or setting is missing.

    Distinct from a downstream outage: nothing is wrong with the dependency,
    the deployment simply has not been given what it needs to reach it.
    """

    status_code = 503
    code = "service_not_configured"
    message = "A required service credential is not configured."
    suggested_action = "Set the missing environment variable and restart the service."


# --- Authentication and limits ----------------------------------------------


class AuthenticationError(MolthoodError):
    """No usable credential was presented."""

    status_code = 401
    code = "authentication_required"
    message = "This endpoint requires an API key."
    suggested_action = (
        "Send `Authorization: Bearer <key>`. Create one with POST /api/v1/keys."
    )


class RateLimitError(MolthoodError):
    """Too many requests in too short a window.

    Distinct from `QuotaExceededError`: this is about pace and clears in
    seconds, so the caller should simply slow down and retry.
    """

    status_code = 429
    code = "rate_limited"
    message = "Too many requests."
    suggested_action = "Wait for the interval in `details.retry_after` and retry."


class QuotaExceededError(MolthoodError):
    """The key has spent its allowance for the period.

    Separate from a rate limit because the remedy is different: waiting a few
    seconds will not help, and telling the caller to retry would be a lie.
    """

    status_code = 429
    code = "quota_exceeded"
    message = "This key has used its analysis quota for today."
    suggested_action = (
        "Analyses cost real inference credit, so each key has a daily cap. "
        "Wait for the reset in `details.resets_at`, or request a higher limit."
    )


# --- Downstream service failures -------------------------------------------


class ServiceError(MolthoodError):
    """Base for every failure originating in an external dependency."""

    status_code = 502
    code = "service_error"
    message = "A downstream service returned an unexpected response."
    suggested_action = "Retry shortly. The upstream service may be degraded."


class ServiceTimeoutError(ServiceError):
    status_code = 504
    code = "service_timeout"
    message = "A downstream service did not respond in time."
    suggested_action = "Retry. If it persists, the upstream service is slow or down."


class ServiceUnavailableError(ServiceError):
    status_code = 503
    code = "service_unavailable"
    message = "A downstream dependency is unavailable."
    suggested_action = "Retry in a few seconds."


class ServiceRateLimitError(ServiceError):
    status_code = 429
    code = "service_rate_limited"
    message = "A downstream service rate-limited this request."
    suggested_action = "Back off and retry after the interval in `details.retry_after`."


class ServiceAuthError(ServiceError):
    status_code = 502
    code = "service_auth_failed"
    message = "A downstream service rejected our credentials."
    suggested_action = "Verify the configured API key for this service."


class ServiceResponseError(ServiceError):
    """The call succeeded at the transport level but the body was unusable."""

    status_code = 502
    code = "service_invalid_response"
    message = "A downstream service returned a response we could not parse."
    suggested_action = "Retry. If it persists, the upstream response shape changed."


class UnresolvableHostError(ValidationError):
    """A hostname has no DNS records at all.

    Deliberately distinct from the SSRF refusal it used to be folded into.
    A domain that does not exist is a fact about the subject — when a token
    names its official website and that domain is NXDOMAIN, that is the most
    useful thing an analysis can report, not a policy violation.
    """

    code = "unresolvable_host"
    message = "That domain does not resolve."


class UpstreamNotFoundError(NotFoundError):
    """The dependency answered correctly: the resource does not exist."""

    code = "upstream_not_found"
    message = "The requested resource was not found on chain."
    suggested_action = "Verify the address or identifier is correct for this network."


# --- Engine and agents ------------------------------------------------------


class EngineError(MolthoodError):
    status_code = 500
    code = "engine_error"
    message = "The execution engine failed to process the request."
    suggested_action = "Retry the execution. Check the logs for the failing stage."


class AgentError(MolthoodError):
    status_code = 500
    code = "agent_error"
    message = "An agent failed while handling its task."
    suggested_action = "Retry. If it persists, the agent's dependencies may be down."


class AgentNotRegisteredError(NotFoundError):
    code = "agent_not_registered"
    message = "No agent is registered under that identifier."
    suggested_action = "Call GET /api/v1/agents for the available agents."


class UnroutableRequestError(ValidationError):
    """The router could not decide what the request is asking for."""

    status_code = 422
    code = "unroutable_request"
    message = "The request could not be matched to an analysis target."
    suggested_action = (
        "Include a 0x address, or state the target explicitly "
        "(token, wallet, contract, or project)."
    )
