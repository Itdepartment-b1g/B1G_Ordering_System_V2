import { getAuthorizationHeader } from '../../src/server/http/headers';
import { createRouteHandler } from '../../src/server/http/routeHandler';
import { getExecutiveRecentActivity } from '../../src/server/controllers/executiveController';

export async function GET(req: any, res: any) {
  const result = await getExecutiveRecentActivity(
    getAuthorizationHeader(req.headers || {}),
    req.query || {}
  );
  return res.status(result.status).json(result.body);
}

export default createRouteHandler({ GET });
