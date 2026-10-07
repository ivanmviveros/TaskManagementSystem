"""The typed input and output contracts for the tasks service layer.

Pydantic validates at the SERVICE boundary; DRF serializers keep the HTTP
boundary (D29). Nothing here produces a user-facing error message — a
ValidationError at DTO construction means the view and the service disagree
about the contract, which is a programming error surfaced as 500 (D30), never
mapped to a 400.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from apps.users.models import User


class TaskCreateInput(BaseModel):
    # arbitrary_types_allowed: `assignee` is a Django model instance the
    # serializer already resolved and proved live (D31). extra="forbid": an
    # unexpected key is a view/service contract mismatch and must fail loudly
    # rather than vanish into a default — the view splats validated_data, which
    # is what gives this something to catch.
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    title: str
    description: str = ""
    due_date: datetime | None = None
    assignee: User | None = None


class TaskUpdateInput(BaseModel):
    """Every field optional, because PATCH is partial.

    Callers MUST branch on `model_fields_set`, never on truthiness or
    `is not None` (D32): `assignee=None` means "unassign" and an omitted
    `assignee` means "leave alone", and the value alone cannot tell them apart.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    title: str | None = None
    description: str | None = None
    due_date: datetime | None = None
    assignee: User | None = None
    status: str | None = None


class TaskStatsOutput(BaseModel):
    """The GET /tasks/stats/ payload.

    Field order matches the dict the selector returns today, so `model_dump()`
    is byte-identical on the wire and the drf-spectacular inline_serializer
    annotation for /tasks/stats/ still describes it correctly.
    """

    total: int
    by_status: dict[str, int]
    overdue: int
    due_next_7_days: int
