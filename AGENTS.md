# AGENTS.md

## 1. Project Description

This project is a full-stack web application with:

- **Backend:** Django + Django REST Framework — see [`backend/AGENTS.md`](backend/AGENTS.md)
- **Frontend:** React + Vite — see [`frontend/AGENTS.md`](frontend/AGENTS.md)
- **Database:** PostgreSQL
- **API:** REST + JSON, versioned at `/api/v1/...`
- **Authentication:** JWT
- **Local development:** Docker Compose (backend + PostgreSQL)

This root file holds only guidance that applies **across** both sides of the stack: shared engineering principles, the boundary between frontend and backend, the authentication contract, the local dev environment, and the general decision rule.

Everything specific to one side of the stack — Django/DRF patterns, React component/state patterns, styling, testing, etc. — lives in:

- [`backend/AGENTS.md`](backend/AGENTS.md)
- [`frontend/AGENTS.md`](frontend/AGENTS.md)

When working inside `backend/` or `frontend/`, read this file **and** that directory's `AGENTS.md`.

The codebase must prioritize maintainability, explicit boundaries, testability, security, and predictable behavior.

Do not introduce architectural complexity merely because a pattern is popular. Every abstraction should have a meaningful responsibility.

---

# 2. Core Engineering Principles

Follow these principles throughout the project, on both sides of the stack:

1. Prefer simple, explicit code over clever code.
2. Keep responsibilities narrow.
3. Separate HTTP concerns from application/business logic.
4. Keep persistence concerns behind appropriate boundaries.
5. Do not duplicate business rules across views, serializers, and frontend code.
6. Keep authorization on the backend; never trust the frontend.
7. Treat database constraints as part of the domain's integrity.
8. Prefer explicit dependencies over hidden global state.
9. Make transactional boundaries explicit.
10. Optimize based on evidence rather than speculation.
11. Avoid premature abstractions, but do not allow business logic to accumulate in controllers/views (or their frontend equivalent, components).
12. Prefer framework-supported mechanisms over custom implementations when they solve the problem correctly.
13. Write code that another engineer can understand without knowing the history of the feature.

---

# 3. System Boundary

The system is split into two independently-evolving layers that talk only over the HTTP API:

```text
React UI              HTTP API              Django / DRF            PostgreSQL
(frontend/)   ───►   /api/v1/...   ───►      (backend/)     ───►
```

Neither side should reach across that boundary:

- The frontend never talks to the database directly or assumes backend internals.
- The backend never assumes anything about how the frontend renders, stores, or caches data.

Each side's internal request/data flow is documented where that code actually lives, not here:

- Backend request flow: [`backend/AGENTS.md`](backend/AGENTS.md) § Architecture
- Frontend data flow: [`frontend/AGENTS.md`](frontend/AGENTS.md) § Architecture

---

# 4. Authentication & Trust Boundary

Authentication is JWT-based. This is the one contract both sides must honor identically — it is documented here rather than in either sub-doc because getting it wrong on either side breaks the other.

```text
Login
  ↓
Access Token
  ↓
Frontend memory (never persistent storage)

Refresh Token
  ↓
Secure HttpOnly Cookie
```

- Access tokens are short-lived and live only in frontend memory (e.g. a React context populated at login), never in `localStorage`/`sessionStorage`.
- Refresh tokens are issued and read via a secure, HttpOnly cookie — the frontend never reads or stores it directly.
- **Authorization is always enforced server-side.** The frontend may hide or disable controls for UX, but that is never a security mechanism:

```javascript
// Never rely on this as the only check:
if (user.isAdmin) {
    showDeleteButton();
}
```

The server must assume clients can send arbitrary HTTP requests regardless of what the UI exposes or hides.

Side-specific implementation detail:

- Backend: token issuance, endpoint protection, CSRF/CORS — [`backend/AGENTS.md`](backend/AGENTS.md) § Authentication
- Frontend: token storage, attaching credentials, handling expiry — [`frontend/AGENTS.md`](frontend/AGENTS.md) § API Client & Authentication

---

# 5. Local Development Environment (Docker Compose)

Use Docker Compose to run the whole stack — frontend, backend, and PostgreSQL — locally with one command, so every developer/agent runs the same database version and backend environment instead of relying on whatever is installed on the host machine.

