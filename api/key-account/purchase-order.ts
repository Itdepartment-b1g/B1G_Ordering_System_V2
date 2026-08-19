import { getAuthorizationHeader } from '../../src/server/http/headers';
import { createRouteHandler } from '../../src/server/http/routeHandler';
import {
  createKAPurchaseOrderHandler,
  getKAPurchaseOrder,
  updateKAPurchaseOrderHandler,
} from '../../src/server/controllers/key-accounts/purchase-order';

export async function GET(req: any, res: any) {
  const result = await getKAPurchaseOrder(
    getAuthorizationHeader(req.headers || {}),
    req.query || {}
  );
  return res.status(result.status).json(result.body);
}

export async function POST(req: any, res: any) {
  const result = await createKAPurchaseOrderHandler(
    getAuthorizationHeader(req.headers || {}),
    req.body || {}
  );
  return res.status(result.status).json(result.body);
}

export async function PATCH(req: any, res: any) {
  const result = await updateKAPurchaseOrderHandler(
    getAuthorizationHeader(req.headers || {}),
    req.query || {},
    req.body || {}
  );
  return res.status(result.status).json(result.body);
}

export default createRouteHandler({ GET, POST, PATCH });
