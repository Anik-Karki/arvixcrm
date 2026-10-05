/**
 * Pagination — reusable client-side pagination control (admin copy).
 * Identical to the CRM version — admin is a separate app.
 */

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, pageSize, total, onPageChange, className = "" }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  if (total === 0) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, total);

  const pageNumbers: number[] = [];
  const showPages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(showPages / 2));
  let endPage = Math.min(totalPages, startPage + showPages - 1);
  if (endPage - startPage < showPages - 1) startPage = Math.max(1, endPage - showPages + 1);
  for (let p = startPage; p <= endPage; p++) pageNumbers.push(p);

  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 border-t border-[var(--color-border-default)] ${className}`}>
      <p className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
        Showing <strong className="text-[var(--color-text-body)]">{startItem}</strong>–<strong className="text-[var(--color-text-body)]">{endItem}</strong> of <strong className="text-[var(--color-text-body)]">{total}</strong>
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(1)} disabled={currentPage === 1}
          className="p-1.5 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="First page">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 20L9 12l10-8M5 19V5"/></svg>
        </button>
        <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}
          className="p-1.5 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Previous page">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        {pageNumbers.map(p => (
          <button key={p} onClick={() => onPageChange(p)}
            className={`min-w-[32px] h-8 rounded-lg text-xs font-semibold transition-colors ${
              p === currentPage ? "bg-[var(--color-brand-blue)] text-white" : "border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
            }`}>
            {p}
          </button>
        ))}
        {endPage < totalPages && <span className="px-1 text-xs text-[var(--color-text-muted)]">…</span>}
        <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}
          className="p-1.5 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Next page">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages}
          className="p-1.5 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Last page">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 20l10-8L5 4M19 5v14"/></svg>
        </button>
      </div>
    </div>
  );
}
