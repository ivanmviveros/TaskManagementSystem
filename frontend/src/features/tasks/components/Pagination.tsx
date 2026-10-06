import { Button } from "../../../components/Button";

interface PaginationProps {
  count: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
  onPageChange: (page: number) => void;
}

/** Driven by the count/next/previous envelope rather than a guessed page count. */
export function Pagination({
  count,
  page,
  pageSize,
  hasNext,
  hasPrevious,
  onPageChange,
}: PaginationProps) {
  const first = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, count);
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center gap-3">
      <Button
        variant="secondary"
        disabled={!hasPrevious}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        Previous
      </Button>
      <p className="text-sm text-slate-600">
        {first}–{last} of {count}
      </p>
      <Button
        variant="secondary"
        disabled={!hasNext}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        Next
      </Button>
    </nav>
  );
}
