import { http, HttpResponse, type RequestHandler } from "msw";

const BASE = "http://localhost:8000/api/v1";

/** A Supervisor, so the default fixture can see every task. */
export const currentUser = {
  id: "01999aaa-0000-7000-8000-00000000user",
  email: "supervisor@demo.local",
  first_name: "Sam",
  last_name: "Supervisor",
  role: "SUPERVISOR",
};

export const emptyPage = { count: 0, next: null, previous: null, results: [] };

export const zeroedStats = {
  total: 0,
  by_status: { PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 },
  overdue: 0,
  due_next_7_days: 0,
};

/**
 * Defaults every test can rely on, so each test overrides with server.use()
 * only what it actually cares about. `onUnhandledRequest: "error"` in setup.ts
 * means anything not listed here is a deliberate per-test decision.
 */
export const handlers: RequestHandler[] = [
  http.get(`${BASE}/users/me/`, () => HttpResponse.json(currentUser)),
  http.get(`${BASE}/users/`, () => HttpResponse.json(emptyPage)),
  http.get(`${BASE}/tasks/`, () => HttpResponse.json(emptyPage)),
  http.get(`${BASE}/tasks/stats/`, () => HttpResponse.json(zeroedStats)),
  /**
   * The default fixture represents a VALID session (spec §4.5).
   *
   * Once AuthContext bootstraps refresh-first, this is the request that decides
   * whether a rendered test is signed in — `/users/me/` no longer is. Tests
   * that want an anonymous visitor override this with a 401, which
   * LoginPage.test.tsx already does.
   */
  http.post(`${BASE}/auth/refresh/`, () =>
    HttpResponse.json({ access: "default-fixture-access-token" }),
  ),
];
