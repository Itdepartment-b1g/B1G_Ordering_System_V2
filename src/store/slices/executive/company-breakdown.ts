import { dateCompanyParams, executiveFetch } from "./api";
import { createExecutiveQuerySlice } from "./create-query-slice";
import type { DateCompanyArgs, ExecutiveCompanyBreakdownRow } from "./types";
import { useSliceQuery } from "./use-slice-query";

const emptyData: ExecutiveCompanyBreakdownRow[] = [];

export const companyBreakdownSlice = createExecutiveQuerySlice<
  ExecutiveCompanyBreakdownRow[],
  DateCompanyArgs
>({
  name: "executiveCompanyBreakdown",
  emptyData,
  fetch: (args) => {
    if (!args.companyIds.length) return Promise.resolve([]);
    return executiveFetch<ExecutiveCompanyBreakdownRow[]>("company-breakdown", dateCompanyParams(args));
  },
});

export function useExecutiveCompanyBreakdown(
  startDate?: Date,
  endDate?: Date,
  companyIds: string[] = []
) {
  const from = startDate?.toISOString();
  const to = endDate?.toISOString();
  const companyKey = companyIds.join(",");

  return useSliceQuery(
    emptyData,
    (state) => state.executiveCompanyBreakdown,
    companyBreakdownSlice.fetch,
    companyBreakdownSlice.reset,
    () => ({
      companyIds: companyKey ? companyKey.split(",") : [],
      from,
      to,
    }),
    Boolean(companyKey),
    [companyKey, from, to]
  );
}
