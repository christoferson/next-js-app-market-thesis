"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  onPageChange: (page: number) => void;
}

const BUTTON_CLASS =
  "rounded-sm border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors motion-reduce:transition-none hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-50 disabled:text-stone-400";

export function Pagination({
  page,
  totalPages,
  hasNextPage,
  onPageChange,
}: PaginationProps) {
  return (
    <nav aria-label="Results pagination" className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page of results"
        className={BUTTON_CLASS}
      >
        Previous
      </button>
      <p aria-live="polite" className="text-sm text-stone-600">
        {`Page ${page} of ${Math.max(totalPages, 1)}`}
      </p>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={!hasNextPage}
        aria-label="Next page of results"
        className={BUTTON_CLASS}
      >
        Next
      </button>
    </nav>
  );
}
