import { requireExecutive } from '../auth/requireExecutive';
import { HttpError, toErrorResult } from '../http/errors';
import { firstString, parseCompanyIds, parsePositiveInt } from '../http/queryParams';
import {
  getBrandPerformance,
  getCompanyBreakdown,
  getRecentActivity,
  getRevenueTrends,
  getStats,
  getTopPerformers,
  listAssignedCompanies,
} from '../repositories/executive/executiveRepository';
import {
  getLeaderInventory,
  getMainInventory,
  getTeamLeaders,
  type ExecutiveTeamLeaderMode,
} from '../repositories/executive/executiveInventoryRepository';

export type ApiResult<T> = { status: number; body: T | { error: string } };
type QueryMap = Record<string, string | string[] | undefined>;

function dateFilter(query: QueryMap) {
  return {
    from: firstString(query.from),
    to: firstString(query.to),
    requestedCompanyIds: parseCompanyIds(query.companyIds),
  };
}

function requireQueryCompanyId(query: QueryMap): string {
  const companyId = firstString(query.companyId);
  if (!companyId) throw new HttpError(400, 'companyId is required');
  return companyId;
}

export async function getExecutiveCompanies(authorization?: string): Promise<ApiResult<unknown>> {
  try {
    const user = await requireExecutive(authorization);
    return { status: 200, body: await listAssignedCompanies(user.id) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function getExecutiveStats(authorization?: string, query: QueryMap = {}): Promise<ApiResult<unknown>> {
  try {
    const user = await requireExecutive(authorization);
    return { status: 200, body: await getStats(user.id, dateFilter(query)) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function getExecutiveCompanyBreakdown(
  authorization?: string,
  query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireExecutive(authorization);
    return { status: 200, body: await getCompanyBreakdown(user.id, dateFilter(query)) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function getExecutiveRevenueTrends(
  authorization?: string,
  query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireExecutive(authorization);
    return { status: 200, body: await getRevenueTrends(user.id, dateFilter(query)) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function getExecutiveTopPerformers(
  authorization?: string,
  query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireExecutive(authorization);
    return {
      status: 200,
      body: await getTopPerformers(user.id, {
        ...dateFilter(query),
        limit: parsePositiveInt(query.limit, 10),
      }),
    };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function getExecutiveRecentActivity(
  authorization?: string,
  query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireExecutive(authorization);
    return {
      status: 200,
      body: await getRecentActivity(user.id, {
        ...dateFilter(query),
        limit: parsePositiveInt(query.limit, 20),
      }),
    };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function getExecutiveBrandPerformance(
  authorization?: string,
  query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireExecutive(authorization);
    return {
      status: 200,
      body: await getBrandPerformance(user.id, {
        ...dateFilter(query),
        selectedBrandId: firstString(query.brandId) || undefined,
      }),
    };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function getExecutiveMainInventory(
  authorization?: string,
  query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireExecutive(authorization);
    const companyId = requireQueryCompanyId(query);
    return { status: 200, body: await getMainInventory(user.id, companyId) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function getExecutiveLeaderInventory(
  authorization?: string,
  query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireExecutive(authorization);
    const companyId = requireQueryCompanyId(query);
    const leaderId = firstString(query.leaderId);
    if (!leaderId) throw new HttpError(400, 'leaderId is required');
    const modeRaw = firstString(query.mode);
    const mode: ExecutiveTeamLeaderMode = modeRaw === 'team_total' ? 'team_total' : 'leader_only';
    return { status: 200, body: await getLeaderInventory(user.id, companyId, leaderId, mode) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function getExecutiveTeamLeaders(
  authorization?: string,
  query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireExecutive(authorization);
    const companyId = requireQueryCompanyId(query);
    return { status: 200, body: await getTeamLeaders(user.id, companyId) };
  } catch (error) {
    return toErrorResult(error);
  }
}
