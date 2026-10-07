import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { server } from "../../test/msw-server";
import { renderApp } from "../../test/render-app";
import type { TaskStats } from "../tasks/types";

const BASE = "http://localhost:8000/api/v1";

const SUPERVISOR = {
  id: "0199a0f0-0000-7000-8000-00000000sv01",
  email: "supervisor@demo.local",
  first_name: "Sam",
  last_name: "Supervisor",
  role: "SUPERVISOR" as const,
};
const OPERATOR = { ...SUPERVISOR, role: "OPERATOR" as const, email: "operator@demo.local" };

const STATS: TaskStats = {
  total: 10,
  by_status: { PENDING: 4, IN_PROGRESS: 3, COMPLETED: 2, CANCELLED: 1 },
  overdue: 5,
  due_next_7_days: 6,
};

let statsCalls = 0;

function signedInAs(user: typeof SUPERVISOR | typeof OPERATOR) {
  server.use(http.get(`${BASE}/users/me/`, () => HttpResponse.json(user)));
}

function statsRespondWith(stats: TaskStats) {
  server.use(
    http.get(`${BASE}/tasks/stats/`, () => {
      statsCalls += 1;
      return HttpResponse.json(stats);
    }),
  );
}

beforeEach(() => {
  statsCalls = 0;
});

/** The card's CTA link; its href is what the drill-through assertions read. */
function tile(name: RegExp): HTMLElement {
  return screen.getByRole("link", { name });
}

/** A card is a named group (role="group" + aria-labelledby), so its number can
 *  be read without depending on the markup inside it. */
function card(label: string): HTMLElement {
  return screen.getByRole("group", { name: label });
}

