"""The three roles. Lives in core so the permission matrix can import it
without a shared app depending on a feature app (spec §6.2)."""

from django.db import models


class Role(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    SUPERVISOR = "SUPERVISOR", "Supervisor"
    OPERATOR = "OPERATOR", "Operator"
