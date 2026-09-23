import { requireWarehouseContext } from '../../auth/requireWarehouseContext';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import { listWarehouseBatchInventory } from '../../repositories/warehouse/batch-view';
import { listWarehouseLocations } from '../../repositories/warehouse/locations';

async function resolveCtx(authorization: string | undefined) {
  return requireWarehouseContext(authorization, { requireMain: false });
}

export async function getWarehouseBatchViewHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const query = req.query || {};
    const resource = firstString(query.resource) || 'inventory';
    const ctx = await resolveCtx(authorization);

    switch (resource) {
      case 'inventory': {
        const locationId = firstString(query.locationId);
        if (!locationId) throw new HttpError(400, 'locationId is required');
        return { status: 200, body: await listWarehouseBatchInventory(ctx, locationId) };
      }
      case 'locations': {
        if (!ctx.isMain) throw new HttpError(403, 'Only main warehouse can list all locations');
        return { status: 200, body: await listWarehouseLocations(ctx) };
      }
      default:
        throw new HttpError(400, 'Unknown resource');
    }
  });
}