describe("StatsPage", () => {
  it("renders all six figures from one GET /tasks/stats/ call", async () => {
    signedInAs(SUPERVISOR);
    statsRespondWith(STATS);
    await renderApp("/dashboard");
    expect(await screen.findByRole("group", { name: "All tasks" })).toHaveTextContent("10");
    expect(card("Pending")).toHaveTextContent("4");
    expect(card("In progress")).toHaveTextContent("3");
    expect(card("Completed")).toHaveTextContent("2");
    expect(card("Cancelled")).toHaveTextContent("1");
    expect(card("Overdue")).toHaveTextContent("5");
    expect(card("Due in 7 days")).toHaveTextContent("6");
    expect(statsCalls).toBe(1);
  });

  it("shows a loading state", async () => {
    signedInAs(SUPERVISOR);
    server.use(
      http.get(`${BASE}/tasks/stats/`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return HttpResponse.json(STATS);
      }),
    );
    await renderApp("/dashboard");
    // Targeted by text: renderApp also renders a role="status" element while the
    // auth probe settles, so the role alone is ambiguous.
    expect(await screen.findByText(/loading statistics/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new task/i })).toBeInTheDocument();
  });

  it("shows an error state", async () => {
    signedInAs(SUPERVISOR);
    server.use(
      http.get(`${BASE}/tasks/stats/`, () =>
        HttpResponse.json({ detail: "Stats are unavailable.", code: "server_error" }, { status: 500 }),
      ),
    );
    await renderApp("/dashboard");
    expect(await screen.findByRole("alert")).toHaveTextContent(/stats are unavailable/i);
  });

  it("handles an all-zero response without dividing by zero in the bar", async () => {
    signedInAs(SUPERVISOR);
    statsRespondWith({
      total: 0,
      by_status: { PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 },
      overdue: 0,
      due_next_7_days: 0,
    });
    await renderApp("/dashboard");
    const bar = await screen.findByRole("region", { name: /status distribution/i });
    expect(within(bar).getByText(/no tasks yet/i)).toBeInTheDocument();
    expect(bar.textContent).not.toMatch(/NaN/);
  });

  it("links a status tile to that status's list", async () => {
    signedInAs(SUPERVISOR);
    statsRespondWith(STATS);
    await renderApp("/dashboard");
    await screen.findByRole("link", { name: /all tasks/i });
    const href = decodeURIComponent(tile(/— pending$/i).getAttribute("href") ?? "");
    expect(href).toContain("/tasks");
    // Decoded, because TanStack Router serialises an array search param as JSON
    // (status=["PENDING"]) rather than as repeated keys. The repeated form the
    // backend needs is produced by buildTaskQuery when the list calls the API —
    // see the drill-through test below, which checks that end to end.
    expect(href).toContain("PENDING");
  });

  it("links the overdue tile to overdue=true", async () => {
    signedInAs(SUPERVISOR);
    statsRespondWith(STATS);
    await renderApp("/dashboard");
    await screen.findByRole("link", { name: /all tasks/i });
    expect(tile(/overdue/i).getAttribute("href") ?? "").toContain("overdue=true");
  });

  it("links the due-soon tile with the full predicate, not just a date bound", async () => {
    // due_next_7_days excludes nulls AND terminal statuses, so linking on
    // due_date_before alone would also pull in every past-due task and every
    // completed task with a due date — a list visibly larger than the tile.
    signedInAs(SUPERVISOR);
    statsRespondWith(STATS);
    await renderApp("/dashboard");
    await screen.findByRole("link", { name: /all tasks/i });
    const href = decodeURIComponent(tile(/due in 7 days/i).getAttribute("href") ?? "");
    expect(href).toContain("due_date_after=");
    expect(href).toContain("due_date_before=");
    expect(href).toContain("PENDING");
    expect(href).toContain("IN_PROGRESS");
  });

  it("following the due-soon tile asks the API for exactly that predicate", async () => {
    // The assertion that actually matters: the tile's link must produce the same
    // query the tile's number came from, or the list visibly disagrees with it.
    signedInAs(SUPERVISOR);
    statsRespondWith(STATS);
    let taskQuery: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE}/tasks/`, ({ request }) => {
        taskQuery = new URL(request.url).searchParams;
        return HttpResponse.json({ count: 0, next: null, previous: null, results: [] });
      }),
    );
    await renderApp("/dashboard");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: /due in 7 days/i }));
    await waitFor(() => expect(taskQuery).not.toBeNull());
    const query = taskQuery as unknown as URLSearchParams;
    // Repeated status keys, which is what django-filter's MultipleChoiceFilter
    // reads — a JSON array would be rejected as an invalid choice.
    expect(query.getAll("status")).toEqual(["PENDING", "IN_PROGRESS"]);
    expect(query.get("due_date_after")).not.toBeNull();
    expect(query.get("due_date_before")).not.toBeNull();
  });

  it("renders identically for a Supervisor and an Operator", async () => {
    // The backend scopes the response, so the component does not branch at all.
    signedInAs(SUPERVISOR);
    statsRespondWith(STATS);
    const supervisorView = await renderApp("/dashboard");
    await screen.findByRole("link", { name: /all tasks/i });
    const supervisorTiles = screen
      .getAllByRole("group")
      .map((group) => group.textContent)
      .join("|");
    supervisorView.unmount();

    signedInAs(OPERATOR);
    statsRespondWith(STATS);
    await renderApp("/dashboard");
    await screen.findByRole("link", { name: /all tasks/i });
    const operatorTiles = screen
      .getAllByRole("group")
      .map((group) => group.textContent)
      .join("|");

    expect(operatorTiles).toBe(supervisorTiles);
  });

  it("gives every card a 'View tasks' link named after its card", async () => {
    signedInAs(SUPERVISOR);
    statsRespondWith(STATS);
    await renderApp("/dashboard");
    await screen.findByRole("group", { name: "All tasks" });
    for (const label of ["All tasks", "Pending", "In progress", "Completed", "Cancelled", "Overdue", "Due in 7 days"]) {
      const link = within(card(label)).getByRole("link");
      expect(link).toHaveTextContent(/^view tasks/i);
      expect(link).toHaveAccessibleName(`View tasks — ${label}`);
    }
  });

  it("offers New task in the header", async () => {
    signedInAs(SUPERVISOR);
    statsRespondWith(STATS);
    await renderApp("/dashboard");
    const newTask = await screen.findByRole("link", { name: /new task/i });
    expect(newTask.getAttribute("href")).toBe("/tasks/new");
    // One element, one Tab stop (D48): no <button> nested inside the link.
    expect(within(newTask).queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps New task available when stats fail to load", async () => {
    signedInAs(SUPERVISOR);
    server.use(
      http.get(`${BASE}/tasks/stats/`, () =>
        HttpResponse.json({ detail: "Stats are unavailable.", code: "server_error" }, { status: 500 }),
      ),
    );
    await renderApp("/dashboard");
    await screen.findByRole("alert");
    expect(screen.getByRole("link", { name: /new task/i })).toBeInTheDocument();
  });

  it("spans the due-soon card across the full row, and only that card", async () => {
    signedInAs(SUPERVISOR);
    statsRespondWith(STATS);
    await renderApp("/dashboard");
    await screen.findByRole("group", { name: "All tasks" });
    // jsdom applies no CSS, so the layout is asserted through its class.
    expect(card("Due in 7 days")).toHaveClass("col-span-full");
    expect(card("Overdue")).not.toHaveClass("col-span-full");
  });
});
