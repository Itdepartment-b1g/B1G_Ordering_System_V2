import { requireAuthUser } from '../../auth/requireAuthUser';
import { HttpError, toErrorResult } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import {
  createKAPurchaseOrder,
  getKAExistingPo,
  getKAPoStock,
  listKAPoAddresses,
  listKAPoClients,
  listKAPoOwners,
  listKAPoShops,
  listKAPoWarehouses,
  updateKAPurchaseOrder,
  type KAPoHeaderInput,
  type KAPoItemInput,
  type KAPoPaymentInput,
} from '../../repositories/key-accounts/purchase-order';
import type { ApiResult } from '../executive/executiveController';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

type QueryMap = Record<string, string | string[] | undefined>;

const ALLOWED_ROLES = ['sales_head', 'sales_admin', 'sales_director', 'key_account_manager'];

function accessTokenFromAuthorization(authorization?: string) {
  if (!authorization) return '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization.trim();
}

async function resolveUserContext(userId: string, accessToken?: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .single();

  if (error || !data) throw new HttpError(403, 'Could not resolve user profile');
  if (!data.company_id) throw new HttpError(403, 'User has no company assigned');
  if (!ALLOWED_ROLES.includes(data.role)) {
    throw new HttpError(403, 'You do not have access to Key Account Purchase Orders');
  }

  return {
    userId,
    companyId: data.company_id,
    role: data.role,
    accessToken,
  };
}

export async function getKAPurchaseOrder(
  authorization?: string,
  query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id, accessTokenFromAuthorization(authorization));
    const resource = firstString(query.resource) || '';

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
      default:
        throw new HttpError(400, 'Unknown resource');
    }
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function createKAPurchaseOrderHandler(
  authorization?: string,
  body: unknown = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id, accessTokenFromAuthorization(authorization));
    const payload = (body || {}) as {
      header: KAPoHeaderInput;
      items: KAPoItemInput[];
      payment?: KAPoPaymentInput | null;
    };
    return { status: 201, body: await createKAPurchaseOrder(ctx, payload) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function updateKAPurchaseOrderHandler(
  authorization?: string,
  query: QueryMap = {},
  body: unknown = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id, accessTokenFromAuthorization(authorization));
    const poId = firstString(query.poId);
    if (!poId) throw new HttpError(400, 'poId is required');
    const payload = (body || {}) as {
      header: KAPoHeaderInput;
      items: KAPoItemInput[];
      payment?: KAPoPaymentInput | null;
    };
    return { status: 200, body: await updateKAPurchaseOrder(ctx, poId, payload) };
  } catch (error) {
    return toErrorResult(error);
  }
}
