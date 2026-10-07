import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { useId } from "react";

interface StatTileProps {
  label: string;
  value: number;
  /** Where the CTA drills through to. Must carry the tile's FULL predicate. */
  to: string;
  search?: Record<string, unknown>;
  accent?: string;
  /** Span the whole grid row and lay out in one line (D42). */
  wide?: boolean;
}

/**
 * A card whose single CTA is a stretched link (D41): the link's ::after covers
 * the card, so the whole card is clickable while there is exactly one link and
 * no button nested inside an anchor. Nothing else interactive may go inside —
 * the ::after would cover it — which is why this takes no children. `relative`
 * on the card is what keeps the ::after inside it.
 *
 * role="group" + aria-labelledby names the card after its label. The id comes
 * from useId(), never from the label text: aria-labelledby reads a
 * space-separated LIST of ids, so an id built from "In progress" would break.
 */
export function StatTile({ label, value, to, search, accent, wide = false }: StatTileProps) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={clsx(
        "relative rounded-lg bg-white p-4 shadow-sm transition hover:shadow focus-within:ring-2 focus-within:ring-status-progress",
        wide && "col-span-full flex flex-wrap items-center gap-x-6 gap-y-2",
      )}
    >
      <p id={labelId} className="text-sm font-medium text-slate-600">
        {label}
      </p>
      <p className={clsx("text-3xl font-semibold", accent ?? "text-slate-900", !wide && "mt-1")}>
        {value}
      </p>
      <Link
        to={to}
        search={search}
        className={clsx(
          "inline-block rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none",
          "after:absolute after:inset-0 after:content-['']",
          wide ? "ml-auto" : "mt-3",
        )}
      >
        View tasks <span className="sr-only">— {label}</span>
      </Link>
    </div>
  );
}
