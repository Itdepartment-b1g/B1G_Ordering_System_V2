import { executiveFetch } from "../api";
import { createExecutiveQuerySlice } from "../create-query-slice";
import type { ExecutiveInventoryBrand, ExecutiveTeamLeaderMode } from "../types";
import { useSliceQuery } from "../use-slice-query";

type Args = {
  companyId: string;
  leaderId: string;
  mode: ExecutiveTeamLeaderMode;
};

const emptyData: ExecutiveInventoryBrand[] = [];

export const leaderInventorySlice = createExecutiveQuerySlice<ExecutiveInventoryBrand[], Args>({
  name: "executiveLeaderInventory",
  emptyData,
  fetch: ({ companyId, leaderId, mode }) =>
    executiveFetch<ExecutiveInventoryBrand[]>("inventory/leader", {
      companyId,
      leaderId,
      mode,
    }),
});

export function useExecutiveLeaderInventory(
  companyId: string | null,
  leaderId: string | null,
  mode: ExecutiveTeamLeaderMode = "leader_only"
) {
  return useSliceQuery(
    emptyData,
    (state) => state.executiveLeaderInventory,
    leaderInventorySlice.fetch,
    leaderInventorySlice.reset,
    () => ({
      companyId: companyId || "",
      leaderId: leaderId || "",
      mode,
    }),
    Boolean(companyId && leaderId),
    [companyId, leaderId, mode]
  );
}
