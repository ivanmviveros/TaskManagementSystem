import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: number;
  /** Where the tile drills through to. Must carry the tile's FULL predicate. */
  to: string;
  search?: Record<string, unknown>;
  accent?: string;
  children?: ReactNode;
}

export function StatTile({ label, value, to, search, accent, children }: StatTileProps) {
  return (
    <Link
      to={to}
      search={search}
      className="block rounded-lg bg-white p-4 shadow-sm transition hover:shadow"
    >
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${accent ?? "text-slate-900"}`}>{value}</p>
      {children}
    </Link>
  );
}
