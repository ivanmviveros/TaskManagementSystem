import factory
from factory.django import DjangoModelFactory

from apps.core.roles import Role
from apps.users.models import User

DEFAULT_PASSWORD = "factory-pass-12345"


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    first_name = "Test"
    last_name = "User"
    role = Role.OPERATOR

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        password = kwargs.pop("password", DEFAULT_PASSWORD)
        return model_class.objects.create_user(password=password, **kwargs)


class AdminFactory(UserFactory):
    email = factory.Sequence(lambda n: f"admin{n}@example.com")
    role = Role.ADMIN
    is_staff = True


class SupervisorFactory(UserFactory):
    email = factory.Sequence(lambda n: f"supervisor{n}@example.com")
    role = Role.SUPERVISOR


class OperatorFactory(UserFactory):
    email = factory.Sequence(lambda n: f"operator{n}@example.com")
    role = Role.OPERATOR
