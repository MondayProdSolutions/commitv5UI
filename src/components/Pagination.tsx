interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  baseHref: string;
  baseSearchParams?: URLSearchParams;
}

export default function Pagination({
  page,
  pageSize,
  total,
  baseHref,
  baseSearchParams = new URLSearchParams(),
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  if (!hasPrevious && !hasNext) {
    return null;
  }

  const getPrevUrl = () => {
    const params = new URLSearchParams(baseSearchParams);
    params.set('page', String(page - 1));
    return `${baseHref}?${params.toString()}`;
  };

  const getNextUrl = () => {
    const params = new URLSearchParams(baseSearchParams);
    params.set('page', String(page + 1));
    return `${baseHref}?${params.toString()}`;
  };

  return (
    <div className="flex items-center justify-between border-t border-line bg-surface px-4 py-3 sm:px-6">
      <div>
        <p className="text-sm text-ink-muted">
          Página <span className="font-semibold text-ink">{page}</span> de{' '}
          <span className="font-semibold text-ink">{totalPages || 1}</span>
        </p>
      </div>
      <div className="flex gap-2">
        {hasPrevious && (
          <a
            href={getPrevUrl()}
            className="inline-flex min-h-10 items-center rounded-control border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-raised"
          >
            ← Anterior
          </a>
        )}
        {hasNext && (
          <a
            href={getNextUrl()}
            className="inline-flex min-h-10 items-center rounded-control border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-raised"
          >
            Siguiente →
          </a>
        )}
      </div>
    </div>
  );
}
