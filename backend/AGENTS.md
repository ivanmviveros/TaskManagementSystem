# backend/AGENTS.md

Backend-specific conventions for the Django + DRF API.

This file assumes the root [`AGENTS.md`](../AGENTS.md) has already been read — it covers the shared engineering principles, the frontend/backend trust boundary, the authentication contract, and the local Docker Compose setup. Don't restate those here; this file is Django/DRF implementation detail only.

---

# 1. Architecture

Request flow:

```text
HTTP Request
    ↓
DRF View / ViewSet
    ↓
Serializer
    ↓
Application Service
    ↓
Repository / Selector
    ↓
Django ORM
    ↓
PostgreSQL
```

## Dependency direction

```text
Views
  ↓
Serializers
  ↓
Application Services
  ↓
Repositories / Selectors
  ↓
ORM
```

Infrastructure implementations may depend on domain/application abstractions, but higher-level business code should not depend directly on HTTP or framework-specific infrastructure when an explicit boundary is useful.

See root `AGENTS.md` § System Boundary for how this fits into the overall request path coming from the frontend.

---

# 2. Recommended Backend Structure

Organize backend code by Django application/feature rather than creating one giant global directory.

A typical feature should look like:

```text
backend/
├── config/
│   ├── settings/
│   │   ├── base.py
│   │   ├── local.py
│   │   └── production.py
│   ├── urls.py
│   └── wsgi.py
│
├── apps/
│   └── users/
│       ├── migrations/
│       ├── admin.py
│       ├── apps.py
│       ├── models.py
│       ├── serializers.py
│       ├── views.py
│       ├── permissions.py
│       ├── services.py
│       ├── repositories.py
│       ├── selectors.py
│       ├── exceptions.py
│       ├── urls.py
│       └── tests/
│           ├── test_models.py
│           ├── test_serializers.py
│           ├── test_services.py
│           ├── test_selectors.py
│           ├── test_permissions.py
│           └── test_api.py
│
└── manage.py
```

Do not create every file automatically.

For example:

- Do not create `repositories.py` if no meaningful repository abstraction exists.
- Do not create `services.py` containing trivial one-line wrappers.
- Do not create domain layers solely to imitate another architecture.

However, once a feature has meaningful application logic, use the corresponding layer consistently.

---

# 3. Django Models

Django models represent persistent domain data and database invariants.

Models should primarily contain:

- Fields
- Relationships
- Database constraints
- Useful model-level behavior
- Small, cohesive domain behavior directly tied to the entity

Avoid turning models into enormous "god objects".

## Model responsibilities

Models may contain behavior such as:

```python
order.cancel()
invoice.mark_as_paid()
user.is_active_customer()
```

when that behavior is intrinsic to the model.

Models should not:

- Make HTTP requests
- Return DRF responses
- Depend on serializers
- Know about API URLs
- Contain controller logic
- Coordinate unrelated application workflows

## Database constraints

Use database constraints for invariants that must always hold.

Examples:

```python
class Meta:
    constraints = [
        models.UniqueConstraint(
            fields=["organization", "name"],
            name="unique_organization_name",
        ),
    ]
```

Do not rely exclusively on application-level checks for uniqueness or other invariants that the database can enforce.

---

# 4. Django Migrations

Migrations are version-controlled source code.

Rules:

- Every schema change must have a migration.
- Never manually modify an already-applied migration unless there is a deliberate migration-management reason.
- Migration names should describe the change.
- Review generated migrations before committing them.
- Avoid unnecessary migration churn.
- Data migrations must be treated carefully, especially for large datasets.
- Do not put expensive application logic into migrations.
- Schema changes and data migrations should be separated when that makes deployment safer.

Production deployments must be able to reproduce the database schema from the migration history.

---

# 5. QuerySets and ORM Usage

Prefer Django ORM over raw SQL unless raw SQL is genuinely required.

Good:

```python
User.objects.filter(is_active=True)
```

Avoid:

```python
User.objects.raw(...)
```

unless the query cannot reasonably be expressed through the ORM or there is a demonstrated performance/SQL requirement.

## Query efficiency

Be deliberate about query count.

Use:

- `select_related()` for suitable foreign-key/one-to-one relationships.
- `prefetch_related()` for many-to-many and reverse relationships.
- `only()` / `defer()` only when there is a demonstrated reason.
- `annotate()` and database-side aggregation when appropriate.
- Bulk operations when they preserve required behavior.

