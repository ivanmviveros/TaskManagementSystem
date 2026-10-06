import pytest

from apps.notifications.models import Notification, NotificationEvent, NotificationStatus
from apps.notifications.repositories import (
    DjangoNotificationRepository,
    NotificationRepository,
)
from apps.notifications.tests.fakes import FakeNotificationRepository
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import OperatorFactory


def test_django_implementation_conforms_to_the_protocol():
    assert isinstance(DjangoNotificationRepository(), NotificationRepository)


def test_the_test_fake_conforms_to_the_same_protocol():
    """Two tests per repository, per spec §12.3 — the fake is the one that
    earns its place, since nothing else catches it drifting."""
    assert isinstance(FakeNotificationRepository(), NotificationRepository)


@pytest.mark.django_db
class TestCreateIfAbsent:
    def setup_method(self):
        self.repository = DjangoNotificationRepository()

    def _create(self, key="key-1"):
        task, recipient = TaskFactory(), OperatorFactory()
        return self.repository.create_if_absent(
            dedupe_key=key,
            task_id=task.pk,
            recipient_id=recipient.pk,
            event=NotificationEvent.STATUS_CHANGED,
        )

    def test_first_call_creates_the_row(self):
        notification = self._create()
        assert notification is not None
        assert notification.status == NotificationStatus.PENDING
        assert Notification.objects.count() == 1

    def test_a_second_call_after_a_successful_send_returns_none(self):
        first = self._create()
        self.repository.mark_sent(first)
        assert self._create() is None
        assert Notification.objects.count() == 1

    def test_a_second_call_after_a_failed_send_returns_the_existing_row(self):
        """Otherwise autoretry_for would be dead code: the first attempt always
        inserts before sending, so every retry would exit without sending."""
        first = self._create()
        self.repository.mark_failed(first, error="smtp down")
        retried = self._create()
        assert retried is not None
        assert retried.pk == first.pk
        assert Notification.objects.count() == 1

    def test_mark_sent_records_the_timestamp(self):
        notification = self._create()
        self.repository.mark_sent(notification)
        notification.refresh_from_db()
        assert notification.status == NotificationStatus.SENT
        assert notification.sent_at is not None

    def test_mark_failed_records_the_error_text(self):
        notification = self._create()
        self.repository.mark_failed(notification, error="relay refused")
        notification.refresh_from_db()
        assert notification.status == NotificationStatus.FAILED
        assert "relay refused" in notification.error

    def test_the_integrity_error_does_not_poison_the_surrounding_transaction(self):
        """The create is wrapped in its own atomic block, so a caller can keep
        working after a duplicate is skipped."""
        first = self._create()
        self.repository.mark_sent(first)
        assert self._create() is None
        assert Notification.objects.count() == 1  # this query must still work
