# frontend/AGENTS.md

Frontend-specific conventions for the React + Vite app.

This file assumes the root [`AGENTS.md`](../AGENTS.md) has already been read — it covers the shared engineering principles, the frontend/backend trust boundary, the authentication contract, and the local dev environment. Don't restate those here; this file is React implementation detail only.

---

# 1. Architecture

Data flow:

```text
React UI
    ↓
Feature Hook
    ↓
Feature Service
    ↓
Centralized API Client
    ↓
HTTP API
```

Layers must have clear responsibilities — see root `AGENTS.md` § System Boundary for how this fits into the overall request path into the backend.

---

# 2. Local Development

For day-to-day development, install dependencies locally and run the Vite dev server directly:

```text
npm install
npm run dev
```

This keeps hot module reload fast — Vite watches the native filesystem directly instead of a bind-mounted directory, which is noticeably slower (especially on Windows).

The frontend also has a `frontend` service in the root `docker-compose.yml` (see root `AGENTS.md` § Local Development Environment) so the whole stack can be brought up with a single `docker compose up` — useful for exercising the app end-to-end, onboarding, or anyone who doesn't want a local Node install. Use it to run the full stack together, not as the primary edit loop.

---

# 3. Recommended Frontend Structure

Organize frontend code by feature, mirroring the backend's app-per-feature structure, rather than one large global `components/` directory.

A typical feature should look like:

```text
frontend/
├── src/
│   ├── lib/
│   │   └── api-client.ts        # centralized HTTP client (auth header, base URL, error normalization)
│   │
│   ├── components/              # shared, feature-agnostic UI primitives
│   │
│   ├── features/
│   │   └── tasks/
│   │       ├── components/      # feature-specific UI
│   │       ├── hooks/           # useTasks, useCreateTask, ... (TanStack Query)
│   │       ├── services/        # typed functions calling the API client
│   │       └── types.ts
│   │
│   └── app/                     # routing, providers, top-level layout
│
└── index.html
```

Do not create every layer automatically.

- Do not create a `services/` file that only re-exports a single `fetch` call with no shaping of the request/response.
- Do not split a trivial feature into `components/` + `hooks/` + `services/` subfolders if it is a handful of files — flatten it until it earns the structure.

Once a feature has real data-fetching and multiple components, use the layering consistently so feature code stays predictable to navigate.

---

# 4. State Management

Three kinds of state exist in this frontend, each with one designated tool. Before adding state, decide which kind it is.

### Server state → TanStack Query

Anything that originates from the API (tasks, users, anything persisted in the backend) is server state. Fetch and cache it with TanStack Query; do not copy it into `useState`/Context "for convenience."

```jsx
const { data: tasks } = useQuery({
  queryKey: ["tasks"],
  queryFn: fetchTasks,
});
```

### Shared client state → React Context, only where genuinely necessary

Context is for state multiple distant components need that isn't server state — e.g. the authenticated user, a theme. Do not reach for Context to avoid prop-drilling two levels; that is premature.

### Local UI state → `useState`

Anything scoped to one component or its direct children (a form draft, an open/closed flag) is local state. Default here unless the state is clearly server state or genuinely cross-cutting.

Do not duplicate server state into local state or Context — that reintroduces the cache-invalidation problem TanStack Query already solves.

---

# 5. API Client & Authentication

All HTTP calls go through a single centralized API client (`src/lib/api-client.ts`), not ad hoc `fetch`/`axios` calls scattered across features. Feature `services/` call the client; components never call `fetch` directly.

The client is responsible for:

- Attaching the JWT access token to requests.
- A consistent base URL and `/api/v1/...` prefix.
- Normalizing error responses into a shape features can handle predictably.

Authentication contract (full detail in root `AGENTS.md` § Authentication & Trust Boundary):

- Keep the access token in memory (e.g. an auth Context populated on login), never in `localStorage`/`sessionStorage`.
- Never read or write the refresh token directly — it lives in a secure HttpOnly cookie the browser manages.
- Treat a `401` as "session expired": trigger the refresh flow or sign the user out. Do not retry blindly.

Hiding a control in the UI (`isAdmin && <DeleteButton />`) is a UX decision, not an authorization check — the backend enforces access regardless of what's rendered.

---

# 6. Component Styling

Styling is Tailwind CSS, utility-first, applied directly in JSX. CSS Modules are a narrow fallback; no CSS-in-JS runtime library.

