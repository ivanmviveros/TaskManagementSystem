import { ButtonLink } from "./ButtonLink";

interface NotFoundPanelProps {
  title: string;
  message: string;
  linkTo: "/" | "/login" | "/tasks" | "/users";
  linkLabel: string;
  /** `object`, not Record<string, unknown>: TaskListSearch is an interface with
   *  no index signature, so it would not be assignable to a Record. */
  linkSearch?: object;
}

/** Every not-found state says what is missing and offers the way back (D71). */
export function NotFoundPanel({ title, message, linkTo, linkLabel, linkSearch }: NotFoundPanelProps) {
  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <h1 className="mb-2 text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mb-4 text-sm text-slate-600">{message}</p>
      <ButtonLink variant="secondary" to={linkTo} search={linkSearch}>
        {linkLabel}
      </ButtonLink>
    </section>
  );
}
