"""The error and guard paths the happy-path suites never reach.

Each of these is a real branch of a business rule or a deliberate loud failure,
not coverage padding — the alternative to testing them is excluding them, which
would mean nobody ever finds out they stopped working.
"""

import uuid

import pytest
from django.db import IntegrityError

from apps.core.permissions.classes import RolePermission, may_delete_task
from apps.core.roles import Role
from apps.notifications.models import NotificationEvent
from apps.notifications.repositories import DjangoNotificationRepository
from apps.notifications.services import build_dedupe_key
from apps.tasks.exceptions import TaskNotFound
from apps.tasks.services import TaskService
from apps.tasks.tests.fakes import FakeTaskRepository, RecordingDispatcher
from apps.users.models import User
from apps.users.selectors import assignable_users
from apps.users.serializers import UserUpdateSerializer
from apps.users.services import UserService
from apps.users.tests.factories import AdminFactory, OperatorFactory, SupervisorFactory
from apps.users.tests.fakes import FakeUserRepository


class TestRolePermissionMisconfiguration:
    def test_a_view_without_permission_resource_fails_loudly(self):
        """A misconfigured view must break in development, not quietly 403 in
        production — so this raises rather than returning False."""

        class Misconfigured:
            action = "list"

        class Request:
            user = User(email="someone@example.com", role=Role.SUPERVISOR)

        Request.user.is_active = True
        with pytest.raises(AssertionError, match="permission_resource"):
            RolePermission().has_permission(Request(), Misconfigured())


@pytest.mark.django_db
class TestMayDeleteTaskEdges:
    def test_an_anonymous_caller_may_not_delete(self):
        from apps.tasks.tests.factories import TaskFactory

        assert may_delete_task(None, TaskFactory()) is False

    def test_an_admin_may_not_delete_despite_not_being_an_operator(self):
        """The early return is role-specific, not "anyone who is not an Operator":
        an Admin has no task surface at all (D13)."""
        from apps.tasks.tests.factories import TaskFactory

        assert may_delete_task(AdminFactory(), TaskFactory()) is False


@pytest.mark.django_db
class TestUserManagerGuards:
    def test_create_user_requires_an_email(self):
        with pytest.raises(ValueError, match="requires an email"):
            User.objects.create_user(email="", password="pass12345")

    def test_create_superuser_sets_the_admin_role_and_flags(self):
        """The documented `createsuperuser` path, which no API test exercises."""
        superuser = User.objects.create_superuser(
            email="root@example.com", password="pass12345", first_name="R", last_name="Oot"
        )
        assert superuser.role == Role.ADMIN
        assert superuser.is_staff is True
        assert superuser.is_superuser is True

    def test_create_superuser_refuses_to_drop_its_privileges(self):
        with pytest.raises(ValueError, match="is_staff and is_superuser"):
            User.objects.create_superuser(
                email="fake@example.com",
                password="pass12345",
                first_name="F",
                last_name="Ake",
                is_staff=False,
            )


@pytest.mark.django_db
class TestAssignableUsers:
    def test_it_excludes_admins(self):
        """D17: an Admin can never hold a task, so the picker never offers one."""
        admin, supervisor, operator = AdminFactory(), SupervisorFactory(), OperatorFactory()
        assignable = set(assignable_users())
        assert supervisor in assignable
        assert operator in assignable
        assert admin not in assignable


@pytest.mark.django_db
class TestUserServiceNoOp:
    def test_an_update_with_no_recognised_fields_writes_nothing(self):
        repository = FakeUserRepository()
        target = User(email="target@example.com", role=Role.OPERATOR, first_name="A", last_name="B")
        service = UserService(users=repository)
        returned = service.update(
            user=target,
            data={"unknown_field": "ignored"},
            actor=User(email="admin@example.com", role=Role.ADMIN),
        )
        assert returned is target
        # The early return is the point: no write reaches the repository at all.
        assert repository.saved == []


class TestUserUpdateSerializerPassword:
    def test_it_rejects_a_weak_new_password(self):
        serializer = UserUpdateSerializer(data={"password": "123"}, partial=True)
        assert not serializer.is_valid()
        assert "password" in serializer.errors


@pytest.mark.django_db
class TestTaskServiceVanishedTask:
    def test_updating_a_task_that_vanished_is_a_404(self):
        """The row disappeared between the view's scoped fetch and the service's
        locked re-read."""
        service = TaskService(tasks=FakeTaskRepository(), notifications=RecordingDispatcher())
        with pytest.raises(TaskNotFound):
            service.update(
                task_id=uuid.uuid7(),
                data={"title": "Gone"},
                actor=User(email="s@example.com", role=Role.SUPERVISOR),
            )


