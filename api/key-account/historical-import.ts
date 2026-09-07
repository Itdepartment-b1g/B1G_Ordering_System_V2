import { getAuthorizationHeader } from '../../src/server/http/headers';
import { createRouteHandler } from '../../src/server/http/routeHandler';
import { postKAHistoricalImport } from '../../src/server/controllers/key-accounts/historical-import';

export async function POST(req: any, res: any) {
  const result = await postKAHistoricalImport(getAuthorizationHeader(req.headers || {}), req.body || {});
  return res.status(result.status).json(result.body);
}

export default createRouteHandler({ POST });
