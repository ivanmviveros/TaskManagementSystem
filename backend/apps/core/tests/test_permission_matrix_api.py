"""Every cell of spec §7.1, driven by apps/core/permissions/matrix.py itself.

Endpoint-level reachability only. The one conditional cell — Operator DELETE,
which D27 makes depend on created_by — is exercised here against a SELF-CREATED
task and expected to succeed; its negative case lives in
apps/tasks/tests/test_api_delete_rules.py (spec §12.2).
"""

import pytest

from apps.core.permissions.matrix import MATRIX, Resource, is_allowed
from apps.core.roles import Role
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import AdminFactory, OperatorFactory, SupervisorFactory

pytestmark = pytest.mark.django_db

FACTORY_FOR_ROLE = {
    Role.ADMIN: AdminFactory,
    Role.SUPERVISOR: SupervisorFactory,
    Role.OPERATOR: OperatorFactory,
}

#: (resource, action) -> (http method, url template, body, allowed status codes)
#: Several allowed codes per cell because "reachable" means "not 403", and a
#: reachable write can legitimately answer 200, 201 or 204.
REQUESTS = {
    (Resource.USER, "list"): ("get", "/api/v1/users/", None, {200}),
    (Resource.USER, "retrieve"): ("get", "/api/v1/users/{user_id}/", None, {200}),
    (Resource.USER, "create"): (
        "post",
        "/api/v1/users/",
        {
            "email": "matrix@example.com",
            "password": "a-strong-password-1",
            "first_name": "M",
            "last_name": "X",
            "role": Role.OPERATOR,
        },
        {201},
    ),
    (Resource.USER, "partial_update"): (
        "patch",
        "/api/v1/users/{user_id}/",
        {"first_name": "Renamed"},
        {200},
    ),
    (Resource.USER, "destroy"): ("delete", "/api/v1/users/{user_id}/", None, {204}),
    (Resource.USER, "me"): ("get", "/api/v1/users/me/", None, {200}),
    (Resource.TASK, "list"): ("get", "/api/v1/tasks/", None, {200}),
    (Resource.TASK, "retrieve"): ("get", "/api/v1/tasks/{task_id}/", None, {200}),
    (Resource.TASK, "create"): ("post", "/api/v1/tasks/", {"title": "Matrix"}, {201}),
    (Resource.TASK, "partial_update"): (
        "patch",
        "/api/v1/tasks/{task_id}/",
        {"title": "Renamed"},
        {200},
    ),
    (Resource.TASK, "destroy"): ("delete", "/api/v1/tasks/{task_id}/", None, {204}),
    (Resource.TASK, "complete"): ("post", "/api/v1/tasks/{task_id}/complete/", {}, {200}),
    (Resource.TASK, "stats"): ("get", "/api/v1/tasks/stats/", None, {200}),
}


def test_every_matrix_cell_has_a_request_definition():
    """A new matrix row without a request here would go untested silently."""
    assert set(MATRIX) == set(REQUESTS), set(MATRIX) ^ set(REQUESTS)


@pytest.mark.parametrize("cell", sorted(MATRIX, key=str))
@pytest.mark.parametrize("role", sorted(Role.values))
def test_matrix_cell(cell, role, api_client):
    resource, action = cell
    method, template, body, ok_statuses = REQUESTS[cell]

    actor = FACTORY_FOR_ROLE[role]()
    api_client.force_authenticate(user=actor)

    # Fixtures the actor can legitimately reach, so a refusal can only come from
    # the permission layer and never from scoping.
    other_user = OperatorFactory()
    task = TaskFactory(created_by=actor, assignee=actor) if role != Role.ADMIN else TaskFactory()
    url = template.format(user_id=other_user.pk, task_id=task.pk)

    response = (
        getattr(api_client, method)(url, body, format="json")
        if body is not None
        else getattr(api_client, method)(url)
    )

    if is_allowed(role, resource, action):
        assert response.status_code in ok_statuses, (
            cell,
            role,
            response.status_code,
            response.data,
        )
    else:
        assert response.status_code == 403, (cell, role, response.status_code, response.data)


@pytest.mark.parametrize("cell", sorted(MATRIX, key=str))
def test_every_endpoint_rejects_an_unauthenticated_request(cell, api_client):
    method, template, body, _ = REQUESTS[cell]
    url = template.format(user_id=OperatorFactory().pk, task_id=TaskFactory().pk)
    response = (
        getattr(api_client, method)(url, body, format="json")
        if body is not None
        else getattr(api_client, method)(url)
    )
    assert response.status_code == 401, (cell, response.status_code)
