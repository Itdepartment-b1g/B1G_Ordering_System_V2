import { requireAuthUser } from '../../auth/requireAuthUser';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import { maybeSendKAPoPaymentReminderNow } from './payment-notifications';
import {
  approveKASettlementDiscount,
  createKAPurchaseOrder,
  getKACompanyPendingDiscounts,
  getKAExistingPo,
  getKAPoDiscountRequests,
  getKAPoBrandBalances,
  getKAPoItems,
  getKAPoPaymentStatus,
  getKAPoPaymentSummary,
  getKAPoPayments,
  getKAPoPaymentsBulk,
  getKAPoRebateReturnLines,
  getKAPoRebateSource,
  getKAPoRfpfRevisions,
  getKAPoStock,
  getKAWarehouseLocationNames,
  listKADirectorKamIds,
  listKAPoAddresses,
  listKAPoClients,
  listKAPoOwners,
  listKAPoRebatesForPo,
  listKAPoShops,
  listKAPoWarehouses,
  listKAPurchaseOrders,
  recordKAPoListPayment,
  rejectKASettlementDiscount,
  markKAPoCommissioned,
  setKAPoRfpf,
  updateKAPoWorkflow,
  updateKAPurchaseOrder,
  type KAPoHeaderInput,
  type KAPoItemInput,
  type KAPoListPaymentInput,
  type KAPoPaymentInput,
} from '../../repositories/key-accounts/purchase-order';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

const WRITE_ROLES = ['sales_head', 'sales_admin', 'sales_director', 'key_account_manager'];
const LIST_ROLES = [...WRITE_ROLES, 'key_account_accounting'];

function accessTokenFromAuthorization(authorization?: string) {
  if (!authorization) return '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization.trim();
}

async function resolveUserContext(
  userId: string,
  accessToken?: string,
  options?: { allowAccounting?: boolean }
) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .single();

  if (error || !data) throw new HttpError(403, 'Could not resolve user profile');
  if (!data.company_id) throw new HttpError(403, 'User has no company assigned');

  const allowed = options?.allowAccounting ? LIST_ROLES : WRITE_ROLES;
  if (!allowed.includes(data.role)) {
    throw new HttpError(403, 'You do not have access to Key Account Purchase Orders');
  }

  return {
    userId,
    companyId: data.company_id,
    role: data.role,
    accessToken,
  };
}

function requestHostParts(req: any): { host?: string; proto?: string } {
  const headers = req?.headers || {};
  const host = String(headers['x-forwarded-host'] || headers.host || '').trim();
  const proto = String(headers['x-forwarded-proto'] || 'http').trim();
  return { host: host || undefined, proto: proto || undefined };
}

function poIdFromWriteResult(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const po = (body as { po?: { id?: unknown } }).po;
  const id = po?.id;
  return typeof id === 'string' && id ? id : null;
}

export async function getKAPurchaseOrder(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const query = req.query || {};
    const user = await requireAuthUser(authorization);
    const resource = firstString(query.resource) || '';
    const listResources = new Set([
      'list',
      'director-kams',
      'warehouse-names',
      'po-items',
      'po-payments',
      'po-brand-balances',
      'po-payment-summary',
      'po-discount-requests',
      'company-pending-discounts',
      'po-rfpf-revisions',
      'po-rebate-source',
      'po-rebate-return-lines',
      'po-rebates',
      'po-payment-status',
    ]);
    const ctx = await resolveUserContext(
      user.id,
      accessTokenFromAuthorization(authorization),
      { allowAccounting: listResources.has(resource) }
    );

    switch (resource) {
      case 'owners':
        return { status: 200, body: await listKAPoOwners(ctx) };
      case 'clients': {
        const search = firstString(query.search);
        const offset = Number(firstString(query.offset) || 0);
        const kamId = firstString(query.kamId);
        return { status: 200, body: await listKAPoClients(ctx, { search, offset, kamId }) };
      }
      case 'shops': {
        const clientId = firstString(query.clientId);
        if (!clientId) throw new HttpError(400, 'clientId is required');
        return { status: 200, body: await listKAPoShops(ctx, clientId) };
      }
      case 'addresses': {
        const shopId = firstString(query.shopId);
        if (!shopId) throw new HttpError(400, 'shopId is required');
        return { status: 200, body: await listKAPoAddresses(ctx, shopId) };
      }
      case 'warehouses':
        return { status: 200, body: await listKAPoWarehouses(ctx) };
      case 'stock': {
        const raw = firstString(query.variantIds) || '';
        const variantIds = raw.split(',').map((id) => id.trim()).filter(Boolean);
        return { status: 200, body: await getKAPoStock(ctx, variantIds) };
      }
      case 'existing': {
        const poId = firstString(query.poId);
        if (!poId) throw new HttpError(400, 'poId is required');
        return { status: 200, body: await getKAExistingPo(ctx, poId) };
      }
      case 'list':
        return { status: 200, body: await listKAPurchaseOrders(ctx) };
      case 'director-kams':
        return { status: 200, body: await listKADirectorKamIds(ctx) };
      case 'warehouse-names':
        return { status: 200, body: await getKAWarehouseLocationNames(ctx) };
      case 'po-items': {
        const poId = firstString(query.poId);
        if (!poId) throw new HttpError(400, 'poId is required');
        return { status: 200, body: await getKAPoItems(ctx, poId) };
      }
      case 'po-payments': {
        const poId = firstString(query.poId);
        if (!poId) throw new HttpError(400, 'poId is required');
        return { status: 200, body: await getKAPoPayments(ctx, poId) };
      }
      case 'po-brand-balances': {
        const poId = firstString(query.poId);
        if (!poId) throw new HttpError(400, 'poId is required');
        return { status: 200, body: await getKAPoBrandBalances(ctx, poId) };
      }
      case 'bulk-po-payments': {
        const raw = firstString(query.poIds) || '';
        const poIds = raw.split(',').map((id) => id.trim()).filter(Boolean);
        return { status: 200, body: await getKAPoPaymentsBulk(ctx, poIds) };
      }
      case 'po-payment-summary': {
        const poId = firstString(query.poId);
        if (!poId) throw new HttpError(400, 'poId is required');
        return { status: 200, body: await getKAPoPaymentSummary(ctx, poId) };
      }
      case 'po-discount-requests': {
        const poId = firstString(query.poId);
        if (!poId) throw new HttpError(400, 'poId is required');
        return { status: 200, body: await getKAPoDiscountRequests(ctx, poId) };
      }
      case 'company-pending-discounts':
        return { status: 200, body: await getKACompanyPendingDiscounts(ctx) };
      case 'po-rfpf-revisions': {
        const poId = firstString(query.poId);
        if (!poId) throw new HttpError(400, 'poId is required');
        return { status: 200, body: await getKAPoRfpfRevisions(ctx, poId) };
      }
      case 'po-rebate-source': {
        const rebateId = firstString(query.rebateId);
        if (!rebateId) throw new HttpError(400, 'rebateId is required');
        return { status: 200, body: await getKAPoRebateSource(ctx, rebateId) };
      }
      case 'po-rebate-return-lines': {
        const rebateId = firstString(query.rebateId);
        if (!rebateId) throw new HttpError(400, 'rebateId is required');
        return { status: 200, body: await getKAPoRebateReturnLines(ctx, rebateId) };
      }
      case 'po-rebates': {
        const poId = firstString(query.poId);
        if (!poId) throw new HttpError(400, 'poId is required');
        return { status: 200, body: await listKAPoRebatesForPo(ctx, poId) };
      }
      case 'po-payment-status': {
        const poId = firstString(query.poId);
        if (!poId) throw new HttpError(400, 'poId is required');
        return { status: 200, body: await getKAPoPaymentStatus(ctx, poId) };
      }
      default:
        throw new HttpError(400, 'Unknown resource');
    }
  });
}

