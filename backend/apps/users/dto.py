"""The typed input contracts for the users service layer.

See apps/tasks/dto.py for the division of responsibility (D29, D30). No
`arbitrary_types_allowed` here: unlike TaskCreateInput, neither users DTO
carries a model instance.
"""

from pydantic import BaseModel, ConfigDict


class UserCreateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    password: str
    first_name: str
    last_name: str
    role: str


class UserUpdateInput(BaseModel):
    """Partial by design. Callers branch on `model_fields_set` (D32) — note that
    `is_active=False` is a legitimate value, so truthiness is not an option."""

    model_config = ConfigDict(extra="forbid")

    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None
