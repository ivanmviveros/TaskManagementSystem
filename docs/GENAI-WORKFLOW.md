# GenAI workflow and validation

How this project was built with a GenAI coding agent, and how its output was checked. This
answers the brief's "Generative AI tools" section:
- the prompt used;
- the output it produced;
- how that output was validated and corrected;
- how edge cases, authentication and validation were handled;
- how performance and idiomatic quality were assessed.

## How the work was split

**The code was written by the agent, with minimal direct intervention by the engineer.** The
engineer worked by prompting, reviewing and deciding, iterating with the agent rather than editing
code directly:

- **Agent:** Claude Code (Anthropic), driven through the
  [superpowers](https://github.com/pcvelz/superpowers) skill set. Its `brainstorming`,
  `writing-plans` and `subagent-driven-development` skills impose a fixed process: spec, then
  plan, then test-first implementation, with a review after every step.
- **Engineer's inputs before any code:**
  - **the three `AGENTS.md` files.** They are the engineer's rulebook for the agent, and every
    session reads them before touching code. They cover the layering, permissions, transactions
    and concurrency, error handling, security, background jobs, the testing bar, and the
    frontend's state and styling. The engineer wrote most of the content, with only small AI help
    to organise the files. They were committed first, in `03b2537`, and have never been modified
    since. [TECHNICAL-DECISIONS.md](TECHNICAL-DECISIONS.md#the-conventions-the-engineer-set-in-agentsmd)
    lists their 48 conventions (A1–A48) and where each one landed;
  - the brief prompt.
- **Engineer's work during the build:**
  - reviewing every spec and plan, and correcting them where they were wrong;
  - choosing between the options the agent laid out;
  - raising the issues that started each new iteration.
  [TECHNICAL-DECISIONS.md](TECHNICAL-DECISIONS.md) records, decision by decision, which
  calls were the engineer's and which were the agent's (the **Origin** column).
- **Evidence in the history:** 162 of the 178 commits carry the agent's `Co-Authored-By`
  trailer. The other 16 are merges, the initial `AGENTS.md` commit, the prompt logs, a
  `.gitignore` update and two small spec and plan edits. No commit without the trailer touches
  application code.

## The prompts

The verbatim prompts are in [`docs-external/PROMPT-LOGS.md`](../docs-external/PROMPT-LOGS.md),
together with an example of the code a prompt produced.

**The prompt that generated the full implementation** is the first one in that file. It is a
structured brief:
- the domain and the three roles;
- the backend stack and its constraints (JWT, pagination, filtering, rate limiting, Celery,
  indexing, server-side authorization);
- the database, the testing bar, Docker and the documentation;
- the frontend stack and its screens, and CI.

It ends by handing the brief to the brainstorming skill instead of asking for code. That was
deliberate. The agent first had to turn the brief into a design the engineer could review and
correct, before any code existed to anchor on.

The prompts stay short because the `AGENTS.md` files carry the standing context. A prompt states
what to build; the conventions state how to build it. The planning prompt says so explicitly: it
tells the agent to plan "considering DoD and conventions provided in backend/AGENTS.md and
frontend/AGENTS.md".

Each later iteration follows the same pattern. A short prompt names the problems; the agent
produces a spec, then a plan; the engineer reviews both; then execution runs.

| Iteration | What the engineer asked for | What the agent produced | Decisions |
|---|---|---|---|
| 1. Initial build | The brief above; then a spec review with three corrections | Design spec, then a 53-task plan executed by one prompt | D1–D28 |
| 2. Refinement | Pydantic DTOs, sized seed data, login console errors, a responsive users table, a pre-push fallback | Spec, then an 18-task plan | D29–D37 |
| 3. Bug fixes | Missing delete confirmation, wrong status on edit, dashboard calls to action, a failing CI job | Spec, then a 9-task plan | D38–D44 |
| 4. List navigation | Numbered pager, page sizes, filters in the URL, tab titles | Spec, then a 12-task plan | D45–D58 |
| 4. Browser-check fixes | Five issues from the agent's Playwright pass, assignee search, the unassign bug, the app title | Direct fixes | D59–D65 |
| 5. QA | A Playwright QA report; the engineer added the missing sort indicator; then fixes for all 14 findings | QA report, spec, then a 15-task plan | D66–D78 |
| 6. Structured logging | Structured logs with a request id held in context variables, so one request's lines can be found together. This closed the A30 gap found while documenting | Built test-first in an isolated git worktree, then checked against a live dev server and a real Celery worker | D89–D93 |
| 7. TanStack refactor | TanStack Form, Table and Store in place of the hand-written forms, tables and component state. The engineer chose a mergeable migration, stores for component state, pagination through the table, the form components in the filters, and a full browser QA re-test | A spec and a 23-task plan, both checked against the installed libraries with a typechecked prototype run under Node and jsdom; then execution in a git worktree, followed by a Playwright re-test | D79–D88 |

## The output

Everything under `backend/` and `frontend/` is agent output. Files that represent the quality
bar, worth opening in a review:

| What | File |
|---|---|
| Permission matrix as data, deny by default | [`backend/apps/core/permissions/matrix.py`](../backend/apps/core/permissions/matrix.py) |
| Business rules behind a repository Protocol, notifications after commit | [`backend/apps/tasks/services.py`](../backend/apps/tasks/services.py) |
| Every matrix cell exercised over HTTP | [`backend/apps/core/tests/test_permission_matrix_api.py`](../backend/apps/core/tests/test_permission_matrix_api.py) |
| Idempotent, retry-safe email delivery | [`backend/apps/notifications/tasks.py`](../backend/apps/notifications/tasks.py) |
| Token in memory, single-flight refresh | [`frontend/src/lib/api-client.ts`](../frontend/src/lib/api-client.ts) |
| Console guard that fails any test that logs | [`frontend/src/test/setup.ts`](../frontend/src/test/setup.ts) |

## How the output was validated

No agent output was accepted on its own say-so. Each layer below caught real defects; the
[next section](#what-the-generated-output-got-wrong) lists them.

0. **"Correct" was defined before any output existed.** The engineer's `AGENTS.md` conventions
   set the standard the agent was held to. The specs cite their sections as the reason for a
   decision, for example `backend §7` on when a repository is justified, or `§49` on module
   naming. The plans were written against their definition of done.
1. **Specs reviewed twice before planning.** A separate reviewer subagent checked each spec cold,
   then the engineer reviewed it. The engineer's first review changed four decisions (D8, D9,
   D27, D28).
2. **Plans reviewed before execution.** A reviewer subagent checked every plan against its spec.
   In the list-navigation iteration, the review applied the whole plan to a scratch copy, which
   caught tests that could not pass and code that did not typecheck.
3. **Test-first, with every test seen failing.** Each plan step writes the test, runs it to
   watch it fail, then implements. A test that never failed proves nothing.
4. **Two reviews per task.** After each task, a spec-compliance reviewer and then a code-quality
   reviewer checked the change. The implementer fixed what they found, and the change was
   reviewed again.
5. **Guards checked by breaking them.** The single-flight refresh test, the `select_for_update`
   concurrency test and the coverage gate were each confirmed to *fail* when the mechanism they
   protect was removed.
6. **Real infrastructure, not mocks.** Checked against the running services:
   - migrations on Postgres 16;
   - the Celery worker and beat on Python 3.14;
   - email delivered to MailHog;
   - OpenAPI validated with `spectacular --validate`.
7. **A real browser.** Playwright passes over the running stack found what jsdom cannot see:
   focus loss, stale code in the container and responsive overflow. The
   [QA report](qa/2026-10-07-frontend-qa-report.md) records the last one, with a re-test after
   every fix.
8. **Machine gates on every change:**
   - pre-commit runs ruff, ruff-format and mypy, and pytest before each push;
   - CI runs four jobs: `lint`, `compat`, `backend` and `frontend`;
   - the frontend runs `tsc`, oxlint and Vitest, with a console guard that fails any test that
     logs an unexpected error or warning.

Current results: backend **438 tests, 100% coverage** (gate 80%); frontend **396 tests**,
97.22% statement coverage; typecheck clean; lint at its 4-warning baseline.

## How edge cases, authentication and validation were handled

These areas were not left to the agent's defaults. Most of them start from a rule in the
engineer's `AGENTS.md`:
- the token contract (A3);
- concurrency (A17);
- the permission layers (A20);
- protection of the authentication endpoints (A25);
- idempotent retries (A29).

The spec turned each rule into an explicit decision, and each decision has a test.

**Authentication**
- The access token lives in memory only, and the refresh token in an HttpOnly, `SameSite=Strict`
  cookie scoped to `/api/v1/auth/`.
- Refresh tokens rotate, and the old one is blacklisted, so logout really revokes.
- Login is throttled at 5 per minute per IP.
- Concurrent 401s share one in-flight refresh, so tokens do not race their own rotation.

**Authorization**
- One declarative matrix, deny by default, tested cell by cell.
- Object permissions for the two row-dependent rules (D27, D66).
- Queryset scoping returns a 404 rather than a 403 where a 403 would leak that a row exists.

**Validation, in layers**
1. DRF serializers at the HTTP boundary.
2. Pydantic DTOs at the service boundary; a DTO failure is a 500, because it is a contract bug
   (D30).
3. Service rules: transitions, assignee rules, self-lockout.
4. Database constraints as the last line: a CHECK on `completed_at`, a partial unique index on
   email.

**Edge cases handled explicitly**
- Two concurrent completions (`select_for_update`).
- An enqueue racing its own transaction (`on_commit`).
- A retried email sent twice (unique dedupe key).
- A deleted user's email reused (partial unique index).
- A PATCH that omits a field versus one that sends `null` (D32, D65).
- Terminal statuses.
- An inverted date range.
- A stale page number in a link.
- An Admin locking themselves out.

## How performance and idiomatic quality were assessed

**Performance**
- `django_assert_num_queries` tests pin the query counts of the task list (2), the task
  detail (1), the stats (1) and the user list (2), so an N+1 fails a test.
- `select_related` is chosen per serializer.
- The overdue sweep streams ids with `.iterator()`, served by a partial index.

The schema review for this documentation found one gap: Django's automatic foreign-key indexes
include an unused one on `created_by_id`. It is recorded as an open optimisation in
[TECHNICAL-DECISIONS.md](TECHNICAL-DECISIONS.md#indexing-the-query-indexes-are-partial-the-foreign-key-indexes-are-djangos-defaults).

On the frontend, the previous page stays visible while the next one loads, and typed filters
commit after a 300 ms pause, so there is one request per pause rather than one per keystroke.

**Idiomatic quality**
- ruff runs the `E`, `F`, `I`, `UP`, `B`, `DJ`, `C4`, `SIM` and `RUF` rule sets, plus mypy.
- The frontend runs oxlint, and `tsc --noEmit` with unused locals and parameters as errors.
- Reviews preferred the framework's own mechanism to a hand-rolled one:
  - TanStack Router's `stripSearchParams`, `head` and `notFoundComponent`;
  - DRF throttles and django-filter;
  - simple-history.
- The backend has two lint suppressions (`DJ012`, `DJ001`), each explained in a comment beside
  it. The frontend has none.

## What the generated output got wrong

The point of this section is critical evaluation: where the agent's output disagreed with
reality, and how that was caught.

**Initial build (iteration 1).** Four prompts produced the first version: a brainstorming prompt,
a spec review with three corrections, a planning prompt, and one execution prompt. The plan carried the code,
the commands and the expected output for 53 tasks, which made the failures informative:
where reality disagreed with the plan, it disagreed specifically.

**The plan's largest bet was correct.** D2 assumed the whole dependency set would resolve on
Python 3.14 with Django 6.0. It did, first try — including the git-pinned simplejwt. Neither
documented fallback (Python 3.13 plus `uuid-utils`, or ruff `target-version = "py313"`) was
needed, and the four query-count guards hit their predicted numbers with no adjustment.

**Six claims were wrong and were corrected against the real toolchain:**

- **A plan comment asserted a bug that does not exist.** It justified writing the
  `overdue=false` filter positively by claiming `.exclude()` would "silently drop every
  undated task". That is true of raw SQL but not of Django, which injects
  `AND due_date IS NOT NULL` inside the negated group. Verified by running the naive version
  against the suite — all tests still passed. The positive form was kept for readability and
  the comment rewritten to say so.
- **The task list's delete control was unimplementable as specified.** The list was asked to
  hide delete for an Operator's non-created tasks, while the list serializer deliberately
  omits `created_by`. Resolved by extracting D27 into one `may_delete_task()` predicate read
  by both the permission class and the serializers, surfaced as `can_delete` — computed from
  a local column, so the query counts did not change.
- **The dashboard's drill-through links pointed nowhere.** The list held its filters in local
  state only, so the links would have navigated and then been ignored. The route now
  validates search params and the list seeds from them.
- **The API client refreshed after a failed login.** It excluded only `/auth/refresh/` from
  refresh-and-retry, so a wrong password triggered a pointless refresh whose error replaced
  the server's message and tripped the session-expired handler.
- **Deleting the placeholder dispatcher broke a test the plan did not mention**, leaving an
  orphaned import in the concurrency test.
- **Three toolchain assumptions were stale**: the current Vite template ships Vite 8,
  TypeScript 6 and oxlint rather than Vite 7 and eslint; Vitest config needs
  `vitest/config`'s `defineConfig`; and `npm --prefix` no longer redirects where
  `package.json` is read, so the planned `npm --prefix frontend ci` would have failed in CI.

**Two assertions in the plan were weaker than they looked**, and were strengthened rather
than trusted: the single-flight refresh test and the `select_for_update` concurrency test
were each verified to **fail** when the mechanism they guard was removed (`expected 5 to
be 1`, and both threads completing). A guard that cannot fail is decoration — the coverage
gate was checked the same way.

**One environment difference is worth recording** for anyone writing similar tests: Django
creates Postgres foreign keys as `DEFERRABLE INITIALLY DEFERRED`, so a bad-FK insert does
not raise until `COMMIT`. Inside a test transaction that means teardown, long after the code
under test returned.

**List navigation.** The spec review caught five claims that would have failed at
implementation:
- the router resets scroll on `replace` navigations too, unless told not to;
- a date picked and then cleared within the debounce would have reappeared;
- the spec's own snippets passed an optional page into a required prop and did not typecheck;
- `useNavigate` given the route id rather than its path logs a warning that the console guard
  fails on;
- a `className="px-3"` override cannot beat `Button`'s `px-4`, because classes are merged with
  plain `clsx`.

The plan review applied the whole plan to a scratch copy before any of it was executed. That
caught two tests that found a task title twice — jsdom renders both the table and the mobile
cards — and a middleware constant shared by two routes that did not typecheck. Execution then
followed the plan without correction; the only adaptation was keeping iteration 3's delete
dialog, which had landed in `TaskListPage` in the meantime.

The request's own example pager, "1, 3, 5 (current), 7, 10", read two ways. The project owner
chose a contiguous window over literal steps of two.

**QA fixes (iteration 5).** A Playwright pass produced the QA report; brainstorming turned it
into a spec, and a spec review caught four claims that would have failed at implementation:

- a not-found component wrapped in the app frame would have rendered a **second** header for
  `/tasks/a/b`, because TanStack's default "fuzzy" not-found mode renders it inside the shell;
- the bootstrap regression test would have exercised the test harness's **hand copy** of the
  effect, not the app's;
- the URL whitelist commit needed a module the next commit created;
- the timezone test's example input did not cross midnight, so the bug it targeted would have
  passed it.

Root causes were confirmed in the installed router source (`invalidate()` ends in `load()`)
rather than assumed.

Code review during execution then changed three more decisions: D68's button names, D71's
not-found owner, and D75's dialog focus. The last was found by a real-browser check, because
jsdom cannot reproduce the focus drop.

**TanStack refactor (iteration 7).** The design was checked against the installed packages
before the plan was written: a prototype was typechecked and run under Node and jsdom. That
caught four things the library documentation does not say plainly, each now a decision with a
test that fails without it:
- Form refuses to submit while a field's server error stands in its `onServer` slot, and
  clearing that slot with `{ onServer: undefined }` leaves every field's error in place (D80).
- `useForm` re-applies changed `defaultValues` to an untouched form on every render (D81).
- Form writes a server error map to every registered field, so a generic mapper would have
  shown errors under fields that never displayed one (D80).
- A Table accessor column is sortable unless it opts out, which would have given Title and
  Assignee `aria-sort="none"` (D84).

The spec review then found the user form's missing snapshot and a store-creation pattern that
`useCreateStore` cannot express. The plan review found a "prove it red" step that could not go
red — the existing D40 test passes even without the snapshot, because both sides of its
comparison follow the refetch — and that `main` had moved on under the branch with a docs
reorganisation.

Execution, with a spec and a code-quality review after every task, found eight more, each now
covered by a test shown to fail without its fix:
- Form clears a form-level `onServer` error on the next change or blur, so the sign-in form's
  message would have vanished as the user typed (D80).
- Only a field-level server error blocks the next submit, so the planned re-submit test, which
  started from a form-level error, could not fail (D80).
- The form a field component reads from context is a wrapper of the form that `onSubmit`
  receives; the message store is keyed on the store they share (D80).
- The planned URL sync compared a new write with the rendered URL value, so deleting back to
  the URL's value and typing again could be erased by a late echo (D82).
- The planned `cancel()` emptied the echo queue, which would have let Clear briefly bring back a
  date already on its way to the URL (D82).
- A checkbox unchecked just before Clear could stay checked while the URL had no filter; it
  reproduced in jsdom (D82).
- No existing test noticed if a filter field stopped following a URL change made elsewhere
  (Back, Clear, a link); new tests break if any field's sync is removed (D82).
- The table's own page moves read the raw page index, so the pager keeps its own count,
  clamped to the page count as the old pager's was (D85).

The browser re-test of the QA matrix (QA report §8) found no regression. It did find two things
the plan or the code got wrong, neither fixed on this branch:
- The plan claimed its Step 2 task could be saved unchanged (Q1) and edited from two tabs (Q5).
  That task, "Demo task 19997", is held by a deleted user, so against the running backend, which
  is `main`'s without D94, both saves failed with DRF's raw `Invalid pk … - object does not
  exist.` under the picker. This was confirmed with a read-only query (`user300`, `deleted_at`
  set). The checks ran on a task with a live assignee instead.
- Signing out never clears the TanStack Query cache, a pre-existing bug that the refactor kept
  when it moved the session into a store (D86). After a Supervisor signs out, an Operator in the
  same tab sees the Supervisor's cached "1–20 of 20001" task list and dashboard figures until a
  refetch, with other users' task titles. On the branch, no request is even sent. It was
  reproduced on the branch and on `main`. The recommended fix, clearing the cache on `signOut`/`expire`, is in QA
  report §8.4.
