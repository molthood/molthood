"""Background task layer.

Phase 3 defines the queue contract only. No worker process, scheduler, or
broker connection exists — `enqueue` raises rather than silently dropping work.
"""

from app.tasks.queue import InMemoryTaskQueue, TaskQueue, get_task_queue

__all__ = ["InMemoryTaskQueue", "TaskQueue", "get_task_queue"]
