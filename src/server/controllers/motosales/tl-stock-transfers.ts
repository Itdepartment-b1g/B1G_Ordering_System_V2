import {
  assertMotoSalesAdmin,
  requireMotoSalesContext,
} from '../../auth/requireMotoSalesContext';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import {
  adminApproveTlTransfer,
  adminRejectTlTransfer,
  dispatchTlTransfer,
  getTlTransfer,
  getTlTransferHistory,
  getTlTransferTdrDetails,
  listAdminTlTransfers,
  listDispatchedTlTransfers,
  listIncomingTlTransfers,
  listMyTlTransfers,
  listTlLostLines,
  listTlSourceAvailability,
  listTlSourceStock,
  listTlTransferLeaders,
  listTlTransferShortages,
  receiveTlTransfer,
  rejectTlTransfer,
  resolveTlDiscrepancy,
  submitTlTransfer,
  type DispatchTlTransferPayload,
  type ReceiveTlTransferPayload,
  type SubmitTlTransferPayload,
} from '../../repositories/motosales/tl-stock-transfers';

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export async function getMotoSalesTlTransfersHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const query = req.query || {};
    const ctx = await requireMotoSalesContext(authorization, firstString(query.company_id));
    const resource = firstString(query.resource) || 'mine';

    switch (resource) {
      case 'mine':
        return { status: 200, body: await listMyTlTransfers(ctx) };
      case 'incoming':
        return { status: 200, body: await listIncomingTlTransfers(ctx) };
      case 'dispatched':
        return { status: 200, body: await listDispatchedTlTransfers(ctx) };
      case 'admin':
        assertMotoSalesAdmin(ctx);
        return { status: 200, body: await listAdminTlTransfers(ctx) };
      case 'request':
        return { status: 200, body: await getTlTransfer(ctx, firstString(query.id) || '') };
      case 'leaders':
        return { status: 200, body: await listTlTransferLeaders(ctx) };
      case 'source-stock':
        return {
          status: 200,
          body: await listTlSourceStock(ctx, firstString(query.source_leader_id) || ''),
        };
      case 'source-availability':
        return {
          status: 200,
          body: await listTlSourceAvailability(
            ctx,
            firstString(query.source_leader_id) || '',
            stringList(firstString(query.variant_ids))
          ),
        };
      case 'shortages':
        return { status: 200, body: await listTlTransferShortages(ctx) };
      case 'lost':
        return { status: 200, body: await listTlLostLines(ctx) };
      case 'history':
        return {
          status: 200,
          body: await getTlTransferHistory(
            ctx,
            firstString(query.request_id) || '',
            stringList(firstString(query.profile_ids))
          ),
        };
      case 'tdr-details':
        return {
          status: 200,
          body: await getTlTransferTdrDetails(ctx, firstString(query.request_id) || ''),
        };
      default:
        throw new HttpError(400, 'Unknown resource');
    }
  });
}

export async function postMotoSalesTlTransfersHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const body = (req.body || {}) as Record<string, unknown>;
    const ctx = await requireMotoSalesContext(
      authorization,
      typeof body.company_id === 'string' ? body.company_id : null
    );
    const action = typeof body.action === 'string' ? body.action : '';

    switch (action) {
      case 'submit': {
        const payload: SubmitTlTransferPayload = {
          source_leader_id: String(body.source_leader_id || ''),
          items: (body.items as SubmitTlTransferPayload['items']) ?? [],
          notes: (body.notes as string | null | undefined) ?? null,
        };
        return { status: 201, body: await submitTlTransfer(ctx, payload) };
      }
      case 'dispatch': {
        const payload: DispatchTlTransferPayload = {
          request_id: String(body.request_id || ''),
          dispatched_quantity: Number(body.dispatched_quantity || 0),
          signature_url: String(body.signature_url || ''),
          signature_path: String(body.signature_path || ''),
          shortfall_reason: (body.shortfall_reason as string | null | undefined) ?? null,
          notes: (body.notes as string | null | undefined) ?? null,
          proof_urls: (body.proof_urls as string[] | null | undefined) ?? null,
          reuse_tdr: (body.reuse_tdr as string | null | undefined) ?? null,
        };
        return { status: 200, body: await dispatchTlTransfer(ctx, payload) };
      }
      case 'receive': {
        const payload: ReceiveTlTransferPayload = {
          request_id: String(body.request_id || ''),
          signature_url: String(body.signature_url || ''),
          signature_path: String(body.signature_path || ''),
          received_quantity: Number(body.received_quantity || 0),
          shortfall_reason: (body.shortfall_reason as string | null | undefined) ?? null,
          shortfall_notes: (body.shortfall_notes as string | null | undefined) ?? null,
          proof_urls: (body.proof_urls as string[] | null | undefined) ?? null,
        };
        return { status: 200, body: await receiveTlTransfer(ctx, payload) };
      }
      case 'reject':
        return {
          status: 200,
          body: await rejectTlTransfer(ctx, {
            request_id: String(body.request_id || ''),
            reason: String(body.reason || ''),
          }),
        };
      case 'admin-approve':
        assertMotoSalesAdmin(ctx);
        return {
          status: 200,
          body: await adminApproveTlTransfer(ctx, {
            request_id: String(body.request_id || ''),
            approved_quantity: Number(body.approved_quantity || 0),
            notes: (body.notes as string | null | undefined) ?? null,
          }),
        };
      case 'admin-reject':
        assertMotoSalesAdmin(ctx);
        return {
          status: 200,
          body: await adminRejectTlTransfer(ctx, {
            request_id: String(body.request_id || ''),
            reason: String(body.reason || ''),
          }),
        };
      case 'resolve-discrepancy':
        return {
          status: 200,
          body: await resolveTlDiscrepancy(ctx, {
            discrepancy_id: String(body.discrepancy_id || ''),
            resolution: String(body.resolution || ''),
            notes: (body.notes as string | null | undefined) ?? null,
          }),
        };
      default:
        throw new HttpError(400, 'Unknown action');
    }
  });
}
