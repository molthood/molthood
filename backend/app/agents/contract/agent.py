"""Contract Agent — verification and source analysis from live chain data."""

from __future__ import annotations

import asyncio
from typing import Any, ClassVar, Final

from app.agents.base import AgentMetadata, BaseAgent
from app.agents.contract.powers import privileged_powers
from app.config import get_settings
from app.core.exceptions import UpstreamNotFoundError
from app.engine.context import ExecutionContext
from app.engine.result import AgentResult, Finding
from app.engine.task import Task
from app.logging import get_logger
from app.models.enums import AgentKind
from app.services.models import from_wei

logger = get_logger(__name__)

REQUIRED_SERVICES: Final[tuple[str, ...]] = ("blockscout", "robinhood_rpc")

#: Where ownership goes when it is renounced.
ZERO_ADDRESS: Final = "0x" + "0" * 40

#: Source-level patterns worth surfacing. Presence is a fact, not a verdict —
#: the Risk Agent decides what any of it means.
SOURCE_MARKERS: Final[tuple[tuple[str, str], ...]] = (
    ("selfdestruct", "Contains selfdestruct"),
    ("delegatecall", "Uses delegatecall"),
    ("onlyowner", "Has owner-gated functions"),
    ("_mint(", "Contains a mint path"),
    ("pause", "Has pause functionality"),
    ("upgradeto", "Appears upgradeable"),
    ("blacklist", "References a blacklist"),
)


