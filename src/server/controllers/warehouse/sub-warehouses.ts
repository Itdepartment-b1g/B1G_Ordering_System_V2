import { requireWarehouseContext } from '../../auth/requireWarehouseContext';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import {
  allocateToSubWarehouse,
  createSubWarehouse,
  createSubWarehouseStockReturn,
  getMyWarehouseLocation,
  getSubWarehousePoReserved,
  listSubWarehouseLocationUsers,
  listSubWarehouseLocations,
  listSubWarehouseReturnLots,
  type AllocateSubWarehousePayload,
  type CreateStockReturnPayload,
  type CreateSubWarehousePayload,
} from '../../repositories/warehouse/sub-warehouses';

async function resolveCtx(authorization: string | undefined, requireMain = false) {
  return requireWarehouseContext(authorization, { requireMain });
}

export async function getWarehouseSubWarehousesHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const query = req.query || {};
    const resource = firstString(query.resource) || 'list';
    const ctx = await resolveCtx(authorization, false);

    switch (resource) {
      case 'list':
        return { status: 200, body: await listSubWarehouseLocations(ctx) };
      case 'location-users':
        return { status: 200, body: await listSubWarehouseLocationUsers(ctx) };
      case 'my-location':
        return { status: 200, body: await getMyWarehouseLocation(ctx) };
      case 'po-reserved': {
        const locationId = firstString(query.locationId);
        if (!locationId) throw new HttpError(400, 'locationId is required');
        return { status: 200, body: await getSubWarehousePoReserved(ctx, locationId) };
      }
      case 'return-lots': {
        const locationId = firstString(query.locationId);
        if (!locationId) throw new HttpError(400, 'locationId is required');
        return { status: 200, body: await listSubWarehouseReturnLots(ctx, locationId) };
      }
      default:
        throw new HttpError(400, 'Unknown resource');
    }
  });
}

export async function createWarehouseSubWarehousesHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const body = (req.body || {}) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'create';

    switch (action) {
      case 'create': {
        const ctx = await resolveCtx(authorization, true);
        const payload: CreateSubWarehousePayload = {
          location_name: String(body.location_name || ''),
          full_name: String(body.full_name || ''),
          email: String(body.email || ''),
          password: String(body.password || ''),
          phone: (body.phone as string | null | undefined) ?? null,
        };
        return { status: 201, body: await createSubWarehouse(ctx, payload) };
      }
      case 'allocate': {
        const ctx = await resolveCtx(authorization, true);
        const payload: AllocateSubWarehousePayload = {
          location_id: String(body.location_id || ''),
          items: (body.items as AllocateSubWarehousePayload['items']) ?? [],
          notes: (body.notes as string | null | undefined) ?? null,
        };
        return { status: 200, body: await allocateToSubWarehouse(ctx, payload) };
      }
      case 'return': {
        const ctx = await resolveCtx(authorization, false);
        const payload: CreateStockReturnPayload = {
          from_location_id: String(body.from_location_id || ''),
          items: (body.items as CreateStockReturnPayload['items']) ?? [],
          notes: (body.notes as string | null | undefined) ?? null,
        };
        return { status: 200, body: await createSubWarehouseStockReturn(ctx, payload) };
      }
      default:
        throw new HttpError(400, 'Unknown action');
    }
  });
}
