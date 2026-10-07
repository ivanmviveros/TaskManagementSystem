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

# D34: an embedded list, NOT factory_boy. factory_boy is in the `dev`
# dependency group, and a management command is application code — importing a
# dev-only package here would break a production install.
FIRST_NAMES = [
    "Ana", "Bruno", "Carla", "Diego", "Elena", "Felipe", "Gabriela", "Hugo",
    "Irene", "Javier", "Karla", "Luis", "Marta", "Nestor", "Olivia", "Pablo",
    "Rocio", "Sergio", "Teresa", "Ulises", "Valeria", "Wilson", "Ximena", "Yago",
]  # fmt: skip
LAST_NAMES = [
    "Alvarez", "Bermudez", "Castillo", "Duarte", "Escobar", "Fuentes",
    "Guzman", "Herrera", "Ibarra", "Jimenez", "Lozano", "Medina", "Navarro",
    "Ortega", "Pardo", "Quintero", "Rios", "Salazar", "Trujillo", "Vargas",
]  # fmt: skip

# One in four, so the assignee picker has variety and D27 has subjects.
SUPERVISOR_EVERY = 4


class Command(BaseCommand):
    help = "Create demo users and tasks. Local/demo settings only."

    def add_arguments(self, parser):
        parser.add_argument(
            "--users",
            type=int,
            default=0,
            help="Random users to add ON TOP of the five fixed demo accounts. Top-up: "
            "re-running with the same number changes nothing.",
        )
        parser.add_argument(
            "--tasks",
            type=int,
            default=TASK_COUNT,
            help=f"Ensure at least this many tasks exist (default {TASK_COUNT}). Top-up.",
        )

    def handle(self, *args, **options):
        module = getattr(settings, "SETTINGS_MODULE", "") or ""
        if "production" in module:
            raise CommandError("seed_demo_data refuses to run under production settings.")

        # `type=int` rejects non-integers, but not negatives. Checked before any
        # write so a bad flag never leaves a half-seeded database.
        for name in ("users", "tasks"):
            if options[name] < 0:
                raise CommandError(f"--{name} must be zero or greater.")

        # A fixed seed keeps a fresh run reproducible between runs and machines.
        # It is NOT what makes top-up work — the index-keyed email is.
        random.seed(20261006)

        with transaction.atomic():
            users = self._seed_users(options["users"])
            self._seed_tasks(users, options["tasks"])

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {User.objects.count()} users and {Task.objects.count()} tasks. "
                f"Password for every demo account: {DEMO_PASSWORD}"
            )
        )

    def _seed_users(self, extra: int) -> dict[str, User]:
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

        # The INDEX carries uniqueness, not the name: a finite name list can
        # repeat a pair, and an email built from the name alone would collide
        # and silently create fewer than `extra` users. Keying on the index also
        # makes top-up trivial — look up each index, create only the missing.
        #
        # One row at a time on purpose: bulk_create would skip the
        # django-simple-history records the audit trail depends on.
        for index in range(1, extra + 1):
            email = f"user{index}@demo.local"
            existing = User.objects.filter(email=email).first()
            if existing is None:
                role = Role.SUPERVISOR if index % SUPERVISOR_EVERY == 0 else Role.OPERATOR
                existing = User.objects.create_user(
                    email=email,
                    password=DEMO_PASSWORD,
                    first_name=random.choice(FIRST_NAMES),
                    last_name=random.choice(LAST_NAMES),
                    role=role,
                )
            users[email] = existing
        return users

    def _seed_tasks(self, users: dict[str, User], target: int) -> None:
        existing = Task.objects.count()
        if existing >= target:
            return  # already at or above the target; top-up never deletes

        # Every role except Admin may hold a task (D17). Includes the generated
        # users, which is what gives the assignee picker variety.
        assignable = [u for u in users.values() if u.role != Role.ADMIN]
        # created_by is drawn from the same pool rather than pinned to one
        # Supervisor, so some tasks end up Operator-created and the D27 delete
        # rule becomes visible in the UI. This is the one respect in which the
        # default output differs from the previous version's (D33).
        now = timezone.now()

        # Due dates straddle now so the overdue sweep, the overdue filter and
        # due_next_7_days all have subjects on the very first run.
        offsets = (
            [timedelta(days=-d) for d in range(1, 9)]  # past
            + [timedelta(days=d) for d in range(1, 8)]  # within seven days
            + [timedelta(days=d) for d in (20, 45, 90)]  # far future
            + [None] * 4  # no deadline
        )

        # Continue the existing numbering, so topping up from 45 to 60 adds
        # Demo task 46 - Demo task 60 rather than renumbering anything.
        for index in range(existing, target):
            status = TaskStatus.values[index % len(TaskStatus.values)]
            offset = offsets[index % len(offsets)]
            Task.objects.create(
                title=f"Demo task {index + 1:02d}",
                description="Seeded for review. Edit freely.",
                status=status,
                # The check constraint requires these two to agree.
                completed_at=now if status == TaskStatus.COMPLETED else None,
                due_date=None if offset is None else now + offset,
                assignee=random.choice(assignable),
                created_by=random.choice(assignable),
            )
