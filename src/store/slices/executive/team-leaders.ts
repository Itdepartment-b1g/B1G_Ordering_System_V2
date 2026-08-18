import { executiveFetch } from "./api";
import { createExecutiveQuerySlice } from "./create-query-slice";
import type { ExecutiveTeamLeader } from "./types";
import { useSliceQuery } from "./use-slice-query";

type Args = { companyId: string };

const emptyData: ExecutiveTeamLeader[] = [];

export const teamLeadersSlice = createExecutiveQuerySlice<ExecutiveTeamLeader[], Args>({
  name: "executiveTeamLeaders",
  emptyData,
  fetch: ({ companyId }) =>
    executiveFetch<ExecutiveTeamLeader[]>("team-leaders", { companyId }),
});

export function useExecutiveTeamLeaders(companyId: string | null) {
  return useSliceQuery(
    emptyData,
    (state) => state.executiveTeamLeaders,
    teamLeadersSlice.fetch,
    teamLeadersSlice.reset,
    () => ({ companyId: companyId || "" }),
    Boolean(companyId),
    [companyId]
  );
}
