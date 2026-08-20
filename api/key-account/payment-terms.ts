import { getAuthorizationHeader } from '../../src/server/http/headers';
import { createRouteHandler } from '../../src/server/http/routeHandler';
import {
  createKAPaymentTermHandler,
  deleteKAPaymentTermHandler,
  getKAPaymentTermsHandler,
  updateKAPaymentTermHandler,
} from '../../src/server/controllers/key-accounts/payment-terms';

export async function GET(req: any, res: any) {
  const result = await getKAPaymentTermsHandler(
    getAuthorizationHeader(req.headers || {}),
    req.query || {}
  );
  return res.status(result.status).json(result.body);
}

export async function POST(req: any, res: any) {
  const result = await createKAPaymentTermHandler(
    getAuthorizationHeader(req.headers || {}),
    req.body || {}
  );
  return res.status(result.status).json(result.body);
}

export async function PATCH(req: any, res: any) {
  const result = await updateKAPaymentTermHandler(
    getAuthorizationHeader(req.headers || {}),
    req.body || {}
  );
  return res.status(result.status).json(result.body);
}

export async function DELETE(req: any, res: any) {
  const result = await deleteKAPaymentTermHandler(
    getAuthorizationHeader(req.headers || {}),
    req.query || {}
  );
  return res.status(result.status).json(result.body);
}

export default createRouteHandler({ GET, POST, PATCH, DELETE });
