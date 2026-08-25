import { createRouteHandler } from '../../src/server/http/routeHandler';
import {
  assertCronAuthorized,
  sendDueKAPoPaymentRemindersHandler,
} from '../../src/server/controllers/key-accounts/payment-notifications';
import { toErrorResult } from '../../src/server/http/errors';

function requestHostParts(req: any): { host?: string; proto?: string } {
  const headers = req?.headers || {};
  const host = String(headers['x-forwarded-host'] || headers.host || '').trim();
  const proto = String(headers['x-forwarded-proto'] || 'https').trim();
  return { host: host || undefined, proto: proto || undefined };
}

export async function GET(req: any, res: any) {
  try {
    assertCronAuthorized({
      headers: req?.headers || {},
      query: req?.query || {},
    });
  } catch (error) {
    const result = toErrorResult(error);
    return res.status(result.status).json(result.body);
  }

  const { host, proto } = requestHostParts(req);
  const result = await sendDueKAPoPaymentRemindersHandler({ host, proto });
  return res.status(result.status).json(result.body);
}

export default createRouteHandler({ GET });
