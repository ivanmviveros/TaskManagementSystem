import { NotFoundPanel } from "../../components/NotFoundPanel";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { ShellLayout } from "./ShellLayout";

const MESSAGE = "There's nothing at this address.";

/**
 * The root route's notFoundComponent (D71). Unmatched paths render at the root
 * (notFoundMode "root"), and a thrown notFound() finds the root as the nearest
 * route with a notFoundComponent, so this renders outside AppShell and wrapping
 * it in ShellLayout here cannot double the header. "/" redirects to each role's landing page, so one
 * link serves every role.
 */
export function AppNotFound() {
  const { user } = useAuth();
  if (user === null) {
    return (
      <main className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <NotFoundPanel
            title="Page not found"
            message={MESSAGE}
            linkTo="/login"
            linkLabel="Sign in"
          />
        </div>
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