Avoid accidental N+1 queries.

Example:

```python
orders = (
    Order.objects
    .select_related("customer")
    .prefetch_related("items")
)
```

Do not add eager loading blindly. It should correspond to the data actually consumed by the operation.

---

# 6. Query Logic: Selectors

Selectors encapsulate reusable or sufficiently complex read/query logic.

Example:

```python
def get_active_orders_for_customer(customer_id):
    return (
        Order.objects
        .filter(customer_id=customer_id, status=OrderStatus.ACTIVE)
        .select_related("customer")
    )
```

Use selectors when:

- A query is reused.
- A query is sufficiently complex.
- Query construction is becoming a responsibility of its own.
- A service would otherwise become cluttered with ORM details.

Do not create selectors for trivial one-line queries merely to add abstraction.

Selectors should generally be read-oriented.

They should not perform business mutations.

---

# 7. Repositories

Repositories provide an explicit persistence boundary when the feature benefits from one.

Repositories are appropriate when:

- Persistence behavior is non-trivial.
- Multiple operations form a meaningful persistence abstraction.
- The application layer should not know ORM details.
- A meaningful infrastructure boundary exists.

Example:

```python
class OrderRepository:
    def get_by_id(self, order_id):
        ...

    def save(self, order):
        ...

    def delete(self, order):
        ...
```

Do not create repositories whose only purpose is to wrap:

```python
Model.objects.get(...)
```

without adding a meaningful boundary.

Repositories should not contain business workflows.

---

# 8. Application Services

Application services orchestrate business use cases.

Examples:

```python
create_order(...)
cancel_order(...)
complete_checkout(...)
change_customer_email(...)
```

A service may coordinate:

- Multiple repositories
- Domain/model behavior
- Transactions
- External service calls
- Business rules
- Multiple related operations

Example:

```python
@transaction.atomic
def create_order(...):
    ...
```

The service should not know about:

- `request`
- HTTP status codes
- DRF `Response`
- URL parameters
- HTTP headers

This keeps application behavior independently testable.

---

# 9. Transactions

Transactions should represent meaningful business operation boundaries.

Use:

```python
transaction.atomic()
```

when multiple database operations must succeed or fail together.

Example:

```python
@transaction.atomic
def transfer_balance(...):
    ...
```

Avoid wrapping every function in a transaction automatically.

A transaction should answer:

> Which operations must be atomic together?

## Concurrency

Consider concurrency explicitly for operations such as:

- Balance changes
- Inventory
- Counters
- State transitions
- Unique resource allocation
- Queue-like processing

Use appropriate mechanisms such as:

- `transaction.atomic()`
- `select_for_update()`
- `F()` expressions
- Database constraints

Do not assume Python-level checks are safe under concurrent requests.

---

# 10. DRF Views and ViewSets

DRF views are responsible for HTTP/API concerns.

They coordinate:

- Authentication
- Permissions
- Request parsing
- Serializer selection
- Application service invocation
- Response construction

They should remain thin.

Good:

```python
def create(self, request):
    serializer = CreateOrderSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    order = create_order(**serializer.validated_data)

    return Response(
        OrderSerializer(order).data,
        status=status.HTTP_201_CREATED,
    )
```

Avoid putting the complete business workflow inside the ViewSet.

DRF performs authentication, permission and throttle checks before the handler executes.

## ViewSet usage

Use `ModelViewSet` when conventional CRUD semantics are appropriate.

Use `GenericViewSet` + selected mixins when only some CRUD operations are required.

Use `APIView` when explicit control makes the endpoint clearer.

Do not use `ModelViewSet` simply because it is convenient if the resource does not actually represent conventional CRUD.

ViewSets and routers are useful for consistency, but regular views are sometimes more explicit and appropriate.

---

# 11. DRF Actions

Custom ViewSet actions should represent meaningful resource operations.

Example:

```python
@action(detail=True, methods=["post"])
def cancel(self, request, pk=None):
    ...
```

The action should delegate meaningful behavior to an application service when the operation contains business logic.

Avoid:

```python
@action(...)
def do_everything(...):
    # 150 lines of business logic
```

Keep action methods as orchestration boundaries.

Use routers consistently when using `@action`; do not bypass router configuration in ways that can ignore action-specific settings.

---

# 12. DRF Serializers

Serializers define the API representation and validate API input.

