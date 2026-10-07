"""The Celery application and the single beat schedule entry.

django-celery-beat is deliberately NOT used: the schedule is one fixed entry, and
a database-backed editable schedule would mean a dependency plus migrations for
no current requirement (backend §53.16).
"""

import os

from celery import Celery
from celery.schedules import crontab

from apps.core.celery_context import connect_request_id_signals

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

app = Celery("task_management")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# This module is imported by both the web process (which publishes) and the
# worker (which runs tasks), so both ends of the broker get the handlers.
connect_request_id_signals()

app.conf.beat_schedule = {
    # Hourly cadence, daily dedupe window (spec §10.4): a task that goes overdue
    # at 09:15 is emailed by 10:00 rather than waiting until midnight, while the
    # date in the OVERDUE dedupe key caps delivery at one email per day.
    "sweep-overdue-tasks-hourly": {
        "task": "apps.notifications.tasks.sweep_overdue_tasks",
        "schedule": crontab(minute=0),
    },
}