export async function createKAPurchaseOrderHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const body = req.body || {};
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id, accessTokenFromAuthorization(authorization));
    const payload = (body || {}) as Record<string, unknown>;
    const action = typeof payload.action === 'string' ? payload.action : '';

    let result: { status: number; body: unknown };
    switch (action) {
      case 'set-rfpf': {
        const poId = typeof payload.poId === 'string' ? payload.poId : '';
        const rfpfNumber = typeof payload.rfpfNumber === 'string' ? payload.rfpfNumber : '';
        const reason = typeof payload.reason === 'string' ? payload.reason : null;
        if (!poId) throw new HttpError(400, 'poId is required');
        result = { status: 200, body: await setKAPoRfpf(ctx, poId, rfpfNumber, reason) };
        break;
      }
      case 'record-payment': {
        const payment = payload as unknown as KAPoListPaymentInput;
        if (!payment.poId) throw new HttpError(400, 'poId is required');
        result = { status: 200, body: await recordKAPoListPayment(ctx, payment) };
        break;
      }
      case 'approve-discount': {
        const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
        if (!requestId) throw new HttpError(400, 'requestId is required');
        result = { status: 200, body: await approveKASettlementDiscount(ctx, requestId) };
        break;
      }
      case 'reject-discount': {
        const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
        const reason = typeof payload.reason === 'string' ? payload.reason : null;
        if (!requestId) throw new HttpError(400, 'requestId is required');
        result = { status: 200, body: await rejectKASettlementDiscount(ctx, requestId, reason) };
        break;
      }
      case 'mark-commissioned': {
        const poId = typeof payload.poId === 'string' ? payload.poId : '';
        if (!poId) throw new HttpError(400, 'poId is required');
        result = { status: 200, body: await markKAPoCommissioned(ctx, poId) };
        break;
      }
      default: {
        const createPayload = body as {
          header: KAPoHeaderInput;
          items: KAPoItemInput[];
          payment?: KAPoPaymentInput | null;
        };
        result = { status: 201, body: await createKAPurchaseOrder(ctx, createPayload) };
        break;
      }
    }

    const poId = poIdFromWriteResult(result.body);
    if (poId) {
      const { host, proto } = requestHostParts(req);
      await maybeSendKAPoPaymentReminderNow({ poId, host, proto });
    }

    return result;
  });
}

export async function updateKAPurchaseOrderHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const query = req.query || {};
    const body = req.body || {};
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id, accessTokenFromAuthorization(authorization));
    const poId = firstString(query.poId);
    if (!poId) throw new HttpError(400, 'poId is required');

    const action = firstString(query.action);
    let result: { status: number; body: unknown };
    if (action === 'workflow') {
      const patch = (body || {}) as Record<string, unknown>;
      result = { status: 200, body: await updateKAPoWorkflow(ctx, poId, patch) };
    } else {
      const payload = (body || {}) as {
        header: KAPoHeaderInput;
        items: KAPoItemInput[];
        payment?: KAPoPaymentInput | null;
      };
      result = { status: 200, body: await updateKAPurchaseOrder(ctx, poId, payload) };
    }

    if (!query.action) {
      const fromBody = poIdFromWriteResult(result.body);
      const reminderPoId = fromBody || poId;
      if (reminderPoId) {
        const { host, proto } = requestHostParts(req);
        await maybeSendKAPoPaymentReminderNow({ poId: reminderPoId, host, proto });
      }
    }

    return result;
  });
}
