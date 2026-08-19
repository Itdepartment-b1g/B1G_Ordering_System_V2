import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { supabase } from '@/lib/supabase';
import type {
  KeyAccountClient,
  KeyAccountDeliveryAddress,
  KeyAccountShop,
} from '@/types/database.types';

async function kaRequest<T>(
  path: string,
  options?: {
    method?: string;
    params?: Record<string, string | undefined>;
    body?: unknown;
  }
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options?.params || {})) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  const res = await fetch(`/api/key-account/${path}${qs ? `?${qs}` : ''}`, {
    method: options?.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Failed to load ${path}`);
  }
  return body as T;
}

export type KAPoOwner = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
};

export type KAPoWarehouse = {
  id: string;
  company_id: string;
  company_name?: string;
  location_id: string;
  location_name: string;
  is_main: boolean;
};

export type KAPoHeaderPayload = {
  warehouse_company_id: string | null;
  warehouse_location_id: string | null;
  key_account_client_id: string;
  key_account_shop_id: string;
  key_account_address_id: string;
  kam_id: string | null;
  order_date: string;
  expected_delivery_date: string;
  notes?: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total_amount: number;
  po_order_kind: 'consignment' | 'standard';
  key_account_payment_terms?: string | null;
  key_account_payment_terms_source?: string | null;
  key_account_payment_terms_created_by?: string | null;
  key_account_payment_mode?: string | null;
};

export type KAPoItemPayload = {
  variant_id: string;
  warehouse_location_id?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
};

export type KAPoPaymentPayload = {
  amount: number;
  payment_method: string;
  bank_type?: string | null;
  proof_storage_path: string;
};

export type KAPoWritePayload = {
  header: KAPoHeaderPayload;
  items: KAPoItemPayload[];
  payment?: KAPoPaymentPayload | null;
};

export const fetchKAPoOwners = createAsyncThunk('kaPurchaseOrder/fetchOwners', () =>
  kaRequest<{ owners: KAPoOwner[] }>('purchase-order', { params: { resource: 'owners' } })
);

export const fetchKAPoClients = createAsyncThunk(
  'kaPurchaseOrder/fetchClients',
  (args: { search?: string; offset?: number; kamId?: string }) =>
    kaRequest<{ clients: KeyAccountClient[]; hasMore: boolean }>('purchase-order', {
      params: {
        resource: 'clients',
        search: args.search,
        offset: args.offset != null ? String(args.offset) : '0',
        kamId: args.kamId,
      },
    })
);

export const fetchKAPoShops = createAsyncThunk('kaPurchaseOrder/fetchShops', (clientId: string) =>
  kaRequest<{ shops: KeyAccountShop[] }>('purchase-order', {
    params: { resource: 'shops', clientId },
  })
);

export const fetchKAPoAddresses = createAsyncThunk('kaPurchaseOrder/fetchAddresses', (shopId: string) =>
  kaRequest<{ addresses: KeyAccountDeliveryAddress[] }>('purchase-order', {
    params: { resource: 'addresses', shopId },
  })
);

export const fetchKAPoWarehouses = createAsyncThunk('kaPurchaseOrder/fetchWarehouses', () =>
  kaRequest<{
    linkedWarehouseCompanyId: string | null;
    warehouses: KAPoWarehouse[];
    brands: { id: string; name: string }[];
    variants: { id: string; name: string; variant_type: string | null; brand_id: string | null }[];
  }>('purchase-order', { params: { resource: 'warehouses' } })
);

export const fetchKAPoStock = createAsyncThunk('kaPurchaseOrder/fetchStock', (variantIds: string[]) =>
  kaRequest<{
    stockMap: Record<string, number>;
    onHandMap: Record<string, number>;
    reservedMap: Record<string, number>;
  }>('purchase-order', {
    params: { resource: 'stock', variantIds: variantIds.join(',') },
  })
);

export const fetchKAExistingPo = createAsyncThunk('kaPurchaseOrder/fetchExisting', (poId: string) =>
  kaRequest<{ po: any; items: any[]; payments: any[] }>('purchase-order', {
    params: { resource: 'existing', poId },
  })
);

export const createKAPurchaseOrder = createAsyncThunk(
  'kaPurchaseOrder/create',
  (payload: KAPoWritePayload) =>
    kaRequest<{ po: { id: string; po_number: string; workflow_status: string } }>('purchase-order', {
      method: 'POST',
      body: payload,
    })
);

export const updateKAPurchaseOrder = createAsyncThunk(
  'kaPurchaseOrder/update',
  ({ poId, payload }: { poId: string; payload: KAPoWritePayload }) =>
    kaRequest<{ po: { id: string } }>('purchase-order', {
      method: 'PATCH',
      params: { poId },
      body: payload,
    })
);

const kaPurchaseOrderSlice = createSlice({
  name: 'kaPurchaseOrder',
  initialState: {},
  reducers: {},
});

export const kaPurchaseOrderReducer = kaPurchaseOrderSlice.reducer;
