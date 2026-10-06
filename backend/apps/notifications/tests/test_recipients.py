"""No database, no Celery, no email — just the two rules."""

import uuid

import pytest

from apps.core.roles import Role
from apps.notifications.models import NotificationEvent
from apps.notifications.services import build_dedupe_key, resolve_recipients

ASSIGNEE = uuid.uuid7()
CREATOR = uuid.uuid7()


def resolve(event, *, creator_role=Role.SUPERVISOR, assignee=ASSIGNEE, creator=CREATOR, actor=None):
    return resolve_recipients(
        event=event,
        assignee_id=assignee,
        created_by_id=creator,
        created_by_role=creator_role,
        actor_id=actor,
    )


def test_assignment_notifies_only_the_new_assignee():
    assert resolve(NotificationEvent.ASSIGNED) == [ASSIGNEE]


def test_due_date_change_notifies_only_the_assignee():
    assert resolve(NotificationEvent.DUE_DATE_CHANGED) == [ASSIGNEE]


def test_status_change_notifies_the_assignee_and_the_creator():
    assert set(resolve(NotificationEvent.STATUS_CHANGED)) == {ASSIGNEE, CREATOR}


def test_overdue_notifies_the_assignee_and_the_creator():
    assert set(resolve(NotificationEvent.OVERDUE)) == {ASSIGNEE, CREATOR}


def test_an_operator_creator_who_no_longer_holds_the_task_is_dropped():
    """D26, falling out of D14: emailing someone about a task they cannot open is
    confusing and leaks information."""
    assert resolve(NotificationEvent.STATUS_CHANGED, creator_role=Role.OPERATOR) == [ASSIGNEE]


def test_an_operator_creator_who_still_holds_the_task_is_kept_once():
    result = resolve(
        NotificationEvent.STATUS_CHANGED,
        creator_role=Role.OPERATOR,
        assignee=CREATOR,
        creator=CREATOR,
    )
    assert result == [CREATOR], "the same person must not be emailed twice"


def test_a_supervisor_creator_is_kept_because_supervisors_see_all_tasks():
    assert set(resolve(NotificationEvent.STATUS_CHANGED, creator_role=Role.SUPERVISOR)) == {
        ASSIGNEE,
        CREATOR,
    }


def test_an_admin_creator_is_dropped():
    """Defensive: the API forbids an Admin creating a task, but the Django admin
    and seed data do not, and an Admin cannot read any task (D13)."""
    assert resolve(NotificationEvent.STATUS_CHANGED, creator_role=Role.ADMIN) == [ASSIGNEE]


def test_the_actor_is_never_emailed_about_their_own_action():
    assert resolve(NotificationEvent.STATUS_CHANGED, actor=ASSIGNEE) == [CREATOR]
    assert resolve(NotificationEvent.STATUS_CHANGED, actor=CREATOR) == [ASSIGNEE]


def test_an_unassigned_task_yields_no_assignee_recipient():
    assert resolve(NotificationEvent.ASSIGNED, assignee=None) == []


def test_an_overdue_sweep_has_no_actor_so_nobody_is_suppressed():
    assert set(resolve(NotificationEvent.OVERDUE, actor=None)) == {ASSIGNEE, CREATOR}


@pytest.mark.parametrize(
    ("event", "segment"),
    [
        (NotificationEvent.ASSIGNED, "ASSIGNED"),
        (NotificationEvent.STATUS_CHANGED, "STATUS"),
        (NotificationEvent.DUE_DATE_CHANGED, "DUE"),
    ],
)
def test_change_driven_keys_use_the_history_id(event, segment):
    key = build_dedupe_key(event=event, task_id=ASSIGNEE, recipient_id=CREATOR, history_id=42)
    assert key == f"{ASSIGNEE}:{segment}:{CREATOR}:42"
    assert len(key) <= 160


def test_overdue_keys_use_the_date_so_delivery_is_once_per_day():
    """Hourly cadence, daily dedupe window — deliberately different
    granularities (spec §10.4)."""
    key = build_dedupe_key(
        event=NotificationEvent.OVERDUE,
        task_id=ASSIGNEE,
        recipient_id=CREATOR,
        on_date="2026-10-06",
    )
    assert key == f"{ASSIGNEE}:OVERDUE:{CREATOR}:2026-10-06"


def test_an_overdue_key_without_a_date_is_a_programming_error():
    with pytest.raises(ValueError):
        build_dedupe_key(event=NotificationEvent.OVERDUE, task_id=ASSIGNEE, recipient_id=CREATOR)
