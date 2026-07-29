"""Outbound service clients.

Routes never call an external API directly — everything goes through these
classes, which share one resilient transport (`app.services.http`).
"""

from app.services.base import BaseServiceClient
from app.services.blockscout import BlockscoutClient
from app.services.codex import CodexClient
from app.services.http import ResilientHTTPClient, RetryPolicy, TimeoutPolicy
from app.services.openrouter import OpenRouterClient
from app.services.registry import ServiceRegistry, get_service_registry
from app.services.rpc import RPCClient

__all__ = [
    "BaseServiceClient",
    "BlockscoutClient",
    "CodexClient",
    "OpenRouterClient",
    "RPCClient",
    "ResilientHTTPClient",
    "RetryPolicy",
    "ServiceRegistry",
    "TimeoutPolicy",
    "get_service_registry",
]
