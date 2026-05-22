import { useCallback, useEffect, useState } from "react";

import { normalizeSearchForFilter, SEARCH_DEBOUNCE_MS } from "./hubSearchFilter";

export function useDebouncedHubSearch() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(normalizeSearchForFilter(searchInput));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const clearSearch = useCallback(() => {
    setSearchInput("");
  }, []);

  return { searchInput, setSearchInput, debouncedSearch, clearSearch };
}
