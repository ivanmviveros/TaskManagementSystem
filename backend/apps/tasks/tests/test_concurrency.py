"""Exposes the race `select_for_update()` in TaskRepository.get_for_update exists
to close. Needs transaction=True: the default test transaction would hide the
very commit boundary under test."""

import threading

import pytest
from django.db import connection

from apps.notifications.dispatchers import NullNotificationDispatcher
from apps.tasks.models import Task, TaskStatus
from apps.tasks.repositories import DjangoTaskRepository
from apps.tasks.services import TaskService
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import SupervisorFactory


@pytest.mark.django_db(transaction=True)
def test_two_concurrent_completions_produce_exactly_one_transition():
    task = TaskFactory(status=TaskStatus.IN_PROGRESS)
    actor = SupervisorFactory()
    outcomes: list[str] = []
    barrier = threading.Barrier(2)

    def complete():
        barrier.wait()
        service = TaskService(
            tasks=DjangoTaskRepository(), notifications=NullNotificationDispatcher()
        )
        try:
            service.complete(task_id=task.pk, actor=actor)
            outcomes.append("completed")
        except Exception as exc:
            outcomes.append(type(exc).__name__)
        finally:
            connection.close()

    threads = [threading.Thread(target=complete) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert outcomes.count("completed") == 1, outcomes
    assert "InvalidStatusTransition" in outcomes

    task.refresh_from_db()
    assert task.status == TaskStatus.COMPLETED
    assert Task.history.filter(id=task.pk, status=TaskStatus.COMPLETED).count() == 1
