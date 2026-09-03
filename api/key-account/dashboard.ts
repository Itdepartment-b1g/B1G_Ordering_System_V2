import { getAuthorizationHeader } from '../../src/server/http/headers';
import { createRouteHandler } from '../../src/server/http/routeHandler';
import { getKADashboardHandler } from '../../src/server/controllers/key-accounts/dashboard';

export async function GET(req: any, res: any) {
  const result = await getKADashboardHandler(
    getAuthorizationHeader(req.headers || {}),
    req.query || {}
  );
  return res.status(result.status).json(result.body);
}

export default createRouteHandler({ GET });
