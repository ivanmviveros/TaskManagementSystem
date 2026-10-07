import { NotFoundPanel } from "../../components/NotFoundPanel";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { ShellLayout } from "./ShellLayout";

const MESSAGE = "There's nothing at this address.";

/**
 * The router's defaultNotFoundComponent (D71). With notFoundMode "root" it always
 * renders at the root, outside AppShell, so wrapping it in ShellLayout here
 * cannot double the header. "/" redirects to each role's landing page, so one
 * link serves every role.
 */
export function AppNotFound() {
  const { user } = useAuth();
  if (user === null) {
    return (
      <main className="mx-auto max-w-5xl p-4">
        <NotFoundPanel title="Page not found" message={MESSAGE} linkTo="/login" linkLabel="Sign in" />
      </main>
    );
  }
  return (
    <ShellLayout>
      <NotFoundPanel
        title="Page not found"
        message={MESSAGE}
        linkTo="/"
        linkLabel="Go to your home page"
      />
    </ShellLayout>
  );
}