Use serializers for:

- Input validation
- Field validation
- Cross-field API validation
- Representation
- Converting validated API data into application-level input

Always validate before accessing validated input:

```python
serializer.is_valid(raise_exception=True)
```

DRF serializers support both field-level and object-level validation.

## Serializer responsibilities

Good:

```python
def validate(self, attrs):
    if attrs["start"] >= attrs["end"]:
        raise serializers.ValidationError(
            {"end": "End must be after start."}
        )
    return attrs
```

Avoid putting large business workflows into serializers.

If validation requires a significant business process or multiple repositories/services, move that logic into an application service or domain component.

---

# 13. Input vs Output Serializers

Do not assume one serializer must handle every operation.

It is acceptable and often preferable to have:

```text
CreateOrderSerializer
UpdateOrderSerializer
OrderSerializer
OrderListSerializer
```

when input and output contracts differ.

This prevents API representations from becoming coupled to database models.

Do not expose every model field automatically.

Prefer explicit fields:

```python
fields = [
    "id",
    "name",
    "created_at",
]
```

rather than:

```python
fields = "__all__"
```

unless there is a deliberate reason.

---

# 14. Serializer `create()` and `update()`

Serializer `create()` / `update()` should remain focused.

They may be appropriate for straightforward persistence behavior.

For complex operations:

```text
View
  ↓
Serializer validation
  ↓
Application Service
  ↓
Repository / ORM
```

Prefer application services when the operation involves:

- Multiple models
- Transactions
- External systems
- Complex business rules
- Multiple persistence operations
- Significant orchestration

---

# 15. DRF Permissions

Authentication answers:

> Who is this?

Authorization answers:

> Is this user allowed to perform this operation?

Never treat authentication as authorization.

Use explicit permission classes.

Examples:

```python
permission_classes = [
    IsAuthenticated,
    CanManageOrders,
]
```

Use:

- View-level permissions for broad endpoint access.
- Object-level permissions for individual resources.
- Queryset restrictions for list visibility.

DRF explicitly distinguishes queryset filtering, permission classes, and serializer-level restrictions because they solve different authorization problems.

## Object ownership

For user-owned resources, prefer restricting the queryset:

```python
def get_queryset(self):
    return Order.objects.filter(owner=self.request.user)
```

This ensures unauthorized objects are not accidentally exposed through list or detail operations.

Object-level permission checks are important, but they do not automatically filter every object in a list queryset.

This is the enforcement side of the trust boundary described in root `AGENTS.md` § Authentication & Trust Boundary — the frontend may hide controls, but every rule above must hold regardless of what the client sends.

---

# 16. DRF Filtering

Use DRF-supported filtering mechanisms rather than manually parsing query parameters.

Prefer:

- `django-filter`
- DRF `OrderingFilter`
- DRF `SearchFilter` when appropriate
- Explicit `get_queryset()` logic for authorization and contextual filtering

Example:

```python
def get_queryset(self):
    return Order.objects.filter(
        organization=self.request.user.organization
    )
```

Do not allow arbitrary model fields to become query parameters without deliberate filtering rules.

---

# 17. Pagination

Collection endpoints should use pagination when datasets can grow.

Use DRF pagination rather than manually implementing:

```text
?page=...
```

in each endpoint.

Pagination configuration should be consistent across the API unless an endpoint has a legitimate reason to differ.

Paginated querysets should have deterministic ordering where appropriate.

Avoid unstable pagination caused by ordering on non-unique fields.

---

# 18. API Error Handling

Do not return arbitrary error formats from individual views.

Use DRF's exception mechanism and a centralized exception handler when a consistent API error contract is required.

DRF already handles common exceptions such as `APIException`, `Http404`, and `PermissionDenied`.

Application-level exceptions should be meaningful.

For example:

```python
class OrderAlreadyCancelled(ApplicationError):
    code = "order_already_cancelled"
```

The API layer can translate this into an appropriate HTTP response.

Do not leak:

- Stack traces
- Database errors
- Internal service details
- Secrets
- Credentials
- Infrastructure information

to clients.

---

# 19. HTTP Status Codes

Use HTTP semantics consistently.

Examples:

```text
200 OK
201 Created
202 Accepted
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity (only if deliberately standardized)
429 Too Many Requests
500 Internal Server Error
```

Do not return `200 OK` for an operation that clearly failed.

