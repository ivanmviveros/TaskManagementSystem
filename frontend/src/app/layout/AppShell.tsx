import { Outlet } from "@tanstack/react-router";

import { ShellLayout } from "./ShellLayout";

/** The routed shell: every signed-in page renders inside ShellLayout. */
export function AppShell() {
  return (
    <ShellLayout>
      <Outlet />
    </ShellLayout>
  );
}
