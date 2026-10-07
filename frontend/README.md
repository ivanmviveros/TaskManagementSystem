# Frontend

The React 19 + TypeScript single-page app for the Task Management System. Setup of the whole
stack, demo credentials and the project overview are in the [root README](../README.md). How
the app is structured is in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#frontend), and the
conventions it follows are in [AGENTS.md](AGENTS.md).

## Commands

Run these from this directory. `npm --prefix` cannot install from the repository root.

| Command | Does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Vite dev server on http://localhost:5173 |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | oxlint |
| `npm run test` | Vitest, once |
| `npm run build` | Typecheck, then a production build |

The API base URL comes from `VITE_API_BASE_URL` and defaults to `http://localhost:8000`.

## Layout

```text
src/
├── app/          router (routes, role guards, search-param validation), providers, layout shell
├── components/   shared primitives: Button, ButtonLink, Pagination, form error, focus helpers
├── features/
│   ├── auth/       sign-in page, AuthContext, auth service
│   ├── dashboard/  statistics page and tiles
│   ├── tasks/      list, detail, create/edit form, filters, sorting, assignee picker
│   └── users/      list, create/edit form, delete dialog
├── lib/          API client (token in memory, single-flight refresh), API errors, dates, pagination
└── test/         MSW server and handlers, render harness, console guard
```

Each feature keeps its own `components/`, `hooks/` (TanStack Query) and `services/` (API calls).
Only `lib/api-client.ts` performs HTTP requests.

## Tests

The tests use Vitest, React Testing Library and MSW. Two settings in `src/test/setup.ts` keep them
honest:

- **An unmocked request fails the test** (`onUnhandledRequest: "error"`).
- **Any unexpected `console.error` or `console.warn` fails the test.** A test that renders an
  error on purpose opts out for one message with `allowConsole(/…/)`.
