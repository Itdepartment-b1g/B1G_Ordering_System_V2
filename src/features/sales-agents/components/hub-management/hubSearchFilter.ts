export const SEARCH_DEBOUNCE_MS = 300;

/** Strip LIKE wildcards and collapse whitespace so `.or()` filter strings stay safe. */
export function normalizeSearchForFilter(raw: string): string {
  return raw
    .trim()
    .replace(/[%_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** PostgREST `.or()` value: wrap in double quotes and escape embedded quotes. */
export function quoteOrFilterValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
