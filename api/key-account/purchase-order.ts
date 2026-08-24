import { getAuthorizationHeader } from '../../src/server/http/headers';
import { createRouteHandler } from '../../src/server/http/routeHandler';
import {
  createKAPurchaseOrderHandler,
  getKAPurchaseOrder,
  updateKAPurchaseOrderHandler,
} from '../../src/server/controllers/key-accounts/purchase-order';
import { maybeSendKAPoPaymentReminderNow } from '../../src/server/controllers/key-accounts/payment-notifications';

function requestHostParts(req: any): { host?: string; proto?: string } {
  const headers = req?.headers || {};
  const host = String(headers['x-forwarded-host'] || headers.host || '').trim();
  const proto = String(headers['x-forwarded-proto'] || 'http').trim();
  return { host: host || undefined, proto: proto || undefined };
}

function poIdFromWriteResult(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const po = (body as { po?: { id?: unknown } }).po;
  const id = po?.id;
  return typeof id === 'string' && id ? id : null;
}

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

  // Immediate send when notify date is today/past (fail-soft).
  if (result.status >= 200 && result.status < 300) {
    const poId = poIdFromWriteResult(result.body);
    if (poId) {
      const { host, proto } = requestHostParts(req);
      await maybeSendKAPoPaymentReminderNow({ poId, host, proto });
    }
  }

  return res.status(result.status).json(result.body);
}

export async function PATCH(req: any, res: any) {
  const result = await updateKAPurchaseOrderHandler(
    getAuthorizationHeader(req.headers || {}),
    req.query || {},
    req.body || {}
  );

  if (result.status >= 200 && result.status < 300) {
    const fromBody = poIdFromWriteResult(result.body);
    const fromQuery = typeof req?.query?.poId === 'string' ? req.query.poId : '';
    const poId = fromBody || fromQuery || null;
    if (poId && !req?.query?.action) {
      const { host, proto } = requestHostParts(req);
      await maybeSendKAPoPaymentReminderNow({ poId, host, proto });
    }
  }

  return res.status(result.status).json(result.body);
}

export default createRouteHandler({ GET, POST, PATCH });