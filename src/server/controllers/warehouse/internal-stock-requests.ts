import { requireWarehouseContext } from '../../auth/requireWarehouseContext';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import {
  allocateInternalStockRequestRemaining,
  approveInternalStockRequest,
  confirmInternalStockRequestReceive,
  createInternalStockRequest,
  createMainStockAllocation,
  deliverInternalStockRequest,
  deliverMainStockAllocation,
  getInternalStockRequestById,
  listInternalStockRequests,
  listSubWarehouseLocationsForAllocate,
  rejectInternalStockRequest,
} from '../../repositories/warehouse/internal-stock-requests';

async function resolveCtx(authorization: string | undefined, requireMain = false) {
  return requireWarehouseContext(authorization, { requireMain });
}

export async function getWarehouseInternalStockRequestsHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const query = req.query || {};
    const resource = firstString(query.resource) || 'list';

    switch (resource) {
      case 'list': {
        const ctx = await resolveCtx(authorization, false);
        const status = firstString(query.status);
        const fromLocationId = firstString(query.fromLocationId);
        const includeEvents = firstString(query.includeEvents) === '1';
        return {
          status: 200,
          body: await listInternalStockRequests(ctx, {
            status: status && status !== 'all' ? status : null,
            fromLocationId: fromLocationId && fromLocationId !== 'all' ? fromLocationId : null,
            includeEvents,
          }),
        };
      }
      case 'detail': {
        const ctx = await resolveCtx(authorization, false);
        const requestId = firstString(query.requestId);
        if (!requestId) throw new HttpError(400, 'requestId is required');
        return { status: 200, body: await getInternalStockRequestById(ctx, requestId) };
      }
      case 'sub-locations': {
        const ctx = await resolveCtx(authorization, true);
        return { status: 200, body: await listSubWarehouseLocationsForAllocate(ctx) };
      }
      default:
        throw new HttpError(400, 'Unknown resource');
    }
  });
}

export async function createWarehouseInternalStockRequestsHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const body = (req.body || {}) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    switch (action) {
      case 'create': {
        const ctx = await resolveCtx(authorization, false);
        return {
          status: 201,
          body: await createInternalStockRequest(ctx, {
            items: (body.items as Array<{ variant_id: string; quantity: number }>) ?? [],
            notes: (body.notes as string | null | undefined) ?? null,
            from_location_id: (body.from_location_id as string | null | undefined) ?? null,
          }),
        };
      }
      case 'approve': {
        const ctx = await resolveCtx(authorization, true);
        return {
          status: 200,
          body: await approveInternalStockRequest(ctx, String(body.request_id || '')),
        };
      }
      case 'reject': {
        const ctx = await resolveCtx(authorization, true);
        return {
          status: 200,
          body: await rejectInternalStockRequest(ctx, {
            request_id: String(body.request_id || ''),
            reason: String(body.reason || ''),
            signature_url: String(body.signature_url || ''),
            signature_path: (body.signature_path as string | null | undefined) ?? null,
          }),
        };
      }
      case 'deliver': {
        const ctx = await resolveCtx(authorization, true);
        return {
          status: 200,
          body: await deliverInternalStockRequest(ctx, {
            request_id: String(body.request_id || ''),
            signature_url: String(body.signature_url || ''),
            proof_image_url: String(body.proof_image_url || ''),
            rider_name: String(body.rider_name || ''),
            rider_plate_number: String(body.rider_plate_number || ''),
            rider_photo_url: String(body.rider_photo_url || ''),
            signature_path: (body.signature_path as string | null | undefined) ?? null,
            proof_image_path: (body.proof_image_path as string | null | undefined) ?? null,
            rider_photo_path: (body.rider_photo_path as string | null | undefined) ?? null,
          }),
        };
      }
      case 'create-allocation': {
        const ctx = await resolveCtx(authorization, true);
        return {
          status: 201,
          body: await createMainStockAllocation(ctx, {
            from_location_id: String(body.from_location_id || ''),
            items: (body.items as Array<{ variant_id: string; quantity: number }>) ?? [],
            proof_image_url: String(body.proof_image_url || ''),
            proof_image_path: (body.proof_image_path as string | null | undefined) ?? null,
            proof_image_urls: (body.proof_image_urls as string[] | null | undefined) ?? null,
            proof_image_paths: (body.proof_image_paths as string[] | null | undefined) ?? null,
            notes: (body.notes as string | null | undefined) ?? null,
          }),
        };
      }
      case 'deliver-allocation': {
        const ctx = await resolveCtx(authorization, true);
        return {
          status: 200,
          body: await deliverMainStockAllocation(ctx, {
            request_id: String(body.request_id || ''),
            signature_url: String(body.signature_url || ''),
            rider_name: String(body.rider_name || ''),
            rider_plate_number: String(body.rider_plate_number || ''),
            rider_photo_url: String(body.rider_photo_url || ''),
            signature_path: (body.signature_path as string | null | undefined) ?? null,
            rider_photo_path: (body.rider_photo_path as string | null | undefined) ?? null,
          }),
        };
      }
      case 'allocate-remaining': {
        const ctx = await resolveCtx(authorization, true);
        return {
          status: 200,
          body: await allocateInternalStockRequestRemaining(ctx, {
            request_id: String(body.request_id || ''),
            lines: (body.lines as Array<{ variant_id: string; quantity: number }>) ?? [],
            proof_image_url: String(body.proof_image_url || ''),
            signature_url: String(body.signature_url || ''),
            rider_name: String(body.rider_name || ''),
            rider_plate_number: String(body.rider_plate_number || ''),
            rider_photo_url: String(body.rider_photo_url || ''),
            note: (body.note as string | null | undefined) ?? null,
            proof_image_path: (body.proof_image_path as string | null | undefined) ?? null,
            signature_path: (body.signature_path as string | null | undefined) ?? null,
            rider_photo_path: (body.rider_photo_path as string | null | undefined) ?? null,
          }),
        };
      }
      case 'confirm-receive': {
        const ctx = await resolveCtx(authorization, false);
        return {
          status: 200,
          body: await confirmInternalStockRequestReceive(ctx, {
            request_id: String(body.request_id || ''),
            lines:
              (body.lines as Array<{
                variant_id: string;
                quantity: number;
                shortfall_reason?: string;
                shortfall_notes?: string;
              }>) ?? [],
            proof_image_url: String(body.proof_image_url || ''),
            signature_url: String(body.signature_url || ''),
            notes: (body.notes as string | null | undefined) ?? null,
            proof_image_path: (body.proof_image_path as string | null | undefined) ?? null,
            proof_image_name: (body.proof_image_name as string | null | undefined) ?? null,
            signature_path: (body.signature_path as string | null | undefined) ?? null,
          }),
        };
      }
      default:
        throw new HttpError(400, 'Unknown action');
    }
  });
}
