"""The background monitor.

Change detection has existed for a while and has been, until now, a feature
waiting to be discovered: it only ran when somebody re-analysed a subject by
hand. A website that stops resolving at three in the morning is worthless as a
finding if nobody looks again until they happen to.

This closes that loop. It wakes on a fixed tick, asks the watch store what is
due, and re-runs those analyses — which produces a change report as a side
effect, because the diff already runs inside every execution.

Three properties keep it from being a liability:

* **It spends the owner's quota, not a hidden allowance.** A check costs
  exactly what a manual analysis costs, and is refused the same way when the
  allowance runs out.
* **It never summarises.** The AI summary is over half the wall time of a run
  and the whole point of a repeat check is the diff, not fresh prose about a
  token that has not moved.
* **It cannot outlive its usefulness.** A failed check still marks the watch
  as checked, so a broken subject is retried on the next interval rather than
  in a tight loop.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from app.config import get_settings
from app.core.exceptions import MolthoodError
from app.logging import get_logger

if TYPE_CHECKING:  # pragma: no cover - typing only
    from app.repositories.watches import DueWatch

logger = get_logger(__name__)


async def run_due_checks() -> int:
    """Run every watch that is due. Returns how many were checked."""
    from app.repositories.watches import get_watch_store

    settings = get_settings()
    store = get_watch_store()

    try:
        due = await asyncio.to_thread(store.due, limit=settings.monitor_batch_size)
    except Exception as exc:
        logger.warning("monitor_due_lookup_failed", error=str(exc))
        return 0

    if not due:
        return 0

    logger.info("monitor_batch_started", watches=len(due))

    # Sequential on purpose. These are background checks competing with real
    # requests for the same explorer rate limit, and nobody is waiting on them.
    for watch in due:
        await _check(watch)

    return len(due)


async def _check(watch: DueWatch) -> None:
    """Re-analyse one watched subject and record what changed."""
    from app.engine.engine import execution_engine
    from app.repositories.api_keys import get_api_key_store
    from app.repositories.watches import get_watch_store

    store = get_watch_store()
    keys = get_api_key_store()

    try:
        await keys.consume(watch.api_key_id)
    except MolthoodError as exc:
        # Out of allowance, or the key is gone. Recorded rather than retried,
        # so the console can say why the watch has gone quiet instead of
        # showing a stale timestamp that reads as "all clear".
        await asyncio.to_thread(
            store.record_check,
            watch.id,
            execution_id=None,
            changes=None,
            error=exc.message,
        )
        return

    try:
        result = await execution_engine.analyze(
            target=watch.target,
            address=watch.address,
            owner_key_id=watch.api_key_id,
            # A stored run from minutes ago would produce an empty diff against
            # itself and report "nothing changed" without having looked.
            use_cache=False,
            # The diff is the product here. Prose costs more than half the run
            # and would say the same thing about an unmoved token every hour.
            summarize=False,
        )
    except Exception as exc:
        await keys.refund(watch.api_key_id)
        logger.warning("monitor_check_failed", watch=watch.id, error=str(exc))
        await asyncio.to_thread(
            store.record_check,
            watch.id,
            execution_id=None,
            changes=None,
            error=type(exc).__name__,
        )
        return

    changes: dict[str, Any] | None = result.facts.get("changes")

    await asyncio.to_thread(
        store.record_check,
        watch.id,
        execution_id=result.execution_id,
        changes=changes,
        error=None if result.succeeded else result.error,
    )

    if changes and changes.get("alarming"):
        # The line an operator greps for. There is no delivery channel yet, so
        # saying so plainly in the log beats pretending an alert was sent.
        logger.warning(
            "monitor_alarming_change",
            watch=watch.id,
            target=watch.target,
            address=watch.address,
            alarming=changes["alarming"],
            total=changes.get("total"),
            execution_id=result.execution_id,
        )


async def monitor_loop() -> None:
    """Tick forever, checking whatever is due.

    Deliberately a plain task rather than a cron library or an external
    scheduler: the platform runs as one process today, and adding a scheduler
    dependency would buy nothing that a sleep loop does not already do. It is
    also why the tick is idempotent — the store decides what is due, so two
    processes racing would duplicate work but never corrupt state.
    """
    settings = get_settings()
    interval = settings.monitor_tick_seconds

    logger.info("monitor_started", tick_seconds=interval)

    while True:
        try:
            await asyncio.sleep(interval)
            await run_due_checks()
        except asyncio.CancelledError:
            logger.info("monitor_stopped")
            raise
        except Exception as exc:
            # A loop that dies takes every watch with it silently. Anything
            # unexpected is logged and the next tick still happens.
            logger.exception("monitor_tick_failed", error=str(exc))