Do not use status codes merely because they are convenient.

---

# 20. Authentication

Authentication is JWT-based. The full frontend/backend contract is defined in root `AGENTS.md` § Authentication & Trust Boundary — this section is backend-specific implementation detail only.

- Access tokens must be short-lived.
- Refresh tokens must be issued and read via a secure, HttpOnly cookie — never returned in a JSON body the frontend could persist insecurely.
- Authentication endpoints (login, refresh, token issuance) require additional protection because they are common attack targets: rate limiting, lockout, and logging of failed attempts.

---

# 21. CSRF

Because authentication involves cookies, CSRF must be treated explicitly.

Do not disable Django CSRF protection globally to make authentication "easier".

Unsafe state-changing requests should have the required CSRF protection.

Configure:

- Trusted origins
- Secure cookies
- HTTPS
- Appropriate SameSite policy

CSRF protection and CORS are separate security mechanisms.

---

# 22. CORS

CORS must be explicit.

Never use unrestricted production configuration such as:

```python
CORS_ALLOW_ALL_ORIGINS = True
```

unless there is a very deliberate and documented reason.

Production origins should be explicitly configured.

CORS is not an authentication mechanism.

---

# 22a. Rate Limiting

Rate limiting protects the API from abuse independently of authentication/authorization.

Use DRF's built-in throttling (`AnonRateThrottle`, `UserRateThrottle`, or a scoped custom throttle class) rather than hand-rolling request counting.

- Apply a stricter throttle to unauthenticated/auth endpoints (login, token refresh) than to normal authenticated traffic — these are the endpoints most attractive to abuse.
- Configure limits via `DEFAULT_THROTTLE_RATES` so they're centrally visible, not scattered per-view.
- Rate limiting is a defense against abuse, not a substitute for authentication or authorization — it does not replace anything in § DRF Permissions.

---

# 23. Django Security Settings

Production configuration must be reviewed with Django's deployment checklist in mind.

At minimum, evaluate:

```python
DEBUG = False

ALLOWED_HOSTS = [...]

CSRF_TRUSTED_ORIGINS = [...]

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
```

Also evaluate:

- HTTPS enforcement
- HSTS
- Secure cookie attributes
- Secret management
- Database credentials
- Error reporting
- Allowed hosts
- Security middleware
- Dependency updates

Never commit secrets to source control.

---

# 24. Secrets and Configuration

Configuration must come from environment-specific configuration.

Never hardcode:

```python
SECRET_KEY = "..."
DATABASE_PASSWORD = "..."
JWT_SECRET = "..."
```

Use environment variables or a proper secret-management mechanism.

Do not log environment variables wholesale.

Do not expose server configuration through API responses.

---

# 25. External Services

External systems should be accessed through explicit service/provider boundaries.

For example:

```text
Application Service
      ↓
EmailService
      ↓
EmailProvider
```

The business workflow should not contain provider-specific implementation details everywhere.

Avoid:

```python
stripe.SomeProvider(...)
```

throughout unrelated business logic.

Prefer:

```python
payment_service.charge(...)
```

with the provider implementation isolated appropriately.

---

# 26. External API Failures

Treat external systems as unreliable.

Explicitly handle:

- Timeouts
- Connection errors
- Rate limits
- Invalid responses
- Authentication failures
- Partial failures
- Retries where safe

Do not retry blindly.

Retries must consider idempotency.

Never make an operation retryable if repeating it can accidentally create duplicate side effects unless idempotency is guaranteed.

---

# 27. Idempotency

Operations that may be retried should be evaluated for idempotency.

Examples:

```text
POST /payments
POST /orders
POST /webhooks
```

When appropriate, support an idempotency key or equivalent business identifier.

Database constraints should help enforce uniqueness when possible.

---

# 28. Logging

Use structured logging.

Logs should provide enough context to diagnose production behavior.

Useful context includes:

- Request ID
- User ID where appropriate
- Endpoint
- HTTP method
- Status code
- Duration
- Application event
- Exception type

Never log:

- Passwords
- JWTs
- Refresh tokens
- API keys
- Secrets
- Full authentication headers
- Sensitive personal data unnecessarily

---

# 29. Observability

Production systems should provide appropriate:

- Structured logs
- Error tracking
- Metrics
- Request correlation
- Performance visibility

Observability should help answer:

```text
What failed?
Where did it fail?
For which request?
How long did it take?
What dependency was involved?
```

