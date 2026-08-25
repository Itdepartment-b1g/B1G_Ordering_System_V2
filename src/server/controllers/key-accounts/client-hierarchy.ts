import { requireAuthUser } from '../../auth/requireAuthUser';
import { HttpError, toErrorResult } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import {
  createKAAddress,
  createKAClient,
  createKAShop,
  listKAAddresses,
  listKAClients,
  listKAShops,
  updateKAAddress,
  updateKAClient,
  updateKAShop,
  type KAAddressWritePayload,
  type KAClientWritePayload,
  type KAShopWritePayload,
} from '../../repositories/key-accounts/client-hierarchy';
import type { ApiResult } from '../executive/executiveController';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

type QueryMap = Record<string, string | string[] | undefined>;

const ALLOWED_ROLES = ['sales_head', 'sales_admin', 'sales_director', 'key_account_manager'];

async function resolveUserContext(userId: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .single();

  if (error || !data) throw new HttpError(403, 'Could not resolve user profile');
  if (!data.company_id) throw new HttpError(403, 'User has no company assigned');
  if (!ALLOWED_ROLES.includes(data.role)) {
    throw new HttpError(403, 'You do not have access to Key Account Client Hierarchy');
  }

  return {
    userId,
    companyId: data.company_id,
    role: data.role,
  };
}

export async function getKAClientHierarchy(
  authorization?: string,
  query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id);

    const clientId = firstString(query.clientId);
    const shopId = firstString(query.shopId);

    if (shopId) {
      return { status: 200, body: await listKAAddresses(ctx, shopId) };
    }

    if (clientId) {
      return { status: 200, body: await listKAShops(ctx, clientId) };
    }

    return { status: 200, body: await listKAClients(ctx) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function createKAClientHierarchy(
  authorization?: string,
  query: QueryMap = {},
  body: unknown = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id);
    const payload = (body || {}) as Record<string, unknown>;

    const clientId = firstString(query.clientId);
    const shopId = firstString(query.shopId);

    if (shopId) {
      return { status: 201, body: await createKAAddress(ctx, shopId, payload as KAAddressWritePayload) };
    }

    if (clientId) {
      return { status: 201, body: await createKAShop(ctx, clientId, payload as KAShopWritePayload) };
    }

    return { status: 201, body: await createKAClient(ctx, payload as KAClientWritePayload) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function updateKAClientHierarchy(
  authorization?: string,
  query: QueryMap = {},
  body: unknown = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id);
    const payload = (body || {}) as Record<string, unknown>;

    const clientId = firstString(query.clientId);
    const shopId = firstString(query.shopId);
    const addressId = firstString(query.addressId);

    if (addressId) {
      return { status: 200, body: await updateKAAddress(ctx, addressId, payload as KAAddressWritePayload) };
    }

    if (shopId) {
      return { status: 200, body: await updateKAShop(ctx, shopId, payload as KAShopWritePayload) };
    }

    if (clientId) {
      return { status: 200, body: await updateKAClient(ctx, clientId, payload as KAClientWritePayload) };
    }

    throw new HttpError(400, 'clientId, shopId, or addressId is required');
  } catch (error) {
    return toErrorResult(error);
  }
}
