"""Subject and body rendering. Templates live in templates/notifications/."""

from django.conf import settings
from django.template.loader import render_to_string

from apps.notifications.models import NotificationEvent
from apps.tasks.models import Task
from apps.users.models import User

_SUBJECTS = {
    str(NotificationEvent.ASSIGNED): "A task was assigned to you: {title}",
    str(NotificationEvent.STATUS_CHANGED): "Task status changed: {title}",
    str(NotificationEvent.DUE_DATE_CHANGED): "Task due date changed: {title}",
    str(NotificationEvent.OVERDUE): "Task overdue: {title}",
}

_TEMPLATES = {
    str(NotificationEvent.ASSIGNED): "notifications/assigned.txt",
    str(NotificationEvent.STATUS_CHANGED): "notifications/status_changed.txt",
    str(NotificationEvent.DUE_DATE_CHANGED): "notifications/due_date_changed.txt",
    str(NotificationEvent.OVERDUE): "notifications/overdue.txt",
}


def render(*, event: str, task: Task, recipient: User) -> tuple[str, str]:
    subject = _SUBJECTS[event].format(title=task.title)
    body = render_to_string(
        _TEMPLATES[event],
        {
            "task": task,
            "recipient": recipient,
            "task_url": f"{settings.FRONTEND_BASE_URL}/tasks/{task.pk}",
        },
    )
    return subject, body
