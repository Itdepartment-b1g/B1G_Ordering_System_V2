import { getAuthorizationHeader } from '../../src/server/http/headers';
import { createRouteHandler } from '../../src/server/http/routeHandler';
import { getExecutiveCompanies } from '../../src/server/controllers/executiveController';

export async function GET(req: any, res: any) {
  const result = await getExecutiveCompanies(getAuthorizationHeader(req.headers || {}));
  return res.status(result.status).json(result.body);
}

export default createRouteHandler({ GET });
