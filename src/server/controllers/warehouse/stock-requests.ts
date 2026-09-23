import { requireWarehouseContext } from '../../auth/requireWarehouseContext';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import {
  cancelWarehouseStockRequest,
  createWarehouseStockRequest,
  listWarehouseStockRequestBrands,
  listWarehouseStockRequestCatalog,
  listWarehouseStockRequests,
  receiveWarehouseStockRequest,
  updateWarehouseStockRequest,
  type CancelStockRequestPayload,
  type CreateStockRequestPayload,
  type ReceiveStockRequestPayload,
  type UpdateStockRequestPayload,
} from '../../repositories/warehouse/stock-requests';

async function resolveWarehouseStockRequestContext(
  authorization: string | undefined,
  options?: { requireMain?: boolean }
) {
  return requireWarehouseContext(authorization, {
    requireMain: options?.requireMain,
  });
}

export async function getWarehouseStockRequestsHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const resource = firstString((req.query || {}).resource) || 'list';

    if (resource === 'brands' || resource === 'catalog') {
      const ctx = await resolveWarehouseStockRequestContext(authorization, { requireMain: true });
      if (resource === 'brands') {
        return { status: 200, body: await listWarehouseStockRequestBrands(ctx) };
      }
      return { status: 200, body: await listWarehouseStockRequestCatalog(ctx) };
    }

    if (resource !== 'list') {
      throw new HttpError(400, 'Unknown resource');
    }

    // List: any warehouse user (page UI still gates sub-warehouse).
    const ctx = await resolveWarehouseStockRequestContext(authorization);
    return { status: 200, body: await listWarehouseStockRequests(ctx) };
  });
}

export async function createWarehouseStockRequestsHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const ctx = await resolveWarehouseStockRequestContext(authorization, { requireMain: true });
    const body = (req.body || {}) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'create';

    switch (action) {
      case 'create': {
        const payload: CreateStockRequestPayload = {
          brand_id: (body.brand_id as string | null | undefined) ?? null,
          items: (body.items as CreateStockRequestPayload['items']) ?? [],
          notes: (body.notes as string | null | undefined) ?? null,
          expected_delivery_date:
            (body.expected_delivery_date as string | null | undefined) ?? null,
        };
        return { status: 201, body: await createWarehouseStockRequest(ctx, payload) };
      }
      case 'receive': {
        const payload: ReceiveStockRequestPayload = {
          request_id: String(body.request_id || ''),
          items: (body.items as unknown[]) ?? [],
          notes: (body.notes as string | null | undefined) ?? null,
        };
        return { status: 200, body: await receiveWarehouseStockRequest(ctx, payload) };
      }
      case 'cancel': {
        const payload: CancelStockRequestPayload = {
          request_id: String(body.request_id || ''),
          reason: (body.reason as string | null | undefined) ?? null,
        };
        return { status: 200, body: await cancelWarehouseStockRequest(ctx, payload) };
      }
      default:
        throw new HttpError(400, 'Unknown action');
    }
  });
}

export async function updateWarehouseStockRequestsHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const ctx = await resolveWarehouseStockRequestContext(authorization, { requireMain: true });
    const body = (req.body || {}) as Record<string, unknown>;
    const payload: UpdateStockRequestPayload = {
      request_id: String(body.request_id || ''),
      items: (body.items as UpdateStockRequestPayload['items']) ?? [],
      notes: (body.notes as string | null | undefined) ?? null,
      expected_delivery_date:
        (body.expected_delivery_date as string | null | undefined) ?? null,
    };
    return { status: 200, body: await updateWarehouseStockRequest(ctx, payload) };
  });
}
