import { dateCompanyParams, executiveFetch } from "./api";
import { createExecutiveQuerySlice } from "./create-query-slice";
import type { DateCompanyArgs, ExecutiveBrandPerformanceResult } from "./types";
import { useSliceQuery } from "./use-slice-query";

type Args = DateCompanyArgs & { brandId?: string | null };

const emptyData: ExecutiveBrandPerformanceResult = {
  brands: [],
  flavors: [],
  batteries: [],
};

export const brandPerformanceSlice = createExecutiveQuerySlice<ExecutiveBrandPerformanceResult, Args>({
  name: "executiveBrandPerformance",
  emptyData,
  fetch: (args) => {
    if (!args.companyIds.length) return Promise.resolve(emptyData);
    return executiveFetch<ExecutiveBrandPerformanceResult>("brand-performance", dateCompanyParams(args));
  },
});

export function useExecutiveBrandPerformance(
  startDate?: Date,
  endDate?: Date,
  companyIds: string[] = [],
  brandId?: string | null
) {
  const from = startDate?.toISOString();
  const to = endDate?.toISOString();
  const companyKey = companyIds.join(",");

  return useSliceQuery(
    emptyData,
    (state) => state.executiveBrandPerformance,
    brandPerformanceSlice.fetch,
    brandPerformanceSlice.reset,
    () => ({
      companyIds: companyKey ? companyKey.split(",") : [],
      from,
      to,
      brandId: brandId || null,
    }),
    Boolean(companyKey),
    [companyKey, from, to, brandId]
  );
}
