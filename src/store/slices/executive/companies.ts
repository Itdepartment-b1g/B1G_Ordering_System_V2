import { executiveFetch } from "./api";
import { createExecutiveQuerySlice } from "./create-query-slice";
import type { ExecutiveCompaniesResult } from "./types";
import { useSliceQuery } from "./use-slice-query";

const emptyData: ExecutiveCompaniesResult = {
  assignments: [],
  companies: [],
  companyIds: [],
};

export const companiesSlice = createExecutiveQuerySlice<ExecutiveCompaniesResult, Record<string, never>>({
  name: "executiveCompanies",
  emptyData,
  fetch: () => executiveFetch<ExecutiveCompaniesResult>("companies"),
});

export function useExecutiveCompanies() {
  return useSliceQuery(
    emptyData,
    (state) => state.executiveCompanies,
    companiesSlice.fetch,
    companiesSlice.reset,
    () => ({}),
    true,
    []
  );
}
