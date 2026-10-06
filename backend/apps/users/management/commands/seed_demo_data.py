"""Idempotent demo data. Scoped to local/demo settings only (backend §54a)."""

import random
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.core.roles import Role
from apps.tasks.models import Task, TaskStatus
from apps.users.models import User

DEMO_PASSWORD = "DemoPass!2026"
TASK_COUNT = 45

DEMO_USERS = [
    ("admin@demo.local", "Ada", "Admin", Role.ADMIN),
    ("supervisor@demo.local", "Sam", "Supervisor", Role.SUPERVISOR),
    ("operator@demo.local", "Omar", "Operator", Role.OPERATOR),
    ("operator2@demo.local", "Olga", "Operator", Role.OPERATOR),
    ("operator3@demo.local", "Otto", "Operator", Role.OPERATOR),
]


class Command(BaseCommand):
    help = "Create demo users and tasks. Local/demo settings only."

    def handle(self, *args, **options):
        module = getattr(settings, "SETTINGS_MODULE", "") or ""
        if "production" in module:
            raise CommandError("seed_demo_data refuses to run under production settings.")

        # A fixed seed keeps the spread reproducible between runs and machines.
        random.seed(20261006)

        with transaction.atomic():
            users = self._seed_users()
            self._seed_tasks(users)

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {User.objects.count()} users and {Task.objects.count()} tasks. "
                f"Password for every demo account: {DEMO_PASSWORD}"
            )
        )

    def _seed_users(self) -> dict[str, User]:
        users: dict[str, User] = {}
        for email, first, last, role in DEMO_USERS:
            existing = User.objects.filter(email=email).first()
            if existing is None:
                existing = User.objects.create_user(
                    email=email,
                    password=DEMO_PASSWORD,
                    first_name=first,
                    last_name=last,
                    role=role,
                    is_staff=(role == Role.ADMIN),
                    is_superuser=(role == Role.ADMIN),
                )
            users[email] = existing
        return users

    def _seed_tasks(self, users: dict[str, User]) -> None:
        if Task.objects.exists():
            return  # idempotent: tasks are seeded once

        supervisor = users["supervisor@demo.local"]
        operators = [u for u in users.values() if u.role == Role.OPERATOR]
        now = timezone.now()

        # Due dates straddle now so the overdue sweep, the overdue filter and
        # due_next_7_days all have subjects on the very first run.
        offsets = (
            [timedelta(days=-d) for d in range(1, 9)]  # past
            + [timedelta(days=d) for d in range(1, 8)]  # within seven days
            + [timedelta(days=d) for d in (20, 45, 90)]  # far future
            + [None] * 4  # no deadline
        )

        for index in range(TASK_COUNT):
            status = TaskStatus.values[index % len(TaskStatus.values)]
            offset = offsets[index % len(offsets)]
            Task.objects.create(
                title=f"Demo task {index + 1:02d}",
                description="Seeded for review. Edit freely.",
                status=status,
                # The check constraint requires these two to agree.
                completed_at=now if status == TaskStatus.COMPLETED else None,
                due_date=None if offset is None else now + offset,
                assignee=random.choice(operators),
                created_by=supervisor,
            )
