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


FIXED_ACCOUNTS = 5


class TestUserFlag:
    """--users N: design spec §5.1 and the seeding rows of §6.1."""

    def test_it_creates_exactly_n_users_beyond_the_fixed_accounts(self):
        call_command("seed_demo_data", "--users", "7", "--tasks", "0")
        assert User.objects.count() == FIXED_ACCOUNTS + 7
        # The index, not the name, carries uniqueness: a finite name list can
        # repeat a pair, and an email built from the name would collide and
        # silently create fewer than N.
        assert User.objects.filter(email__startswith="user").count() == 7

    def test_the_fixed_accounts_survive_and_still_authenticate(self):
        call_command("seed_demo_data", "--users", "3", "--tasks", "0")
        for email in (
            "admin@demo.local",
            "supervisor@demo.local",
            "operator@demo.local",
            "operator2@demo.local",
            "operator3@demo.local",
        ):
            assert User.objects.filter(email=email).exists()
        # admin@demo.local is fixed precisely so you can always sign in and
        # discover the generated accounts through the user list.
        admin = User.objects.get(email="admin@demo.local")
        assert admin.check_password("DemoPass!2026")

    def test_rerunning_with_the_same_count_is_a_no_op(self):
        call_command("seed_demo_data", "--users", "4", "--tasks", "0")
        call_command("seed_demo_data", "--users", "4", "--tasks", "0")
        assert User.objects.count() == FIXED_ACCOUNTS + 4

    def test_raising_the_count_adds_only_the_difference(self):
        call_command("seed_demo_data", "--users", "4", "--tasks", "0")
        call_command("seed_demo_data", "--users", "6", "--tasks", "0")
        assert User.objects.count() == FIXED_ACCOUNTS + 6

    def test_roughly_a_quarter_are_supervisors(self):
        call_command("seed_demo_data", "--users", "20", "--tasks", "0")
        generated = User.objects.filter(email__startswith="user")
        supervisors = generated.filter(role=Role.SUPERVISOR).count()
        # Loose bounds on purpose: the point is that the assignee picker has
        # variety and D27 has subjects, not an exact ratio.
        assert 1 <= supervisors < 20


class TestTaskFlag:
    def test_it_tops_up_to_m(self):
        call_command("seed_demo_data", "--users", "2", "--tasks", "12")
        assert Task.objects.count() == 12

    def test_rerunning_is_a_no_op(self):
        call_command("seed_demo_data", "--users", "2", "--tasks", "12")
        call_command("seed_demo_data", "--users", "2", "--tasks", "12")
        assert Task.objects.count() == 12

    def test_raising_it_adds_only_the_difference_and_continues_the_numbering(self):
        call_command("seed_demo_data", "--users", "2", "--tasks", "12")
        call_command("seed_demo_data", "--users", "2", "--tasks", "15")
        assert Task.objects.count() == 15
        assert Task.objects.filter(title="Demo task 15").exists()

    def test_the_default_is_45(self):
        call_command("seed_demo_data")
        assert Task.objects.count() == 45

    def test_every_task_has_an_assignable_assignee(self):
        call_command("seed_demo_data", "--users", "10", "--tasks", "30")
        # D17: never an Admin.
        assert not Task.objects.filter(assignee__role=Role.ADMIN).exists()
        assert not Task.objects.filter(assignee__isnull=True).exists()

    def test_created_by_varies_so_the_delete_rule_is_demonstrable(self):
        call_command("seed_demo_data", "--users", "10", "--tasks", "30")
        # D27 is only visible in the UI if some tasks are Operator-created.
        creators = set(Task.objects.values_list("created_by_id", flat=True))
        assert len(creators) > 1


class TestValidation:
    @pytest.mark.parametrize("flag", ["--users", "--tasks"])
    def test_it_rejects_a_negative_count(self, flag):
        # Matched on the message: an unrecognised flag ALSO raises CommandError,
        # so without the match this would pass before the flags even existed.
        with pytest.raises(CommandError, match="zero or greater"):
            call_command("seed_demo_data", flag, "-1")
