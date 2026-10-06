"""Task business errors. Each carries a stable code the frontend branches on."""

from rest_framework import status

from apps.core.exceptions import ApplicationError


class TaskNotFound(ApplicationError):
    """The row vanished between the view's scoped fetch and the service's locked
    re-read. Not the normal non-participant path — spec §7.3 keeps that a 404
    produced by queryset scoping."""

    default_detail = "That task no longer exists."
    default_code = "task_not_found"
    status_code = status.HTTP_404_NOT_FOUND


class InvalidStatusTransition(ApplicationError):
    default_detail = "That status change is not allowed from the task's current status."
    default_code = "invalid_status_transition"
    status_code = status.HTTP_409_CONFLICT


class CompletionRequiresCompleteAction(ApplicationError):
    default_detail = "Complete a task with POST /tasks/{id}/complete/."
    default_code = "use_complete_action"
    status_code = status.HTTP_400_BAD_REQUEST


class AssigneeNotAssignable(ApplicationError):
    """That USER cannot hold tasks: any role assigning to an Admin (D17)."""

    default_detail = "An Admin cannot be assigned tasks."
    default_code = "assignee_not_assignable"
    status_code = status.HTTP_400_BAD_REQUEST


class AssigneeImmutableForRole(ApplicationError):
    """YOUR ROLE cannot choose an assignee at all (D15, D16).

    400, not 403, for two reasons: the Operator create-side case is already a 400,
    so the same rule on update must not return a different status; and spec §7.3
    reserves 403 for the two permission layers, which keeps all four enforcement
    layers distinguishable from the response code alone.
    """

    default_detail = "Your role cannot choose a task's assignee."
    default_code = "assignee_immutable"
    status_code = status.HTTP_400_BAD_REQUEST
