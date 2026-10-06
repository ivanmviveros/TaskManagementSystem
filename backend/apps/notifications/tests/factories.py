import uuid

import factory
from factory.django import DjangoModelFactory

from apps.notifications.models import Notification, NotificationEvent
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import OperatorFactory


class NotificationFactory(DjangoModelFactory):
    class Meta:
        model = Notification

    task = factory.SubFactory(TaskFactory)
    recipient = factory.SubFactory(OperatorFactory)
    event = NotificationEvent.STATUS_CHANGED
    dedupe_key = factory.LazyFunction(lambda: f"{uuid.uuid7()}:STATUS:{uuid.uuid7()}:1")
