import { executiveFetch } from "../api";
import { createExecutiveQuerySlice } from "../create-query-slice";
import type { ExecutiveInventoryBrand } from "../types";
import { useSliceQuery } from "../use-slice-query";

type Args = { companyId: string };

const emptyData: ExecutiveInventoryBrand[] = [];

export const mainInventorySlice = createExecutiveQuerySlice<ExecutiveInventoryBrand[], Args>({
  name: "executiveMainInventory",
  emptyData,
  fetch: ({ companyId }) =>
    executiveFetch<ExecutiveInventoryBrand[]>("inventory/main", { companyId }),
});

export function useExecutiveMainInventory(companyId: string | null) {
  return useSliceQuery(
    emptyData,
    (state) => state.executiveMainInventory,
    mainInventorySlice.fetch,
    mainInventorySlice.reset,
    () => ({ companyId: companyId || "" }),
    Boolean(companyId),
    [companyId]
  );
}
