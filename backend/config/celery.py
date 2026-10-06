"""The Celery application and the single beat schedule entry.

django-celery-beat is deliberately NOT used: the schedule is one fixed entry, and
a database-backed editable schedule would mean a dependency plus migrations for
no current requirement (backend §53.16).
"""

import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

app = Celery("task_management")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    # Hourly cadence, daily dedupe window (spec §10.4): a task that goes overdue
    # at 09:15 is emailed by 10:00 rather than waiting until midnight, while the
    # date in the OVERDUE dedupe key caps delivery at one email per day.
    "sweep-overdue-tasks-hourly": {
        "task": "apps.notifications.tasks.sweep_overdue_tasks",
        "schedule": crontab(minute=0),
    },
}
