import uuid

from apps.core.models import UUIDPrimaryKeyModel


def test_primary_key_default_produces_version_7_uuids():
    field = UUIDPrimaryKeyModel._meta.get_field("id")
    assert field.primary_key is True
    assert field.editable is False
    assert field.default is uuid.uuid7, (
        "the default must be the stdlib callable, passed by reference"
    )
    assert field.default().version == 7


def test_generated_ids_sort_in_creation_order():
    """The property D28's index-locality argument rests on."""
    ids = [str(uuid.uuid7()) for _ in range(500)]
    assert ids == sorted(ids)