Do not add an observability platform solely because it is fashionable. Add it where operational visibility requires it.

---

# 30. Performance

Performance optimizations should be evidence-driven.

Before optimizing:

1. Identify the bottleneck.
2. Measure it.
3. Change one meaningful thing.
4. Measure again.
5. Keep the change only if it improves the relevant metric.

Common Django performance problems to check:

- N+1 queries
- Missing indexes
- Unbounded querysets
- Inefficient serialization
- Excessive database round trips
- Repeated external requests
- Unnecessary computation

Do not add caching to hide inefficient database behavior without understanding the underlying problem.

---

# 31. Caching

Caching is allowed when it solves a demonstrated performance or scalability requirement.

Before adding a cache, define:

- What is cached?
- For how long?
- Who owns invalidation?
- What happens when stale?
- What happens when the cache is unavailable?
- Is the data user-specific?
- Could authorization information become stale?

Never cache sensitive/user-specific responses without carefully considering isolation and invalidation.

Caching must not weaken authorization.

---

# 32. Background Processing

Background processing runs on Celery with Redis as the broker/result backend (see root `AGENTS.md` § Local Development Environment for the `worker`/`redis` Compose services).

That does not mean every slow or incidental operation should go through it:

- Use it for operations that genuinely benefit from asynchronous execution — e.g. notifying a user when a task is assigned to them, a periodic sweep that flags overdue tasks, a reminder before a due date.
- Do not route trivial, fast, synchronous-safe operations (a plain model save) through Celery merely because the infrastructure exists.
- Isolate task invocation behind an application-level boundary — an application service calls `.delay()` / `.apply_async()`; a view never does.
- Define failure/retry semantics explicitly per task, and confirm a task is actually idempotent (§ Idempotency) before enabling automatic retries.
- Do not introduce Kafka or additional queueing systems beyond Celery + Redis without a concrete requirement.

---

# 33. API Versioning

All public API endpoints should use an explicit version:

```text
/api/v1/...
```

Breaking changes require a new API version or an explicitly managed migration strategy.

Avoid silently changing:

- Field meaning
- Field types
- Required fields
- Authorization semantics
- Response structures

without considering client compatibility.

---

# 34. API Naming

Use predictable REST-oriented naming.

Prefer:

```text
GET    /api/v1/orders/
POST   /api/v1/orders/
GET    /api/v1/orders/{id}/
PATCH  /api/v1/orders/{id}/
DELETE /api/v1/orders/{id}/
```

For meaningful state transitions:

```text
POST /api/v1/orders/{id}/cancel/
```

rather than arbitrary RPC-like naming such as:

```text
POST /api/v1/doCancelOrderNow/
```

Use plural resource names consistently.

---

# 35. API Documentation

Every externally consumed endpoint should have documented:

- Purpose
- Authentication requirements
- Permissions
- Request parameters
- Request body
- Response body
- Validation errors
- Possible HTTP statuses
- Pagination/filtering behavior

Use `drf-yasg` (or `drf-spectacular`) to generate and serve interactive OpenAPI/Swagger documentation rather than maintaining a hand-written endpoint list.

Documentation should describe the actual API contract rather than an idealized future version.

---

# 36. Testing Strategy

Use `pytest` with `pytest-django` as the test runner — not Django's built-in `unittest`-style `TestCase` runner — and `pytest-cov` to track coverage. Maintain at least 80% coverage, concentrated on critical endpoints (authentication, task CRUD, permissions) rather than chased for its own sake on trivial code.

Prefer writing the test before the implementation (TDD) for new endpoints and business rules, rather than treating tests as a verification step bolted on afterward.

Tests should exist at multiple levels.

## Unit tests

Use for:

- Business rules
- Services
- Domain behavior
- Complex validators
- Pure functions

## Integration tests

Use for:

- Repository/database behavior
- Transactions
- External service boundaries
- ORM behavior

## API tests

Use for:

- Authentication
- Authorization
- Serialization
- Validation
- HTTP status codes
- Response shape
- Filtering
- Pagination

DRF provides `APIClient`, `APIRequestFactory`, and `RequestsClient` specifically for different levels of API testing.

---

# 37. What Tests Must Protect

Tests should explicitly protect important behavior.

At minimum, when relevant:

```text
Authentication
Authorization
Object ownership
Validation
Business rules
State transitions
Database constraints
Transactions
Concurrency-sensitive behavior
External service failures
API contracts
```

