"""An N+1 introduced later fails CI instead of being discovered in production."""

import pytest

from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def test_task_list_query_count_is_flat(supervisor_client, django_assert_num_queries):
    TaskFactory.create_batch(10)
    with django_assert_num_queries(2):  # 1 count + 1 page with select_related
        supervisor_client.get("/api/v1/tasks/")


def test_task_detail_joins_both_user_fields(supervisor_client, django_assert_num_queries):
    task = TaskFactory()
    with django_assert_num_queries(1):
        supervisor_client.get(f"/api/v1/tasks/{task.pk}/")


def test_stats_is_exactly_one_aggregate_query(supervisor_client, django_assert_num_queries):
    TaskFactory.create_batch(10)
    with django_assert_num_queries(1):
        supervisor_client.get("/api/v1/tasks/stats/")


def test_user_list_query_count_is_flat(admin_client, django_assert_num_queries):
    UserFactory.create_batch(10)
    with django_assert_num_queries(2):
        admin_client.get("/api/v1/users/")
