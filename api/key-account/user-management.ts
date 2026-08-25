import { getAuthorizationHeader } from '../../src/server/http/headers';
import { createRouteHandler } from '../../src/server/http/routeHandler';
import { getKAUsers } from '../../src/server/controllers/key-accounts/user-management';

export async function GET(req: any, res: any) {
  const result = await getKAUsers(
    getAuthorizationHeader(req.headers || {}),
    req.query || {}
  );
  return res.status(result.status).json(result.body);
}

export default createRouteHandler({ GET });