class ContractAgent(BaseAgent):
    """Reads verification status, compiler settings, and source markers."""

    metadata: ClassVar[AgentMetadata] = AgentMetadata(
        kind=AgentKind.CONTRACT,
        name="Contract Agent",
        description=(
            "Reads, drafts, and reviews contracts on chain, flagging "
            "deviations from known-good patterns."
        ),
        version="0.4.0",
        capabilities=("static_analysis", "pattern_diffing", "interface_generation"),
    )

    implemented: ClassVar[bool] = True

    async def run(self, task: Task, context: ExecutionContext) -> AgentResult:
        address = context.routing.address if context.routing else None
        if address is None:
            return AgentResult.failure("Contract analysis requires an address.")

        blockscout = context.services.blockscout
        rpc = context.services.rpc

        contract, address_info, code = await asyncio.gather(
            blockscout.get_contract(address),
            blockscout.get_address(address),
            rpc.get_code(address),
            return_exceptions=True,
        )
        context.note_service("blockscout")
        context.note_service("robinhood_rpc")

        # Only give up if both explorer reads failed; a missing verification
        # record alone is itself a finding.
        if isinstance(contract, BaseException) and isinstance(
            address_info, BaseException
        ):
            raise contract

        facts: dict[str, Any] = {"address": address}

        if not isinstance(code, BaseException):
            facts["is_contract"] = len(code) > 2
            facts["bytecode_size_bytes"] = max(0, (len(code) - 2) // 2)

        if not isinstance(address_info, BaseException):
            facts["is_scam_flagged"] = address_info.is_scam
            facts["explorer_name"] = address_info.name
            facts["creator"] = address_info.creator_address_hash
            facts["creation_tx"] = address_info.creation_transaction_hash
            facts["native_balance"] = from_wei(address_info.coin_balance)
            facts["proxy_type"] = address_info.proxy_type

        markers: list[str] = []
        #: Set only when verification status was actually established. Left
        #: None when the explorer could not be reached, so a failed request is
        #: never recorded as "this contract is unverified".
        verification_unknown: str | None = None

        if not isinstance(contract, BaseException):
            source = contract.source_code or ""
            # A record with no source and a null flag is the explorer saying it
            # has nothing, not that it could not answer. It returns HTTP 200
            # for this — so treating null as "unknown" left the contract with
            # no verification finding at all, and an unverified token read the
            # same as a verified one. Caught on JOHN, which is unverified and
            # was scoring 92/100 "low".
            verified = contract.is_verified
            if verified is None:
                verified = bool(source)

            facts.update(
                {
                    "is_verified": verified,
                    "is_fully_verified": contract.is_fully_verified,
                    "is_partially_verified": contract.is_partially_verified,
                    "is_changed_bytecode": contract.is_changed_bytecode,
                    "certified": contract.certified,
                    "contract_name": contract.name,
                    "compiler_version": contract.compiler_version,
                    "optimization_enabled": contract.optimization_enabled,
                    "optimization_runs": contract.optimization_runs,
                    "license_type": contract.license_type,
                    "verified_at": contract.verified_at,
                    "source_lines": source.count("\n") + 1 if source else 0,
                    "external_libraries": len(contract.external_libraries),
                }
            )
            lowered = source.lower()
            markers = [label for token, label in SOURCE_MARKERS if token in lowered]
        elif isinstance(contract, UpstreamNotFoundError):
            # The explorer answered: it holds no verified source for this
            # address. That is a genuine finding.
            facts["is_verified"] = False
        else:
            # The request failed. We do not know either way, and must not
            # write False here — the Risk Agent would penalise it as if the
            # explorer had confirmed the contract is unverified.
            verification_unknown = type(contract).__name__

        facts["source_markers"] = markers
        context.facts["contract"] = facts

        explorer = blockscout.explorer_url("address", address)
        context.add_source("Blockscout contract page", f"{explorer}?tab=contract")
        context.add_source(
            "Blockscout contract API",
            f"{blockscout.base_url}/api/v2/smart-contracts/{address}",
        )
        context.add_source(f"{get_settings().chain_name} RPC (eth_getCode)", rpc.base_url)

        evidence: list[Finding] = [
            Finding.confirmed(
                "contract_name", "Contract name", facts.get("contract_name"), explorer
            ),
            Finding.confirmed(
                "compiler", "Compiler version", facts.get("compiler_version"), explorer
            ),
            Finding.confirmed(
                "optimization",
                "Optimizer enabled",
                facts.get("optimization_enabled"),
                explorer,
            ),
            Finding.confirmed("license", "License", facts.get("license_type"), explorer),
            Finding.confirmed(
                "bytecode",
                "Deployed bytecode size (bytes)",
                facts.get("bytecode_size_bytes"),
            ),
            Finding.confirmed(
                "source_size", "Source lines", facts.get("source_lines"), explorer
            ),
        ]

        if verification_unknown is not None:
            evidence.append(
                Finding.unknown(
                    "verification",
                    "Verified on explorer",
                    reason=(
                        "The explorer's verification record could not be read "
                        f"({verification_unknown}). This is not the same as the "
                        "contract being unverified."
                    ),
                    source_url=explorer,
                )
            )
        else:
            evidence.append(
                Finding.confirmed(
                    "verification",
                    "Verified on explorer",
                    facts.get("is_verified"),
                    explorer,
                )
            )

        evidence += self._verification_depth(facts, explorer)
        # The raw bytecode is passed rather than stored: it is megabytes of
        # hex, and putting it in `facts` would bloat every stored row and every
        # summary prompt for a value nobody reads.
        evidence += await self._powers(
            contract,
            facts,
            context,
            explorer,
            "" if isinstance(code, BaseException) else code,
        )

        if markers:
            evidence.append(
                Finding.confirmed(
                    "source_markers",
                    "Source patterns found",
                    ", ".join(markers),
                    explorer,
                )
            )

        name = facts.get("contract_name") or address
        return AgentResult.ok(
            summary=f"Collected contract data for {name}.",
            output={"contract": facts},
            evidence=evidence,
        )

    def _verification_depth(self, facts: dict[str, Any], explorer: str) -> list[Finding]:
        """How much the explorer's tick actually establishes.

        A partial verification means the deployed bytecode could not be
        reproduced exactly from the published source. The explorer renders that
        with the same green tick as a full match, so it is called out here.
        """
        if not facts.get("is_verified"):
            return []

        findings: list[Finding] = []

        if facts.get("is_changed_bytecode"):
            findings.append(
                Finding.refuted(
                    "bytecode_match",
                    "Deployed bytecode still matches the published source",
                    value=False,
                    reason=(
                        "The bytecode at this address changed after "
                        "verification, so the published source no longer "
                        "describes what runs."
                    ),
                    source_url=explorer,
                )
            )
        elif facts.get("is_fully_verified"):
            findings.append(
                Finding.confirmed(
                    "verification_depth",
                    "Verification depth",
                    "full bytecode match",
                    explorer,
                )
            )
        elif facts.get("is_partially_verified"):
            findings.append(
                Finding.confirmed(
                    "verification_depth",
                    "Verification depth",
                    "partial match — source is indicative, not proof",
                    explorer,
                )
            )

        return findings

    async def _powers(
        self,
        contract: Any,
        facts: dict[str, Any],
        context: ExecutionContext,
        explorer: str,
        bytecode: str = "",
    ) -> list[Finding]:
        """What the owner can do, read from the ABI.

        For a proxy the ABI that matters belongs to the implementation, so it
        is fetched before scanning. Scanning the proxy itself would report a
        contract with no powers at all.
        """
        proxy_type = facts.get("proxy_type")
        findings: list[Finding] = []

        if proxy_type:
            findings.append(
                Finding.confirmed(
                    "proxy",
                    "Upgradeable proxy",
                    f"{proxy_type} — the owner can replace all logic",
                    explorer,
                )
            )

        if isinstance(contract, BaseException):
            return findings

        abi = contract.abi
        scanned = "this contract"

        if proxy_type and contract.implementations:
            target = contract.implementations[0]
            impl_address = target.get("address") or target.get("address_hash")
            if isinstance(impl_address, str) and impl_address:
                facts["implementation_address"] = impl_address
                try:
                    impl = await context.services.blockscout.get_contract(impl_address)
                    abi = impl.abi
                    scanned = f"implementation {impl_address}"
                except Exception as exc:
                    logger.warning("implementation_read_failed", error=str(exc))
                    findings.append(
                        Finding.unknown(
                            "powers",
                            "Privileged owner powers",
                            reason=(
                                "This is a proxy and its implementation could "
                                f"not be read ({type(exc).__name__}), so the "
                                "functions that actually run are unknown."
                            ),
                            source_url=explorer,
                        )
                    )
                    return findings

        recovered = False
        if not abi:
            # No published interface is where this used to stop. The dispatch
            # table is still in the deployed bytecode, though, so the functions
            # can be named without the source — which turns the single largest
            # `unknown` this platform reports into an answer.
            abi = await self._recover_abi(bytecode)
            recovered = bool(abi)
            scanned = "bytecode (source unverified)"

        if not abi:
            findings.append(
                Finding.unknown(
                    "powers",
                    "Privileged owner powers",
                    reason=(
                        "No ABI is published for this address and its bytecode "
                        "yielded no recognisable functions, so its interface "
                        "is unknown."
                    ),
                    source_url=explorer,
                )
            )
            return findings

        if recovered:
            findings.append(
                Finding.confirmed(
                    "abi_recovered",
                    "Interface recovered from bytecode",
                    f"{len(abi)} functions named without published source",
                    "https://openchain.xyz",
                )
            )

        powers = privileged_powers(abi)
        facts["privileged_powers"] = [
            {"function": power.function, "meaning": power.meaning, "severe": power.severe}
            for power in powers
        ]
        facts["abi_scanned"] = scanned

        if not powers:
            findings.append(
                Finding.confirmed(
                    "powers", "Privileged owner powers", "none found in the ABI", explorer
                )
            )
            return findings

        severe = [power for power in powers if power.severe]
        findings.append(
            Finding.confirmed(
                "powers",
                "Privileged owner powers",
                ", ".join(f"{power.function} ({power.meaning})" for power in powers),
                explorer,
            )
        )

        # Whether anyone can still use them. Renounced ownership does not
        # remove a single function from the bytecode, so without this the
        # report would describe live capabilities on a contract nobody
        # controls — true about the code, false about the risk.
        owner = await self._owner_of(facts["address"], context)
        facts["owner"] = owner

        if owner == ZERO_ADDRESS:
            facts["ownership_renounced"] = True
            # Nothing here can fire, so the Risk Agent must not score it.
            facts["privileged_powers"] = []
            findings.append(
                Finding.confirmed(
                    "ownership",
                    "Ownership renounced",
                    "owner() is the zero address, so the powers above cannot be used",
                    explorer,
                )
            )
            return findings

        if owner is None:
            findings.append(
                Finding.unknown(
                    "ownership",
                    "Ownership still held",
                    reason=(
                        "This contract does not answer `owner()`, so whether "
                        "anyone can still call the functions above could not "
                        "be established."
                    ),
                    source_url=explorer,
                )
            )
        else:
            facts["ownership_renounced"] = False
            findings.append(
                Finding.confirmed(
                    "ownership",
                    "Ownership still held by",
                    owner,
                    context.services.blockscout.explorer_url("address", owner),
                )
            )

        if severe:
            findings.append(
                Finding.confirmed(
                    "powers_severe",
                    "Powers that can affect holders directly",
                    ", ".join(power.function for power in severe),
                    explorer,
                )
            )

        return findings

    @staticmethod
    async def _owner_of(address: str, context: ExecutionContext) -> str | None:
        """Who currently holds the privileged powers, if anyone.

        Every "the owner can X" finding is conditional on there *being* an
        owner. A contract whose ownership has been renounced still has all the
        same functions in its bytecode, and reporting them as live capabilities
        would be exactly the kind of true-but-misleading claim this platform is
        supposed to catch other people making.

        `owner()` — selector `0x8da5cb5b` — is the near-universal accessor. A
        contract that does not implement it simply reverts, and that is an
        unknown rather than a renouncement.
        """
        try:
            raw = await context.services.rpc.call({"to": address, "data": "0x8da5cb5b"})
        except Exception:
            return None

        if not isinstance(raw, str) or len(raw) < 66:
            return None

        owner = "0x" + raw[-40:]
        return owner if int(owner, 16) != 0 else ZERO_ADDRESS

    @staticmethod
    async def _recover_abi(bytecode: str) -> list[dict[str, Any]]:
        """Name a contract's functions from its deployed bytecode.

        Best-effort by construction. A selector the registry cannot resolve is
        dropped rather than guessed, so the recovered interface is a floor:
        everything listed is really there, and there may be more that is not.
        """
        if not bytecode:
            return []

        from app.services.web.registry import get_web_registry

        try:
            return await get_web_registry().signatures.recover_abi(bytecode)
        except Exception as exc:
            logger.warning("abi_recovery_failed", error=str(exc))
            return []


AGENT = ContractAgent
