/** PostgREST returns at most 1000 rows per request unless paginated with `.range()`. */
export const SUPABASE_PAGE_SIZE = 1000;

type PaginatedResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Fetches all rows from a Supabase query by paging in batches of {@link SUPABASE_PAGE_SIZE}.
 */
export async function fetchAllPaginated<T>(
  fetchPage: (from: number, to: number) => Promise<PaginatedResult<T>>
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await fetchPage(offset, offset + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;

    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) break;
    offset += SUPABASE_PAGE_SIZE;
  }

  return all;
}
