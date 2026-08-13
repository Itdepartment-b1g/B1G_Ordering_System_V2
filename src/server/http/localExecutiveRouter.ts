import { applyCors, getAuthorizationHeader } from './headers';
import {
  getExecutiveBrandPerformance,
  getExecutiveCompanies,
  getExecutiveCompanyBreakdown,
  getExecutiveLeaderInventory,
  getExecutiveMainInventory,
  getExecutiveRecentActivity,
  getExecutiveRevenueTrends,
  getExecutiveStats,
  getExecutiveTeamLeaders,
  getExecutiveTopPerformers,
} from '../controllers/executiveController';

type NodeRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
};

type NodeResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (chunk?: string) => void;
};

function sendJson(res: NodeResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function queryMap(url: string): Record<string, string | undefined> {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return {};
  const params = new URLSearchParams(url.slice(qIndex));
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

export async function handleLocalExecutiveRequest(req: NodeRequest, res: NodeResponse) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const pathname = (req.url || '').split('?')[0];
  const authorization = getAuthorizationHeader(req.headers);
  const query = queryMap(req.url || '');

  const routes: Record<string, () => Promise<{ status: number; body: unknown }>> = {
    '/api/executive/companies': () => getExecutiveCompanies(authorization),
    '/api/executive/stats': () => getExecutiveStats(authorization, query),
    '/api/executive/company-breakdown': () => getExecutiveCompanyBreakdown(authorization, query),
    '/api/executive/revenue-trends': () => getExecutiveRevenueTrends(authorization, query),
    '/api/executive/top-performers': () => getExecutiveTopPerformers(authorization, query),
    '/api/executive/recent-activity': () => getExecutiveRecentActivity(authorization, query),
    '/api/executive/brand-performance': () => getExecutiveBrandPerformance(authorization, query),
    '/api/executive/inventory/main': () => getExecutiveMainInventory(authorization, query),
    '/api/executive/inventory/leader': () => getExecutiveLeaderInventory(authorization, query),
    '/api/executive/team-leaders': () => getExecutiveTeamLeaders(authorization, query),
  };

  const run = routes[pathname];
  if (!run) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  const result = await run();
  sendJson(res, result.status, result.body);
}
