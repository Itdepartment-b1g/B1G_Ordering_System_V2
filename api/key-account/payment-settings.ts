import { getAuthorizationHeader } from '../../src/server/http/headers';
import { createRouteHandler } from '../../src/server/http/routeHandler';
import {
  createKAPaymentSettingsHandler,
  getKAPaymentSettingsHandler,
  updateKAPaymentSettingsHandler,
} from '../../src/server/controllers/key-accounts/payment-settings';

export async function GET(req: any, res: any) {
  const result = await getKAPaymentSettingsHandler(
    getAuthorizationHeader(req.headers || {}),
    req.query || {}
  );
  return res.status(result.status).json(result.body);
}

export async function POST(req: any, res: any) {
  const result = await createKAPaymentSettingsHandler(
    getAuthorizationHeader(req.headers || {}),
    req.body || {}
  );
  return res.status(result.status).json(result.body);
}

export async function PATCH(req: any, res: any) {
  const result = await updateKAPaymentSettingsHandler(
    getAuthorizationHeader(req.headers || {}),
    req.body || {}
  );
  return res.status(result.status).json(result.body);
}

export default createRouteHandler({ GET, POST, PATCH });
