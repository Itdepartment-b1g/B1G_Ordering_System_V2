import { getAuthorizationHeader } from '../../src/server/http/headers';
import { createRouteHandler } from '../../src/server/http/routeHandler';
import { getExecutiveRevenueTrends } from '../../src/server/controllers/executiveController';

export async function GET(req: any, res: any) {
  const result = await getExecutiveRevenueTrends(
    getAuthorizationHeader(req.headers || {}),
    req.query || {}
  );
  return res.status(result.status).json(result.body);
}

export default createRouteHandler({ GET });