Do not only test successful paths.

Important negative cases are often more valuable than additional happy-path tests.

---

# 38. API Testing Example

A typical API test should verify behavior rather than implementation details.

Example:

```python
def test_user_cannot_access_another_users_order(api_client):
    api_client.force_authenticate(user=user)

    response = api_client.get(
        f"/api/v1/orders/{other_users_order.id}/"
    )

    assert response.status_code == 404
```

Whether the application chooses `404` or `403` for resource isolation should be an intentional security/API decision, not an accidental framework behavior.

---

# 39. Permissions Testing

Every meaningful permission rule should have tests.

Test:

```text
Unauthenticated user
Authenticated unauthorized user
Authorized user
Resource owner
Non-owner
Administrator
Different organization/tenant
```

when those concepts exist.

Do not assume permission code is correct simply because the endpoint has `IsAuthenticated`.

---

# 40. Validation Testing

Test:

- Required fields
- Invalid types
- Boundary values
- Cross-field rules
- Duplicate values
- Invalid state transitions
- Unauthorized relationships
- Malformed input

Do not rely solely on frontend validation.

---

# 41. Database Integrity Testing

Important database constraints should have tests proving their intended behavior.

Examples:

- Unique constraints
- Foreign keys
- Check constraints
- Required relationships

Application validation improves developer/user feedback, but database constraints remain the final integrity boundary.

---

# 42. Concurrency Testing

When behavior depends on concurrency, write tests that expose the race condition.

Examples:

```text
Two requests updating the same balance
Two users claiming the same resource
Two workers processing the same job
Two requests creating the same unique entity
```

Do not assume sequential unit tests prove concurrency safety.

---

# 43. Django Admin

Django Admin is an operational interface, not a replacement for API authorization.

Admin configuration should:

- Expose useful fields
- Provide appropriate search/filtering
- Avoid exposing unnecessary sensitive data
- Respect model relationships
- Remain usable for operational tasks

Do not add dangerous administrative actions without explicit confirmation and appropriate authorization.

---

# 44. Dependency Management

Keep Django, DRF, and other dependencies reasonably current.

When upgrading:

1. Review release notes.
2. Run the complete test suite.
3. Review deprecations.
4. Review security implications.
5. Verify migrations.
6. Test authentication and authorization.
7. Test production configuration.

Do not upgrade dependencies blindly as part of unrelated feature work.

---

# 44a. Project Tooling

Dependency and quality tooling should be declared in `pyproject.toml`, not scattered across `requirements*.txt`, ad hoc scripts, and undocumented local setup.

