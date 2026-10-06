"""Celery tasks. Genuinely idempotent, which is the precondition backend §26
sets for enabling automatic retries."""

import logging
from smtplib import SMTPException
from uuid import UUID

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.notifications import emails
from apps.notifications.models import NotificationEvent
from apps.notifications.repositories import DjangoNotificationRepository
from apps.notifications.services import build_dedupe_key, resolve_recipients
from apps.tasks.repositories import DjangoTaskRepository
from apps.tasks.selectors import overdue_candidates
from apps.users.repositories import DjangoUserRepository

logger = logging.getLogger(__name__)


@shared_task(
    name="apps.notifications.tasks.send_task_event_email",
    autoretry_for=(SMTPException, ConnectionError),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
    acks_late=True,
)
def send_task_event_email(*, event: str, task_id: str, recipient_id: str, dedupe_key: str) -> None:
    notifications = DjangoNotificationRepository()

    # Ids arrive as strings because Celery serialises arguments as JSON. Parsing
    # them here keeps the repository contracts typed on UUID rather than widening
    # them to UUID | str for one caller; the ORM would accept either, which is
    # exactly why the mismatch would otherwise go unnoticed.
    task = DjangoTaskRepository().get(UUID(task_id))
    recipient = DjangoUserRepository().get(UUID(recipient_id))
    if task is None or recipient is None:
        # Soft-deleted or genuinely gone between enqueue and delivery. Not an
        # error: the default managers filter deleted rows, so this is the
        # designed outcome of deleting a task with pending notifications.
        logger.info("notifications.target_missing key=%s", dedupe_key)
        return

    notification = notifications.create_if_absent(
        dedupe_key=dedupe_key, task_id=task.pk, recipient_id=recipient.pk, event=event
    )
    if notification is None:
        logger.info("notifications.duplicate_skipped key=%s", dedupe_key)
        return

    try:
        subject, body = emails.render(event=event, task=task, recipient=recipient)
        send_mail(
            subject, body, settings.DEFAULT_FROM_EMAIL, [recipient.email], fail_silently=False
        )
    except SMTPException, ConnectionError:
        # Transport failure: let autoretry_for handle it. The Notification row
        # stays PENDING, so create_if_absent returns it again on the retry.
        logger.warning("notifications.transport_failure key=%s", dedupe_key)
        raise
    except Exception as exc:
        notifications.mark_failed(notification, error=f"{type(exc).__name__}: {exc}")
        logger.exception("notifications.send_failed key=%s", dedupe_key)
        return

    notifications.mark_sent(notification)
    logger.info("notifications.sent key=%s event=%s", dedupe_key, event)


@shared_task(name="apps.notifications.tasks.sweep_overdue_tasks")
def sweep_overdue_tasks() -> int:
    """Hourly: enqueue one email per overdue task per eligible recipient.

    Calls tasks.selectors.overdue_candidates() rather than touching the ORM
    (D8; spec §16.2). The selector returns values_list(...).iterator(), so a
    large backlog never materialises as model instances, and it is served by the
    ("status", "due_date") partial index.
    """
    today = timezone.now().date().isoformat()
    overdue = str(NotificationEvent.OVERDUE)
    enqueued = 0

    for task_id, assignee_id, created_by_id, created_by_role in overdue_candidates():
        recipients = resolve_recipients(
            event=overdue,
            assignee_id=assignee_id,
            created_by_id=created_by_id,
            created_by_role=created_by_role,
            actor_id=None,  # a scheduled sweep has no actor to suppress
        )
        for recipient_id in recipients:
            send_task_event_email.delay(
                event=overdue,
                task_id=str(task_id),
                recipient_id=str(recipient_id),
                dedupe_key=build_dedupe_key(
                    event=overdue,
                    task_id=task_id,
                    recipient_id=recipient_id,
                    on_date=today,
                ),
            )
            enqueued += 1

    logger.info("notifications.sweep_complete enqueued=%s date=%s", enqueued, today)
    return enqueued
