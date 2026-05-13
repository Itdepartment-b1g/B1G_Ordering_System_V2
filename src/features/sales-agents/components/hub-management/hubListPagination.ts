export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

/** Page indices to show (1-based), with ellipses for large page counts. */
export function buildPageItems(
  page: number,
  totalPages: number,
): (number | "ellipsis")[] {
  if (totalPages <= 1) return [1];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const result: (number | "ellipsis")[] = [];
  const radius = 2;
  const start = Math.max(2, page - radius);
  const end = Math.min(totalPages - 1, page + radius);

  result.push(1);
  if (start > 2) result.push("ellipsis");
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  if (end < totalPages - 1) result.push("ellipsis");
  if (totalPages > 1) result.push(totalPages);
  return result;
}
