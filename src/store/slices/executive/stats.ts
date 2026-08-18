import { dateCompanyParams, executiveFetch } from "./api";
import { createExecutiveQuerySlice } from "./create-query-slice";
import type { DateCompanyArgs, ExecutiveStatsResult } from "./types";
import { useSliceQuery } from "./use-slice-query";

const emptyData: ExecutiveStatsResult = {
  totalRevenue: 0,
  pendingRevenue: 0,
  projectedRevenue: 0,
  totalOrders: 0,
  totalAgents: 0,
  totalClients: 0,
  pendingOrders: 0,
  approvedOrders: 0,
};

export const statsSlice = createExecutiveQuerySlice<ExecutiveStatsResult, DateCompanyArgs>({
  name: "executiveStats",
  emptyData,
  fetch: (args) => {
    if (!args.companyIds.length) return Promise.resolve(emptyData);
    return executiveFetch<ExecutiveStatsResult>("stats", dateCompanyParams(args));
  },
});

export function useExecutiveStats(startDate?: Date, endDate?: Date, companyIds: string[] = []) {
  const from = startDate?.toISOString();
  const to = endDate?.toISOString();
  const companyKey = companyIds.join(",");

  return useSliceQuery(
    emptyData,
    (state) => state.executiveStats,
    statsSlice.fetch,
    statsSlice.reset,
    () => ({
      companyIds: companyKey ? companyKey.split(",") : [],
      from,
      to,
    }),
    Boolean(companyKey),
    [companyKey, from, to]
  );
}
