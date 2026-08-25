import { getAuthorizationHeader } from '../../src/server/http/headers';
import { createRouteHandler } from '../../src/server/http/routeHandler';
import {
  createKAClientHierarchy,
  getKAClientHierarchy,
  updateKAClientHierarchy,
} from '../../src/server/controllers/key-accounts/client-hierarchy';

export async function GET(req: any, res: any) {
  const result = await getKAClientHierarchy(
    getAuthorizationHeader(req.headers || {}),
    req.query || {}
  );
  return res.status(result.status).json(result.body);
}

export async function POST(req: any, res: any) {
  const result = await createKAClientHierarchy(
    getAuthorizationHeader(req.headers || {}),
    req.query || {},
    req.body || {}
  );
  return res.status(result.status).json(result.body);
}

export async function PATCH(req: any, res: any) {
  const result = await updateKAClientHierarchy(
    getAuthorizationHeader(req.headers || {}),
    req.query || {},
    req.body || {}
  );
  return res.status(result.status).json(result.body);
}

export default createRouteHandler({ GET, POST, PATCH });
