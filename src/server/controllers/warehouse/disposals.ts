import { requireWarehouseContext } from '../../auth/requireWarehouseContext';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import {
  listWarehouseDisposalLocations,
  listWarehouseDisposalSaReturnDetails,
  listWarehouseDisposals,
} from '../../repositories/warehouse/disposals';

async function resolveCtx(authorization: string | undefined, requireMain = false) {
  return requireWarehouseContext(authorization, { requireMain });
}

export async function getWarehouseDisposalsHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const query = req.query || {};
    const resource = firstString(query.resource) || 'list';

    switch (resource) {
      case 'list': {
        const ctx = await resolveCtx(authorization, false);
        const locationId = firstString(query.locationId);
        return {
          status: 200,
          body: await listWarehouseDisposals(ctx, locationId),
        };
      }
      case 'locations': {
        const ctx = await resolveCtx(authorization, true);
        return { status: 200, body: await listWarehouseDisposalLocations(ctx) };
      }
      case 'sa-return-details': {
        const ctx = await resolveCtx(authorization, false);
        const idsParam = firstString(query.requestIds) || '';
        const requestIds = idsParam
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
        return {
          status: 200,
          body: await listWarehouseDisposalSaReturnDetails(ctx, requestIds),
        };
      }
      default:
        throw new HttpError(400, 'Unknown resource');
    }
  });
}
