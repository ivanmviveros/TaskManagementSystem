import pytest
from django.core import mail

from apps.notifications.models import Notification, NotificationEvent, NotificationStatus
from apps.notifications.services import build_dedupe_key
from apps.notifications.tasks import send_task_event_email
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import OperatorFactory

pytestmark = pytest.mark.django_db


def call(task, recipient, event=NotificationEvent.STATUS_CHANGED, history_id=1):
    return send_task_event_email(
        event=event,
        task_id=str(task.pk),
        recipient_id=str(recipient.pk),
        dedupe_key=build_dedupe_key(
            event=event, task_id=task.pk, recipient_id=recipient.pk, history_id=history_id
        ),
    )


def test_it_sends_one_email_and_records_it_as_sent():
    task, recipient = TaskFactory(), OperatorFactory()
    call(task, recipient)
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [recipient.email]
    assert task.title in mail.outbox[0].subject
    notification = Notification.objects.get()
    assert notification.status == NotificationStatus.SENT
    assert notification.sent_at is not None


def test_running_it_twice_creates_one_notification_and_sends_one_email():
    """The direct test of §10.3b: retries must not double-send."""
    task, recipient = TaskFactory(), OperatorFactory()
    call(task, recipient)
    call(task, recipient)
    assert Notification.objects.count() == 1
    assert len(mail.outbox) == 1


def test_a_different_change_sends_again():
    """The key includes history_id, so the NEXT audited change is a new email."""
    task, recipient = TaskFactory(), OperatorFactory()
    call(task, recipient, history_id=1)
    call(task, recipient, history_id=2)
    assert Notification.objects.count() == 2
    assert len(mail.outbox) == 2


def test_a_vanished_task_is_skipped_without_raising():
    import uuid

    recipient = OperatorFactory()
    send_task_event_email(
        event=NotificationEvent.STATUS_CHANGED,
        task_id=str(uuid.uuid7()),
        recipient_id=str(recipient.pk),
        dedupe_key="orphan-key",
    )
    assert mail.outbox == []
    assert Notification.objects.count() == 0


def test_a_soft_deleted_task_is_skipped():
    task, recipient = TaskFactory(), OperatorFactory()
    task.soft_delete()
    call(task, recipient)
    assert mail.outbox == []


def test_an_unexpected_error_marks_the_notification_failed_rather_than_vanishing(monkeypatch):
    """backend §45: a bare Exception is never retried; it is recorded and logged.
    `except Exception: pass` appears nowhere."""
    task, recipient = TaskFactory(), OperatorFactory()

    def explode(*args, **kwargs):
        raise ValueError("template is broken")

    monkeypatch.setattr("apps.notifications.tasks.emails.render", explode)
    call(task, recipient)
    notification = Notification.objects.get()
    assert notification.status == NotificationStatus.FAILED
    assert "template is broken" in notification.error
    assert mail.outbox == []


def test_the_task_declares_retries_only_for_transport_failures():
    from smtplib import SMTPException

    retried = send_task_event_email.autoretry_for
    assert SMTPException in retried
    assert ConnectionError in retried
    assert Exception not in retried, "a bare Exception must never be retried"
    assert send_task_event_email.max_retries == 3