class TestDedupeKeyGuards:
    def test_a_change_driven_key_requires_a_history_id(self):
        """Calling without one is a programming error, not a runtime condition."""
        with pytest.raises(ValueError, match="history_id"):
            build_dedupe_key(
                event=str(NotificationEvent.STATUS_CHANGED),
                task_id=uuid.uuid7(),
                recipient_id=uuid.uuid7(),
            )


@pytest.mark.django_db
class TestCreateIfAbsentRaisesThrough:
    def test_an_integrity_error_that_is_not_the_dedupe_key_propagates(self):
        """Swallowing this would turn a genuine constraint violation into a
        silently skipped notification.

        The violation is a NOT NULL on `event`, deliberately, rather than a bad
        foreign key: Django creates Postgres FKs as DEFERRABLE INITIALLY
        DEFERRED, so an invalid FK does not fail at INSERT — it fails at COMMIT,
        which inside a test transaction means at teardown, long after the code
        under test has returned.
        """
        from apps.tasks.tests.factories import TaskFactory

        task = TaskFactory()
        repository = DjangoNotificationRepository()
        with pytest.raises(IntegrityError):
            repository.create_if_absent(
                dedupe_key="a-key-that-does-not-exist-yet",
                task_id=task.pk,
                recipient_id=task.assignee_id,
                event=None,  # NOT NULL, and checked immediately
            )


@pytest.mark.django_db
class TestCeleryDispatcherEdges:
    def test_a_due_date_change_fans_out_to_the_assignee(self, django_capture_on_commit_callbacks):
        from django.core import mail

        from apps.notifications.dispatchers import CeleryNotificationDispatcher
        from apps.tasks.tests.factories import TaskFactory

        task = TaskFactory(created_by=SupervisorFactory())
        with django_capture_on_commit_callbacks(execute=True):
            CeleryNotificationDispatcher().task_due_date_changed(
                task_id=task.pk,
                history_id=task.history.first().history_id,
                actor_id=task.created_by_id,
            )
        assert [message.to for message in mail.outbox] == [[task.assignee.email]]

    def test_a_vanished_task_fans_out_to_nobody(self):
        """The task was deleted between the commit and the callback. Not an
        error: there is simply nobody left to notify."""
        from django.core import mail

        from apps.notifications.dispatchers import CeleryNotificationDispatcher

        CeleryNotificationDispatcher().task_status_changed(
            task_id=uuid.uuid7(), history_id=1, actor_id=uuid.uuid7()
        )
        assert mail.outbox == []


@pytest.mark.django_db
class TestTransportFailureIsRetried:
    def test_an_smtp_failure_propagates_so_celery_retries_it(self, monkeypatch):
        """It must re-raise BEFORE mark_failed, so the row stays PENDING and
        create_if_absent hands it back on the retry."""
        from smtplib import SMTPException

        from apps.notifications.models import Notification, NotificationStatus
        from apps.notifications.tasks import send_task_event_email
        from apps.tasks.tests.factories import TaskFactory

        task = TaskFactory()

        def refuse(*args, **kwargs):
            raise SMTPException("relay down")

        monkeypatch.setattr("apps.notifications.tasks.send_mail", refuse)
        with pytest.raises(SMTPException):
            send_task_event_email(
                event=str(NotificationEvent.STATUS_CHANGED),
                task_id=str(task.pk),
                recipient_id=str(task.assignee_id),
                dedupe_key="transport-failure-key",
            )
        # Still PENDING, which is what makes the retry able to finish the job.
        assert Notification.objects.get().status == NotificationStatus.PENDING


@pytest.mark.django_db
class TestLogoutWithUnusableToken:
    def test_logout_is_idempotent_when_the_cookie_is_already_blacklisted(self, api_client):
        """Logging out twice, or after the refresh token expired, must still
        clear the cookie and answer 204."""
        operator = OperatorFactory()
        api_client.force_authenticate(user=operator)
        api_client.cookies["refresh_token"] = "not-a-real-token"
        response = api_client.post("/api/v1/auth/logout/", {}, format="json")
        assert response.status_code == 204
        assert response.cookies["refresh_token"].value == ""


@pytest.mark.django_db
class TestUserViewSerializerSelection:
    def test_each_write_action_declares_its_own_serializer(self, rf):
        """These branches exist for drf-spectacular: `create` and `partial_update`
        build their serializers directly, so the schema is the only consumer —
        and a wrong answer here documents the wrong request body."""
        from apps.users.serializers import (
            UserCreateSerializer,
            UserSerializer,
            UserUpdateSerializer,
        )
        from apps.users.views import UserViewSet

        def view_for(action: str, user) -> UserViewSet:
            view = UserViewSet()
            view.action = action
            request = rf.get("/api/v1/users/")
            request.user = user
            view.request = request
            return view

        admin = AdminFactory()
        assert view_for("create", admin).get_serializer_class() is UserCreateSerializer
        assert view_for("partial_update", admin).get_serializer_class() is UserUpdateSerializer
        assert view_for("list", admin).get_serializer_class() is UserSerializer