Scope Docker Compose to what local development actually needs, including a background worker for asynchronous task processing (see `backend/AGENTS.md` § Background Processing):

```text
frontend  (Vite dev server)
backend   (Django app)
worker    (Celery worker, same image as backend)
redis     (Celery broker/result backend)
db        (PostgreSQL)
```

Do not add further services beyond this (a beat/scheduler process, Flower, extra queues, Kafka) "for consistency" — only what's actually needed.

## Frontend: Compose for convenience, native for active development

The `frontend` service runs the same `npm run dev` Vite dev server, so `docker compose up` brings up the entire stack and is reachable at `localhost:5173` — useful for onboarding, demoing, or exercising the full stack without a local Node install.

For day-to-day frontend development, install dependencies locally and run `npm run dev` directly instead:

- Vite's dev server and HMR are noticeably faster against the native filesystem than through a bind-mounted `node_modules` (especially on Windows).
- There is no cross-machine drift problem to solve on the frontend the way there is for a database engine/version, so there's little lost by running it natively.

Treat the Compose `frontend` service as how you run the whole stack together, not as the primary edit loop.

## Structure

```text
.
├── docker-compose.yml
├── .env.example
├── backend/
│   └── Dockerfile
└── frontend/
    └── Dockerfile
```

## Example `docker-compose.yml`

```yaml
services:
  frontend:
    build:
      context: ./frontend
    command: npm run dev -- --host 0.0.0.0
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    env_file:
      - .env

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
    command: python manage.py runserver 0.0.0.0:8000
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  worker:
    build:
      context: ./backend
    command: celery -A config worker --loglevel=info
    volumes:
      - ./backend:/app
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started

volumes:
  postgres_data:
```

## Example `backend/Dockerfile`

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
```

Pin the base image to whatever Python version the project actually targets.

## Example `frontend/Dockerfile`

```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
```

## Rules

- `docker-compose.yml` defines the **local development** environment only. Production deployment configuration lives in `backend/config/settings/production.py`, a production frontend build, and the deployment pipeline — not in Compose.
- Use a named volume for Postgres data so it survives container restarts.
- Use a `healthcheck` on `db` and `depends_on: condition: service_healthy` on `backend` so the app doesn't start against a database that isn't ready yet.
- Mount source as a volume on `backend` and `frontend` for live reload; do not bake source-only changes into a rebuilt image during normal development.
- On `frontend`, add an anonymous volume for `node_modules` (as in the example above) so the container's installed dependencies aren't shadowed by the bind-mounted source directory.
- Configuration comes from `.env` / `env_file`, never hardcoded into `docker-compose.yml` or the image. Commit `.env.example`, never `.env`.
- Run management commands through the container, not a host Python install, so behavior matches the containerized environment:

```text
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py test
```

- Changing `requirements.txt` requires `docker compose build backend`; changing `package.json` requires `docker compose build frontend` — not just a restart.

---

# 6. Architectural Decision Rule

When there are multiple reasonable implementations, prefer the one that:

1. Has the clearest responsibility boundaries.
2. Has the fewest hidden dependencies.
3. Is easiest to test.
4. Makes authorization explicit.
5. Preserves data integrity.
6. Handles concurrency correctly.
7. Uses the framework's own capabilities appropriately rather than working around them.
8. Does not introduce unnecessary infrastructure.
9. Is consistent with existing project conventions.
10. Will remain understandable as the codebase grows.

This rule applies on both sides of the stack. `backend/AGENTS.md` and `frontend/AGENTS.md` apply it to their own concerns rather than restating it.

---

# 7. Documentation & Demo Readiness

Keep `README.md` (repository root) current — it is the primary deliverable for setup and review, not an afterthought written at the end.

It must cover:

- Setup instructions: Docker Compose for backend/db/worker, `npm install` / `npm run dev` for frontend — see § Local Development Environment.
- Key implementation decisions and why they were made, especially anywhere this document's defaults were deliberately overridden for the task-management domain.
- Demo credentials and confirmation that the database is seeded with representative data (tasks, users, a range of statuses/due dates) — a reviewer should be able to log in and see a populated app immediately, not an empty one. Seeding mechanics are documented in `backend/AGENTS.md` § Data Seeding.
- Prompts used with GenAI coding tools for scaffolding or significant implementation, and how the output was validated or corrected.
