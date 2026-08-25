import { dateCompanyParams, executiveFetch } from "./api";
import { createExecutiveQuerySlice } from "./create-query-slice";
import type { DateCompanyArgs, ExecutiveActivityRow } from "./types";
import { useSliceQuery } from "./use-slice-query";

type Args = DateCompanyArgs & { limit: number };

const emptyData: ExecutiveActivityRow[] = [];

export const recentActivitySlice = createExecutiveQuerySlice<ExecutiveActivityRow[], Args>({
  name: "executiveRecentActivity",
  emptyData,
  fetch: (args) => {
    if (!args.companyIds.length) return Promise.resolve([]);
    return executiveFetch<ExecutiveActivityRow[]>("recent-activity", dateCompanyParams(args));
  },
});

export function useExecutiveRecentActivity(
  startDate?: Date,
  endDate?: Date,
  companyIds: string[] = [],
  limit = 20
) {
  const from = startDate?.toISOString();
  const to = endDate?.toISOString();
  const companyKey = companyIds.join(",");

  return useSliceQuery(
    emptyData,
    (state) => state.executiveRecentActivity,
    recentActivitySlice.fetch,
    recentActivitySlice.reset,
    () => ({
      companyIds: companyKey ? companyKey.split(",") : [],
      from,
      to,
      limit,
    }),
    Boolean(companyKey),
    [companyKey, from, to, limit]
  );
}
