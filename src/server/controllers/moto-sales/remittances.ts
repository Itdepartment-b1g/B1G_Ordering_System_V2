import { requireMotoSalesContext } from '../../auth/requireMotoSalesContext';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import {
  getAgentRemittanceDetail,
  listAgentRemittances,
} from '../../repositories/moto-sales/remittances';

/** Agents/mobile sales only for own remittance history. */
const AGENT_REMITTANCE_ROLES = ['mobile_sales', 'sales_agent'] as const;

export async function getMotoSalesRemittancesHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const ctx = await requireMotoSalesContext(authorization, {
      allowedRoles: AGENT_REMITTANCE_ROLES,
    });
    const query = req.query || {};
    const resource = firstString(query.resource) || 'list';

    switch (resource) {
      case 'list': {
        const date = firstString(query.date);
        return {
          status: 200,
          body: await listAgentRemittances(ctx, { date }),
        };
      }
      case 'detail': {
        const id = firstString(query.id);
        if (!id) throw new HttpError(400, 'id is required');
        return {
          status: 200,
          body: await getAgentRemittanceDetail(ctx, id),
        };
      }
      default:
        throw new HttpError(400, 'Unknown resource');
    }
  });
}
