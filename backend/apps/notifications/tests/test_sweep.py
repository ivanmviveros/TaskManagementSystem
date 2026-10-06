from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone

from apps.notifications.models import Notification, NotificationEvent
from apps.notifications.tasks import sweep_overdue_tasks
from apps.tasks.models import TaskStatus
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import OperatorFactory, SupervisorFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def overdue_task():
    return TaskFactory(
        due_date=timezone.now() - timedelta(days=1),
        status=TaskStatus.PENDING,
        assignee=OperatorFactory(),
        created_by=SupervisorFactory(),
    )


def test_the_sweep_emails_assignee_and_creator(overdue_task):
    sweep_overdue_tasks()
    recipients = {address for message in mail.outbox for address in message.to}
    assert recipients == {overdue_task.assignee.email, overdue_task.created_by.email}
    assert {n.event for n in Notification.objects.all()} == {NotificationEvent.OVERDUE}


def test_the_sweep_ignores_tasks_that_are_not_overdue():
    now = timezone.now()
    TaskFactory(due_date=now + timedelta(days=1), status=TaskStatus.PENDING)
    TaskFactory(due_date=None, status=TaskStatus.PENDING)
    TaskFactory(due_date=now - timedelta(days=1), status=TaskStatus.CANCELLED)
    TaskFactory(due_date=now - timedelta(days=1), status=TaskStatus.COMPLETED, completed_at=now)
    sweep_overdue_tasks()
    assert mail.outbox == []


def test_the_sweep_ignores_soft_deleted_tasks(overdue_task):
    overdue_task.soft_delete()
    sweep_overdue_tasks()
    assert mail.outbox == []


def test_running_the_sweep_twice_in_one_day_sends_one_email_per_recipient(overdue_task):
    """The date in the OVERDUE dedupe key caps delivery at one per task per
    recipient per day, while the hourly cadence keeps latency under an hour."""
    sweep_overdue_tasks()
    sweep_overdue_tasks()
    assert len(mail.outbox) == 2  # assignee + creator, once each
    assert Notification.objects.count() == 2


def test_an_operator_creator_who_no_longer_holds_the_task_is_not_swept_in():
    """D26 applies to the sweep too, which is why overdue_candidates joins
    created_by__role."""
    creator, assignee = OperatorFactory(), OperatorFactory()
    TaskFactory(
        due_date=timezone.now() - timedelta(days=1),
        status=TaskStatus.PENDING,
        created_by=creator,
        assignee=assignee,
    )
    sweep_overdue_tasks()
    recipients = {address for message in mail.outbox for address in message.to}
    assert recipients == {assignee.email}


def test_the_sweep_reports_how_many_messages_it_enqueued(overdue_task):
    assert sweep_overdue_tasks() == 2


def test_the_beat_schedule_declares_the_sweep_hourly():
    from config.celery import app

    entry = app.conf.beat_schedule["sweep-overdue-tasks-hourly"]
    assert entry["task"] == "apps.notifications.tasks.sweep_overdue_tasks"
    assert entry["schedule"].minute == {0}
