import { getAuthorizationHeader } from '../../src/server/http/headers';
import { createRouteHandler } from '../../src/server/http/routeHandler';
import { getExecutiveTopPerformers } from '../../src/server/controllers/executive/executiveController';

export async function GET(req: any, res: any) {
  const result = await getExecutiveTopPerformers(
    getAuthorizationHeader(req.headers || {}),
    req.query || {}
  );
  return res.status(result.status).json(result.body);
}

export default createRouteHandler({ GET });
