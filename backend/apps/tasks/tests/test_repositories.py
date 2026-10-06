import pytest

from apps.tasks.models import Task, TaskStatus
from apps.tasks.repositories import DjangoTaskRepository, TaskRepository
from apps.tasks.tests.factories import TaskFactory
from apps.tasks.tests.fakes import FakeTaskRepository
from apps.users.tests.factories import SupervisorFactory


def test_django_implementation_conforms_to_the_protocol():
    assert isinstance(DjangoTaskRepository(), TaskRepository)


def test_the_test_fake_conforms_to_the_same_protocol():
    assert isinstance(FakeTaskRepository(), TaskRepository)


def test_an_incomplete_fake_does_not_conform():
    class Incomplete:
        def get(self, task_id):
            return None

    assert not isinstance(Incomplete(), TaskRepository)


def test_a_missing_method_cannot_even_be_instantiated():
    """Without @abstractmethod, explicit inheritance would supply a `...` body
    returning None and this class would construct happily (spec §5.2.1)."""

    class Partial(TaskRepository):
        def get(self, task_id):
            return None

    with pytest.raises(TypeError, match="abstract"):
        Partial()


@pytest.mark.django_db
class TestDjangoTaskRepository:
    def test_get_ignores_soft_deleted_rows(self):
        task = TaskFactory()
        task.soft_delete()
        assert DjangoTaskRepository().get(task.pk) is None

    def test_get_for_update_returns_the_row(self):
        task = TaskFactory()
        from django.db import transaction

        with transaction.atomic():
            assert DjangoTaskRepository().get_for_update(task.pk) == task

    def test_add_persists_a_new_task(self):
        creator = SupervisorFactory()
        task = DjangoTaskRepository().add(
            Task(title="Fresh", created_by=creator, status=TaskStatus.PENDING)
        )
        assert Task.objects.filter(pk=task.pk).exists()

    def test_soft_delete_sets_marker_and_actor_together(self):
        actor = SupervisorFactory()
        task = TaskFactory()
        DjangoTaskRepository().soft_delete(task, by=actor)
        archived = Task.all_objects.get(pk=task.pk)
        assert archived.deleted_at is not None
        assert archived.deleted_by == actor
