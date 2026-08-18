import { dateCompanyParams, executiveFetch } from "./api";
import { createExecutiveQuerySlice } from "./create-query-slice";
import type { DateCompanyArgs, ExecutiveRevenueTrendRow } from "./types";
import { useSliceQuery } from "./use-slice-query";

const emptyData: ExecutiveRevenueTrendRow[] = [];

export const revenueTrendsSlice = createExecutiveQuerySlice<ExecutiveRevenueTrendRow[], DateCompanyArgs>({
  name: "executiveRevenueTrends",
  emptyData,
  fetch: (args) => {
    if (!args.companyIds.length) return Promise.resolve([]);
    return executiveFetch<ExecutiveRevenueTrendRow[]>("revenue-trends", dateCompanyParams(args));
  },
});

export function useExecutiveRevenueTrends(
  startDate?: Date,
  endDate?: Date,
  companyIds: string[] = [],
  _days = 30
) {
  const from = startDate?.toISOString();
  const to = endDate?.toISOString();
  const companyKey = companyIds.join(",");

  return useSliceQuery(
    emptyData,
    (state) => state.executiveRevenueTrends,
    revenueTrendsSlice.fetch,
    revenueTrendsSlice.reset,
    () => ({
      companyIds: companyKey ? companyKey.split(",") : [],
      from,
      to,
    }),
    Boolean(companyKey),
    [companyKey, from, to]
  );
}