The goal is the same one this document applies elsewhere: predictable, consistent output regardless of who (or which agent session) writes the component. Utility classes plus config-defined design tokens give a single source of truth for spacing/color/typography, rather than every feature inventing its own class names and ad hoc values.

Build mobile-first and layer in Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`) rather than a fixed desktop layout. Check any new screen or non-trivial component at common breakpoints (mobile, tablet, desktop) before considering it done — don't assume a layout that looks right at one width holds at the others.

## Default: Tailwind utility classes

```jsx
function TaskCard({ task }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-200 p-4">
      <span className="text-sm font-medium text-slate-900">{task.title}</span>
    </div>
  );
}
```

- Style directly in JSX with Tailwind utilities. Do not invent a parallel classnames/BEM convention alongside it.
- Define design tokens (colors, spacing, typography, breakpoints) in `tailwind.config.js`. Prefer tokens over arbitrary values:

```text
Prefer:  text-slate-900   p-4      text-sm
Avoid:   text-[#1a1a2e]   p-[17px] text-[13px]
```

Arbitrary values are acceptable only when no token fits and the need is genuinely one-off.

- Use a helper (`clsx` or equivalent) for conditional class composition instead of manual string concatenation or nested ternaries.
- When a utility combination repeats across 3+ components, extract a **React component**, not a CSS class. The reusable unit should be the component — consistent with § Recommended Frontend Structure and § State Management: don't abstract until there's a real, repeated need.

## Fallback: CSS Modules

For the rare case Tailwind cannot express cleanly — complex keyframe animations, third-party widget overrides, print styles — use a co-located CSS Module:

```text
TaskCard.tsx
TaskCard.module.css
```

```css
/* TaskCard.module.css */
@keyframes task-complete {
  from { opacity: 1; }
  to   { opacity: 0; }
}
```

This should be the exception, not a second parallel styling system.

## Avoid

- CSS-in-JS runtime libraries (styled-components, Emotion, etc.) — they add a second styling paradigm and runtime cost that Tailwind already makes unnecessary.
- Global, feature-specific stylesheets. Global CSS is limited to Tailwind's base layer, resets, fonts, and theme-level CSS variables.
- Inline `style={{...}}` objects, except for values genuinely computed at runtime (e.g., a measured pixel width) that cannot be expressed as a class.

---

# 7. Testing

Use Vitest with React Testing Library. Test behavior a user would observe (what renders, what happens on interaction), not implementation details (internal state, which hook fired).

- Test hooks that wrap TanStack Query (loading/error/success rendering) and components with meaningful conditional logic (empty states, permission-driven UI).
- Don't chase a specific coverage number here the way `backend/AGENTS.md` § Testing Strategy does for the API — prioritize the paths a bug would actually be visible in: task creation/editing, status changes, filtering, auth-gated views.
- Mock the API client at the network boundary (e.g. MSW), not by mocking individual component internals.
- Where practical, write the test first for a new hook or component — mirrors the backend's TDD preference.
- No unhandled errors or warnings in the browser console for the implemented flows — treat a console warning as a bug, not noise.

---

# 8. Agent Behavior

When modifying the frontend:

1. Inspect existing components/hooks/services before introducing a new pattern.
2. Reuse the layering in § Recommended Frontend Structure rather than inventing a new one per feature.
3. Put data fetching in a hook via TanStack Query, not inline in a component.
4. Keep API calls behind the centralized client and feature `services/`, never a one-off `fetch`.
5. Never duplicate business rules the backend already enforces (validation, authorization) — treat frontend checks as UX only.
6. Style with Tailwind utilities per § Component Styling; don't introduce a second styling system.
7. Keep components focused on rendering; move non-trivial logic into a hook or service.
8. When uncertain, follow the pattern already used by a neighboring feature rather than inventing a new one.

---

# 9. Definition of Done for Frontend Features

A frontend feature is not complete merely because it renders.

A feature is complete when appropriate:

- Data fetching/mutations wired through TanStack Query hooks
- Loading, error, and empty states handled — not just the happy path
- Server-side validation errors surfaced to the user, not swallowed
- Authorization-driven UI (hiding/disabling controls) matches what the backend actually enforces
- Styling follows § Component Styling conventions, including responsive behavior at common breakpoints
- Tests per § Testing for non-trivial logic, and no console errors/warnings in the flows touched
- No business logic duplicated from the backend

Only include the pieces actually relevant to the feature. The goal is not maximum structure — it's predictable, maintainable UI code that reflects the real state of the backend.
