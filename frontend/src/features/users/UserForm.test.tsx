import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { server } from "../../test/msw-server";
import { renderApp } from "../../test/render-app";
import type { UserDetail } from "./types";

const BASE = "http://localhost:8000/api/v1";

const ADMIN: UserDetail = {
  id: "0199a0f0-0000-7000-8000-00000000ad01",
  email: "admin@demo.local",
  first_name: "Ada",
  last_name: "Admin",
  role: "ADMIN",
  is_active: true,
  is_staff: true,
  date_joined: "2026-09-01T09:00:00Z",
  last_login: null,
};

const TARGET: UserDetail = {
  id: "0199a0f0-0000-7000-8000-00000000op01",
  email: "operator@demo.local",
  first_name: "Omar",
  last_name: "Operator",
  role: "OPERATOR",
  is_active: true,
  is_staff: false,
  date_joined: "2026-09-02T09:00:00Z",
  last_login: null,
};

beforeEach(() => {
  server.use(http.get(`${BASE}/users/me/`, () => HttpResponse.json(ADMIN)));
});

describe("UserForm", () => {
  it("moves focus to the email field when the address is taken (D75)", async () => {
    server.use(
      http.post(`${BASE}/users/`, () =>
        HttpResponse.json(
          { detail: "A user with this email address already exists.", code: "email_already_in_use", errors: null },
          { status: 400 },
        ),
      ),
    );
    await renderApp("/users/new");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^email$/i), "dupe@demo.local");
    await user.type(screen.getByLabelText(/first name/i), "D");
    await user.type(screen.getByLabelText(/last name/i), "Upe");
    await user.type(screen.getByLabelText(/^password$/i), "a-strong-password-1");
    await user.click(screen.getByRole("button", { name: /create user/i }));
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toHaveFocus());
  });

  it("creates a user", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/users/`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(TARGET, { status: 201 });
      }),
      http.get(`${BASE}/users/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    );
    await renderApp("/users/new");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^email$/i), "fresh@demo.local");
    await user.type(screen.getByLabelText(/first name/i), "Fay");
    await user.type(screen.getByLabelText(/last name/i), "Fresh");
    await user.type(screen.getByLabelText(/^password$/i), "a-strong-password-1");
    await user.selectOptions(screen.getByLabelText(/^role$/i), "SUPERVISOR");
    await user.click(screen.getByRole("button", { name: /create user/i }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      email: "fresh@demo.local",
      first_name: "Fay",
      last_name: "Fresh",
      role: "SUPERVISOR",
    });
  });

  it("surfaces a 400 email_already_in_use against the email field", async () => {
    server.use(
      http.post(`${BASE}/users/`, () =>
        HttpResponse.json(
          {
            detail: "A user with this email address already exists.",
            code: "email_already_in_use",
            errors: null,
          },
          { status: 400 },
        ),
      ),
    );
    await renderApp("/users/new");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^email$/i), "dupe@demo.local");
    await user.type(screen.getByLabelText(/first name/i), "D");
    await user.type(screen.getByLabelText(/last name/i), "Upe");
    await user.type(screen.getByLabelText(/^password$/i), "a-strong-password-1");
    await user.click(screen.getByRole("button", { name: /create user/i }));

    const email = await screen.findByLabelText(/^email$/i);
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });

  it("surfaces per-field validation errors beside their inputs", async () => {
    server.use(
      http.post(`${BASE}/users/`, () =>
        HttpResponse.json(
          {
            detail: "Invalid input.",
            code: "validation_error",
            errors: { password: ["This password is too common."] },
          },
          { status: 400 },
        ),
      ),
    );
    await renderApp("/users/new");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^email$/i), "weak@demo.local");
    await user.type(screen.getByLabelText(/first name/i), "W");
    await user.type(screen.getByLabelText(/last name/i), "Eak");
    await user.type(screen.getByLabelText(/^password$/i), "password");
    await user.click(screen.getByRole("button", { name: /create user/i }));
    expect(await screen.findByText(/this password is too common/i)).toBeInTheDocument();
  });

  it("does not send an empty password field on edit", async () => {
    // Password is optional on update; sending "" would fail validation.
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(`${BASE}/users/${TARGET.id}/`, () => HttpResponse.json(TARGET)),
      http.patch(`${BASE}/users/${TARGET.id}/`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(TARGET);
      }),
      http.get(`${BASE}/users/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    );
    await renderApp(`/users/${TARGET.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).not.toHaveProperty("password");
    expect(body).toMatchObject({ first_name: "Omar", role: "OPERATOR", is_active: true });
  });

  it("sends the password when one was entered on edit", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(`${BASE}/users/${TARGET.id}/`, () => HttpResponse.json(TARGET)),
      http.patch(`${BASE}/users/${TARGET.id}/`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(TARGET);
      }),
      http.get(`${BASE}/users/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    );
    await renderApp(`/users/${TARGET.id}`);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/new password/i), "a-new-strong-password-1");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ password: "a-new-strong-password-1" });
  });

  it("shows an Admin's own role read-only, with no Active control (D66)", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(`${BASE}/users/${ADMIN.id}/`, () => HttpResponse.json(ADMIN)),
      http.patch(`${BASE}/users/${ADMIN.id}/`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ADMIN);
      }),
      http.get(`${BASE}/users/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    );
    await renderApp(`/users/${ADMIN.id}`);
    expect(
      await screen.findByText(/you can't change your own role or deactivate your own account/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^role$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /active/i })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(body).not.toBeNull());
    // Unchanged values, which the API accepts (D66).
    expect(body).toMatchObject({ role: "ADMIN", is_active: true });
  });

  it("explains a missing user and links back to the list", async () => {
    server.use(
      http.get(`${BASE}/users/${TARGET.id}/`, () =>
        HttpResponse.json({ detail: "Not found.", code: "not_found", errors: null }, { status: 404 }),
      ),
    );
    await renderApp(`/users/${TARGET.id}`);
    expect(await screen.findByRole("heading", { name: /user not found/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to users/i })).toHaveAttribute("href", "/users");
  });

  it("keeps a generic message for other load errors, with the way back", async () => {
    server.use(
      http.get(`${BASE}/users/${TARGET.id}/`, () =>
        HttpResponse.json({ detail: "Database is down.", code: "server_error" }, { status: 500 }),
      ),
    );
    await renderApp(`/users/${TARGET.id}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load that user.");
    expect(screen.getByRole("link", { name: /back to users/i })).toHaveAttribute("href", "/users");
  });

  it("still offers role and Active when editing someone else", async () => {
    server.use(http.get(`${BASE}/users/${TARGET.id}/`, () => HttpResponse.json(TARGET)));
    await renderApp(`/users/${TARGET.id}`);
    expect(await screen.findByLabelText(/^role$/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /active/i })).toBeInTheDocument();
  });

  it("shows a cannot_change_own_access refusal as a form-level message", async () => {
    server.use(
      http.get(`${BASE}/users/${TARGET.id}/`, () => HttpResponse.json(TARGET)),
      http.patch(`${BASE}/users/${TARGET.id}/`, () =>
        HttpResponse.json(
          {
            detail: "You cannot change your own role or deactivate your own account.",
            code: "cannot_change_own_access",
            errors: null,
          },
          { status: 400 },
        ),
      ),
    );
    await renderApp(`/users/${TARGET.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /save changes/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot change your own role/i);
  });

  it("submits again after a server error (D80)", async () => {
    let posts = 0;
    server.use(
      http.post(`${BASE}/users/`, () => {
        posts += 1;
        return posts === 1
          ? HttpResponse.json(
              {
                detail: "A user with this email address already exists.",
                code: "email_already_in_use",
                errors: null,
              },
              { status: 400 },
            )
          : HttpResponse.json(TARGET, { status: 201 });
      }),
      http.get(`${BASE}/users/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    );
    await renderApp("/users/new");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^email$/i), "dupe@demo.local");
    await user.type(screen.getByLabelText(/first name/i), "D");
    await user.type(screen.getByLabelText(/last name/i), "Upe");
    await user.type(screen.getByLabelText(/^password$/i), "a-strong-password-1");
    await user.click(screen.getByRole("button", { name: /create user/i }));
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /create user/i }));
    await waitFor(() => expect(posts).toBe(2));
  });

  it("keeps the values it loaded when a focus refetch brings newer ones (D81)", async () => {
    let gets = 0;
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(`${BASE}/users/${TARGET.id}/`, () => {
        gets += 1;
        return HttpResponse.json(
          gets === 1 ? TARGET : { ...TARGET, first_name: "Changed", role: "SUPERVISOR" },
        );
      }),
      http.patch(`${BASE}/users/${TARGET.id}/`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(TARGET);
      }),
      http.get(`${BASE}/users/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    );
    await renderApp(`/users/${TARGET.id}`);
    await screen.findByRole("button", { name: /save changes/i });
    try {
      // The test client's staleTime of 0 makes a focus event refetch the user.
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await waitFor(() => expect(gets).toBe(2));
      expect(screen.getByLabelText(/first name/i)).toHaveValue("Omar");
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      await waitFor(() => expect(body).not.toBeNull());
      expect(body).toMatchObject({ first_name: "Omar", role: "OPERATOR" });
    } finally {
      // Restores the shared singleton (see the D40 test in TaskForm.test.tsx).
      focusManager.setFocused(undefined);
    }
  });
});
