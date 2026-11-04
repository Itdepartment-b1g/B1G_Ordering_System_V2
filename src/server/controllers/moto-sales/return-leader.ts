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
  approveReturnLeaderHandover,
  createReturnLeaderHandover,
  listClientReturnStockHolds,
  listReturnLeaderHandovers,
  rejectReturnLeaderHandover,
  type CreateReturnLeaderPayload,
  type ReturnLeaderAttachmentInput,
} from '../../repositories/moto-sales/return-leader';

export async function getMotoSalesReturnLeaderHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const ctx = await requireMotoSalesContext(authorization);
    const query = req.query || {};
    const resource = firstString(query.resource) || 'handovers';

    switch (resource) {
      case 'handovers':
        return { status: 200, body: await listReturnLeaderHandovers(ctx) };
      case 'holds': {
        const holderId = firstString(query.holderId) || ctx.userId;
        return { status: 200, body: await listClientReturnStockHolds(ctx, holderId) };
      }
      default:
        throw new HttpError(400, 'Unknown resource');
    }
  });
}

export async function createMotoSalesReturnLeaderHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const body = (req.body || {}) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'create';

    if (action === 'create') {
      const ctx = await requireMotoSalesContext(authorization, {
        allowedRoles: MOTO_SALES_CREATE_ROLES,
      });
      requireMotoSalesCreateRoles(ctx);

      const payload: CreateReturnLeaderPayload = {
        items: (body.items as CreateReturnLeaderPayload['items']) ?? [],
        notes: (body.notes as string | null | undefined) ?? null,
        attachments: (body.attachments as ReturnLeaderAttachmentInput[]) ?? [],
        agent_signature_url: String(body.agent_signature_url || ''),
        agent_signature_path: (body.agent_signature_path as string | null | undefined) ?? null,
      };
      return { status: 201, body: await createReturnLeaderHandover(ctx, payload) };
    }

    const ctx = await requireMotoSalesContext(authorization, {
      allowedRoles: MOTO_SALES_VIEW_ROLES,
    });

    switch (action) {
      case 'approve': {
        return {
          status: 200,
          body: await approveReturnLeaderHandover(ctx, {
            handover_id: String(body.handover_id || ''),
            attachments: (body.attachments as ReturnLeaderAttachmentInput[]) ?? [],
          }),
        };
      }
      case 'reject': {
        return {
          status: 200,
          body: await rejectReturnLeaderHandover(ctx, {
            handover_id: String(body.handover_id || ''),
            note: (body.note as string | null | undefined) ?? null,
          }),
        };
      }
      default:
        throw new HttpError(400, 'Unknown action');
    }
  });
}
