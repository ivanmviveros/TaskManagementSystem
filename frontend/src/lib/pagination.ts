/**
 * What the pager offers. The backend's DefaultPageNumberPagination has
 * page_size = 20 and max_page_size = 100, and still enforces the cap — these
 * only choose which sizes to offer (D51).
 */
export const PAGE_SIZES = [10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 20;

export function isPageSize(value: unknown): value is PageSize {
  return (PAGE_SIZES as readonly unknown[]).includes(value);
}

export type PageItem = number | "gap";

/**
 * First, last, and the current page ±2, with "gap" wherever pages are skipped
 * — even a single page, as in the approved design (D49). Expects
 * 1 ≤ current ≤ total; the caller clamps.
 */
export function pageWindow(current: number, total: number): PageItem[] {
  if (total <= 1) return [1];
  const start = Math.max(2, current - 2);
  const end = Math.min(total - 1, current + 2);
  const items: PageItem[] = [1];
  if (start > 2) items.push("gap");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push("gap");
  items.push(total);
  return items;
}
