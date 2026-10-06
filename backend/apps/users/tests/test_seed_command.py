import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.core.roles import Role
from apps.tasks.models import Task, TaskStatus
from apps.users.models import User

pytestmark = pytest.mark.django_db


def test_it_creates_one_user_per_role_plus_extra_operators():
    call_command("seed_demo_data")
    assert User.objects.filter(role=Role.ADMIN).count() >= 1
    assert User.objects.filter(role=Role.SUPERVISOR).count() >= 1
    assert User.objects.filter(role=Role.OPERATOR).count() >= 3, "the assignee picker needs choices"


def test_it_creates_enough_tasks_to_make_pagination_visible():
    call_command("seed_demo_data")
    assert Task.objects.count() >= 40


def test_due_dates_straddle_now_so_every_filter_has_subjects():
    from django.utils import timezone

    call_command("seed_demo_data")
    now = timezone.now()
    open_statuses = [TaskStatus.PENDING, TaskStatus.IN_PROGRESS]
    assert Task.objects.filter(due_date__lt=now, status__in=open_statuses).exists(), "overdue"
    assert Task.objects.filter(due_date__gte=now, status__in=open_statuses).exists(), "due soon"
    assert Task.objects.filter(due_date__isnull=True).exists(), "undated"


def test_all_four_statuses_are_represented():
    call_command("seed_demo_data")
    assert set(Task.objects.values_list("status", flat=True)) == set(TaskStatus.values)


def test_it_is_idempotent():
    call_command("seed_demo_data")
    first = (User.objects.count(), Task.objects.count())
    call_command("seed_demo_data")
    assert (User.objects.count(), Task.objects.count()) == first


def test_every_seeded_user_can_authenticate():
    from django.contrib.auth import authenticate

    from apps.users.management.commands.seed_demo_data import DEMO_PASSWORD

    call_command("seed_demo_data")
    for user in User.objects.all():
        assert authenticate(username=user.email, password=DEMO_PASSWORD) is not None


def test_no_task_violates_the_completion_check_constraint():
    call_command("seed_demo_data")
    assert not Task.objects.filter(status=TaskStatus.COMPLETED, completed_at__isnull=True).exists()
    assert (
        not Task.objects.exclude(status=TaskStatus.COMPLETED)
        .filter(completed_at__isnull=False)
        .exists()
    )


def test_it_refuses_to_run_under_production_settings(settings):
    """Never seed demo credentials into a production-like profile."""
    settings.DEBUG = False
    settings.SETTINGS_MODULE = "config.settings.production"
    with pytest.raises(CommandError, match="production"):
        call_command("seed_demo_data")
