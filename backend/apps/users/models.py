"""The custom user. USERNAME_FIELD is email; uniqueness is partial (D21)."""

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models import Q
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.core.models import SoftDeleteModel
from apps.core.roles import Role


class UserManager(BaseUserManager):
    """Hides soft-deleted users; owns email normalization (D24) and hashing."""

    def get_queryset(self) -> models.QuerySet:
        return super().get_queryset().filter(deleted_at__isnull=True)

    def create_user(self, email: str, password: str | None = None, **extra):
        if not email:
            raise ValueError("A user requires an email address.")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra):
        extra.setdefault("role", Role.ADMIN)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        if not (extra["is_staff"] and extra["is_superuser"]):
            raise ValueError("A superuser must have is_staff and is_superuser set.")
        return self.create_user(email, password, **extra)


class AllUsersManager(BaseUserManager):
    """Escape hatch for tests, data repair and audit queries. Sees deleted rows."""


class User(SoftDeleteModel, AbstractBaseUser, PermissionsMixin):
    # Not unique=True: uniqueness is the partial constraint below, so a deleted
    # user's email becomes reusable (D21).
    email = models.EmailField(max_length=254)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    role = models.CharField(max_length=16, choices=Role.choices)
    # Django's authentication gate. NOT a synonym for deleted_at (D22): an Admin
    # may deactivate a user without deleting them.
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    # Redeclared explicitly, and pinned by default_manager_name below, because
    # manager order under multiple inheritance is not reliable (see Task 8).
    objects = UserManager()
    all_objects = AllUsersManager()

    # The hash is excluded: an audit trail needs to know a password changed,
    # not to keep a second copy of every hash a user ever had.
    history = HistoricalRecords(excluded_fields=["password"])

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        default_manager_name = "objects"
        constraints = [
            models.UniqueConstraint(
                fields=["email"],
                condition=Q(deleted_at__isnull=True),
                name="uniq_active_user_email",
            )
        ]
        indexes = [
            models.Index(
                fields=["role"],
                condition=Q(deleted_at__isnull=True),
                name="user_role_live_idx",
            ),
            models.Index(fields=["deleted_at"], name="user_deleted_at_idx"),
        ]

    def __str__(self) -> str:
        return self.email

    def soft_delete(self, by=None) -> None:
        """Deletion also revokes authentication (D22)."""
        self.deleted_at = timezone.now()
        self.deleted_by = by
        self.is_active = False
        self.save(update_fields=["deleted_at", "deleted_by", "is_active"])
