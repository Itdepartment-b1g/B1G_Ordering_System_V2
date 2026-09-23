import { requireWarehouseContext } from '../../auth/requireWarehouseContext';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import { listWarehouseLocations } from '../../repositories/warehouse/locations';
import {
  applyWarehouseStockAdjustment,
  listWarehouseStockAdjustmentBatchLots,
  listWarehouseStockAdjustmentBrands,
  listWarehouseStockAdjustments,
  listWarehouseStockAdjustmentVariants,
  type ApplyStockAdjustmentPayload,
} from '../../repositories/warehouse/stock-adjustments';

async function resolveCtx(authorization: string | undefined, requireMain = true) {
  return requireWarehouseContext(authorization, { requireMain });
}

export async function getWarehouseStockAdjustmentsHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const query = req.query || {};
    const resource = firstString(query.resource) || 'list';
    const ctx = await resolveCtx(authorization, true);

    switch (resource) {
      case 'list':
        return { status: 200, body: await listWarehouseStockAdjustments(ctx) };
      case 'locations':
        return { status: 200, body: await listWarehouseLocations(ctx) };
      case 'brands':
        return { status: 200, body: await listWarehouseStockAdjustmentBrands(ctx) };
      case 'variants': {
        const brandId = firstString(query.brandId);
        if (!brandId) throw new HttpError(400, 'brandId is required');
        return {
          status: 200,
          body: await listWarehouseStockAdjustmentVariants(ctx, brandId),
        };
      }
      case 'batch-lots': {
        const locationId = firstString(query.locationId);
        const variantId = firstString(query.variantId);
        if (!locationId) throw new HttpError(400, 'locationId is required');
        if (!variantId) throw new HttpError(400, 'variantId is required');
        return {
          status: 200,
          body: await listWarehouseStockAdjustmentBatchLots(ctx, locationId, variantId),
        };
      }
      default:
        throw new HttpError(400, 'Unknown resource');
    }
  });
}

export async function createWarehouseStockAdjustmentsHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const ctx = await resolveCtx(authorization, true);
    const body = (req.body || {}) as Record<string, unknown>;
    const payload: ApplyStockAdjustmentPayload = {
      warehouse_location_id: String(body.warehouse_location_id || ''),
      variant_id: String(body.variant_id || ''),
      quantity_delta: Number(body.quantity_delta),
      reason: String(body.reason || ''),
      notes: (body.notes as string | null | undefined) ?? null,
      lot_id: (body.lot_id as string | null | undefined) ?? null,
    };
    return { status: 200, body: await applyWarehouseStockAdjustment(ctx, payload) };
  });
}