- Use Poetry or uv to manage dependencies and the virtual environment — pick one and use it consistently; don't mix with a second tool.
- Configure pre-commit hooks (formatting, linting, and at minimum a check that tests aren't broken) so issues are caught before they reach review, not during it.
- Prefer `ruff` for linting/formatting (it replaces the separate flake8/isort/black combination) unless there's a reason to keep them separate.
- Document the chosen tooling and how to run it in `README.md` (see root `AGENTS.md` § Documentation & Demo Readiness) — a reviewer should be able to reproduce your checks without guessing the commands.

---

# 45. Error Handling Philosophy

Distinguish between:

### Expected business errors

Examples:

```text
OrderAlreadyCancelled
InsufficientBalance
InvalidStateTransition
ResourceAlreadyExists
```

These should produce intentional API responses.

### Unexpected programming/system errors

Examples:

```text
AttributeError
Database connection failure
Unexpected provider response
```

These should be logged and monitored without exposing internal details to the client.

Never catch:

```python
except Exception:
    pass
```

or silently suppress failures.

---

# 46. Avoid Fat Views

A ViewSet should not become:

```text
authentication
validation
business logic
database queries
external APIs
transactions
serialization
error handling
```

all in one class.

If a view starts becoming large, identify the responsibility that should move into:

- Serializer
- Permission
- Selector
- Repository
- Application service
- Domain/model behavior

---

# 47. Avoid Fat Serializers

Serializers should not become the application's business layer.

Avoid:

```python
def create(self, validated_data):
    # 100 lines of business logic
```

If creation involves meaningful orchestration, move it to an application service.

---

# 48. Avoid Fat Models

Do not put unrelated application workflows into models merely because the model is convenient.

A model may own behavior intrinsic to itself.

A workflow involving several aggregates, external systems, or application concerns belongs elsewhere.

---

# 49. Avoid Generic Utility Modules

Do not create:

```text
utils.py
helpers.py
common.py
misc.py
```

as dumping grounds.

Prefer named modules with explicit responsibilities:

```text
permissions.py
exceptions.py
services.py
selectors.py
repositories.py
security.py
pagination.py
```

If a utility has a meaningful domain, put it there.

---

# 50. Dependency Injection

Prefer explicit dependencies.

Avoid hidden dependencies such as:

```python
SomeService().run()
```

when the service silently constructs all infrastructure dependencies internally.

Where useful:

```python
service = OrderService(
    repository=repository,
    payment_service=payment_service,
)
```

Dependency injection should be proportional to complexity.

Do not introduce a dependency injection framework merely to satisfy the concept.

---

# 51. Domain Logic Placement

When deciding where logic belongs, ask:

### Is it HTTP-specific?

→ View / DRF layer

### Is it API input/output validation?

→ Serializer

### Is it a reusable database query?

→ Selector

### Is it persistence behavior?

→ Repository

### Is it a business workflow?

→ Application service

### Is it intrinsic behavior of one domain entity?

→ Model/domain object

### Is it access control?

→ Permission/queryset

This decision tree should be preferred over arbitrary placement.

---

# 52. Code Review Checklist

Before considering backend work complete, verify:

### Architecture

- Is responsibility in the correct layer?
- Is business logic outside the view?
- Are dependencies flowing in the correct direction?
- Were unnecessary abstractions avoided?

### API

- Is the endpoint REST-consistent?
- Are serializers explicit?
- Are status codes correct?
- Is pagination required?
- Is filtering safe?

### Security

- Is authentication correct?
- Is authorization enforced server-side?
- Are object-level access rules covered?
- Is CSRF correctly configured?
- Is sensitive information absent from logs?
- Are secrets externalized?

### Database

- Are constraints correct?
- Are transactions necessary?
- Could concurrent requests race?
- Could this produce N+1 queries?
- Are indexes appropriate?

### Testing

- Happy path?
- Validation failure?
- Unauthorized access?
- Object ownership?
- Business failure?
- Database constraint?
- Concurrency where applicable?

---

# 53. Agent Behavior

When modifying the backend:

1. Inspect the existing architecture before creating new patterns.
2. Reuse established conventions.
3. Do not introduce a new architectural style for one feature.
4. Prefer framework-native DRF/Django mechanisms.
5. Keep views thin.
6. Keep serializers focused.
7. Put business workflows in application services.
8. Put reusable complex reads in selectors.
9. Use repositories only when they provide meaningful value.
10. Enforce critical invariants at the database level when possible.
11. Treat authorization as a first-class requirement.
12. Consider concurrency for state-changing operations.
13. Write or update tests for behavior being changed.
14. Never weaken security settings merely to make development easier.
15. Do not expose secrets or sensitive data in logs or responses.
16. Do not introduce infrastructure such as Redis, Celery, Kafka, or microservices without a concrete requirement.
17. When uncertain about architecture, inspect neighboring features and follow the established pattern rather than inventing a new one.

---

# 54. Definition of Done for Backend Features

A backend feature is not complete merely because the endpoint works.

A feature is complete when appropriate:

- Model changes
- Migrations
- Serializers
- Permissions
- Querysets/selectors
- Application services
- Transactions
- Database constraints
- API documentation
- Tests
- Error handling
- Logging/observability
- Security considerations

have been addressed.

Only include the pieces that are actually relevant to the feature.

The goal is not maximum abstraction.

The goal is **clear responsibility, strong invariants, predictable APIs, secure authorization, and maintainable code.**

---

# 54a. Data Seeding

The submitted application must come up with representative data already loaded — a reviewer should not have to manually create users and tasks before they can evaluate anything.

- Provide a management command (e.g. `python manage.py seed_demo_data`) or fixtures that create at least one demo user with known credentials and a handful of tasks across different statuses/due dates, so filtering and pagination are visible immediately.
- Run seeding automatically as part of local/Compose setup, or document the single command to run it — don't leave it implicit.
- Never seed demo credentials into a production-like settings profile; keep seeding scoped to local/demo configuration.
- Document the demo credentials in `README.md` (see root `AGENTS.md` § Documentation & Demo Readiness).
