import { createAsyncThunk } from "@reduxjs/toolkit";
import { brandPerformanceSlice } from "./brand-performance";
import { companiesSlice } from "./companies";
import { companyBreakdownSlice } from "./company-breakdown";
import { leaderInventorySlice } from "./inventory/leader";
import { mainInventorySlice } from "./inventory/main";
import { recentActivitySlice } from "./recent-activity";
import { revenueTrendsSlice } from "./revenue-trends";
import { statsSlice } from "./stats";
import { teamLeadersSlice } from "./team-leaders";
import { topPerformersSlice } from "./top-performers";

export const executiveReducers = {
  executiveCompanies: companiesSlice.reducer,
  executiveStats: statsSlice.reducer,
  executiveCompanyBreakdown: companyBreakdownSlice.reducer,
  executiveRevenueTrends: revenueTrendsSlice.reducer,
  executiveTopPerformers: topPerformersSlice.reducer,
  executiveRecentActivity: recentActivitySlice.reducer,
  executiveBrandPerformance: brandPerformanceSlice.reducer,
  executiveMainInventory: mainInventorySlice.reducer,
  executiveLeaderInventory: leaderInventorySlice.reducer,
  executiveTeamLeaders: teamLeadersSlice.reducer,
};

export const refetchAllExecutiveData = createAsyncThunk(
  "executive/refetchAll",
  async (_: void, { dispatch }) => {
    await Promise.all([
      dispatch(companiesSlice.refetchLast()),
      dispatch(statsSlice.refetchLast()),
      dispatch(companyBreakdownSlice.refetchLast()),
      dispatch(revenueTrendsSlice.refetchLast()),
      dispatch(topPerformersSlice.refetchLast()),
      dispatch(recentActivitySlice.refetchLast()),
      dispatch(brandPerformanceSlice.refetchLast()),
      dispatch(mainInventorySlice.refetchLast()),
      dispatch(leaderInventorySlice.refetchLast()),
      dispatch(teamLeadersSlice.refetchLast()),
    ]);
  }
);

export { useExecutiveCompanies } from "./companies";
export { useExecutiveStats } from "./stats";
export { useExecutiveCompanyBreakdown } from "./company-breakdown";
export { useExecutiveRevenueTrends } from "./revenue-trends";
export { useExecutiveTopPerformers } from "./top-performers";
export { useExecutiveRecentActivity } from "./recent-activity";
export { useExecutiveBrandPerformance } from "./brand-performance";
export { useExecutiveMainInventory } from "./inventory/main";
export { useExecutiveLeaderInventory } from "./inventory/leader";
export { useExecutiveTeamLeaders } from "./team-leaders";

export type {
  ExecutiveCompaniesResult,
  ExecutiveCompanyDto,
  ExecutiveStatsResult,
  ExecutiveCompanyBreakdownRow,
  ExecutiveRevenueTrendRow,
  ExecutiveTopPerformerRow,
  ExecutiveActivityRow,
  ExecutiveBrandPerformanceResult,
  ExecutiveInventoryBrand,
  ExecutiveTeamLeader,
  ExecutiveTeamLeaderMode,
} from "./types";
