import factory
from factory.django import DjangoModelFactory

from apps.tasks.models import Task, TaskStatus
from apps.users.tests.factories import OperatorFactory, SupervisorFactory


class TaskFactory(DjangoModelFactory):
    class Meta:
        model = Task

    title = factory.Sequence(lambda n: f"Task {n}")
    description = ""
    status = TaskStatus.PENDING
    due_date = None
    completed_at = None
    assignee = factory.SubFactory(OperatorFactory)
    created_by = factory.SubFactory(SupervisorFactory)
