from django_filters import rest_framework as filters

from apps.core.roles import Role
from apps.users.models import User


class UserFilterSet(filters.FilterSet):
    role = filters.ChoiceFilter(choices=Role.choices)
    is_active = filters.BooleanFilter()

    class Meta:
        model = User
        fields = ["role", "is_active"]
