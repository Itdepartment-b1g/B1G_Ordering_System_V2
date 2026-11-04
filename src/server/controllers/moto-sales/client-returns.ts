import {
  MOTO_SALES_CREATE_ROLES,
  MOTO_SALES_VIEW_ROLES,
  requireMotoSalesContext,
  requireMotoSalesCreateRoles,
} from '../../auth/requireMotoSalesContext';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import {
  approveClientOrderReturn,
  createClientOrderReturn,
  getChangeItemCatalog,
  getPostedReturnedQtyByItemId,
  listClientOrderReturns,
  rejectClientOrderReturn,
  type CreateClientReturnPayload,
} from '../../repositories/moto-sales/client-returns';

export async function getMotoSalesClientReturnsHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const ctx = await requireMotoSalesContext(authorization);
    const query = req.query || {};
    const resource = firstString(query.resource) || 'list';

    switch (resource) {
      case 'list': {
        const orderId = firstString(query.orderId);
        return {
          status: 200,
          body: await listClientOrderReturns(ctx, orderId ? { orderId } : undefined),
        };
      }
      case 'posted-qty': {
        const orderId = firstString(query.orderId);
        if (!orderId) throw new HttpError(400, 'orderId is required');
        return { status: 200, body: await getPostedReturnedQtyByItemId(ctx, orderId) };
      }
      case 'change-catalog': {
        const brandIdsRaw = firstString(query.brandIds) || '';
        const brandIds = brandIdsRaw
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
        return { status: 200, body: await getChangeItemCatalog(ctx, brandIds) };
      }
      default:
        throw new HttpError(400, 'Unknown resource');
    }
  });
}

export async function createMotoSalesClientReturnsHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const body = (req.body || {}) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'create';

    if (action === 'create') {
      const ctx = await requireMotoSalesContext(authorization, {
        allowedRoles: MOTO_SALES_CREATE_ROLES,
      });
      requireMotoSalesCreateRoles(ctx);

      const payload: CreateClientReturnPayload = {
        client_order_id: String(body.client_order_id || ''),
        return_date: String(body.return_date || ''),
        reason: String(body.reason || ''),
        notes: (body.notes as string | null | undefined) ?? '',
        agent_signature_url: String(body.agent_signature_url || ''),
        items: (body.items as CreateClientReturnPayload['items']) ?? [],
        change_items: (body.change_items as CreateClientReturnPayload['change_items']) ?? [],
        attachments: (body.attachments as CreateClientReturnPayload['attachments']) ?? [],
        return_type: body.return_type === 'refund' ? 'refund' : 'change_item',
      };
      return { status: 201, body: await createClientOrderReturn(ctx, payload) };
    }

    const ctx = await requireMotoSalesContext(authorization, {
      allowedRoles: MOTO_SALES_VIEW_ROLES,
    });

    switch (action) {
      case 'approve': {
        return {
          status: 200,
          body: await approveClientOrderReturn(ctx, {
            return_id: String(body.return_id || ''),
            payout_attachments: Array.isArray(body.payout_attachments)
              ? (body.payout_attachments as CreateClientReturnPayload['attachments'])
              : undefined,
          }),
        };
      }
      case 'reject': {
        return {
          status: 200,
          body: await rejectClientOrderReturn(ctx, {
            return_id: String(body.return_id || ''),
            note: (body.note as string | null | undefined) ?? null,
          }),
        };
      }
      default:
        throw new HttpError(400, 'Unknown action');
    }
  });
}
