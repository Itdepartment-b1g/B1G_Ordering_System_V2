import { dateCompanyParams, executiveFetch } from "./api";
import { createExecutiveQuerySlice } from "./create-query-slice";
import type { DateCompanyArgs, ExecutiveTopPerformerRow } from "./types";
import { useSliceQuery } from "./use-slice-query";

type Args = DateCompanyArgs & { limit: number };

const emptyData: ExecutiveTopPerformerRow[] = [];

export const topPerformersSlice = createExecutiveQuerySlice<ExecutiveTopPerformerRow[], Args>({
  name: "executiveTopPerformers",
  emptyData,
  fetch: (args) => {
    if (!args.companyIds.length) return Promise.resolve([]);
    return executiveFetch<ExecutiveTopPerformerRow[]>("top-performers", dateCompanyParams(args));
  },
});

export function useExecutiveTopPerformers(
  startDate?: Date,
  endDate?: Date,
  companyIds: string[] = [],
  limit = 10
) {
  const from = startDate?.toISOString();
  const to = endDate?.toISOString();
  const companyKey = companyIds.join(",");

  return useSliceQuery(
    emptyData,
    (state) => state.executiveTopPerformers,
    topPerformersSlice.fetch,
    topPerformersSlice.reset,
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
