import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { supabase } from '@/lib/supabase';
import type {
  KeyAccountClient,
  KeyAccountDeliveryAddress,
  KeyAccountShop,
} from '@/types/database.types';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

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

export type KAPoVariant = {
  id: string;
  name: string;
  variant_type: string | null;
  brand_id: string | null;
};

export type KAPoBrand = { id: string; name: string };

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

type KAPurchaseOrderState = {
  owners: KAPoOwner[];
  ownersStatus: QueryStatus;
  ownersError: string | null;

  clients: KeyAccountClient[];
  clientsHasMore: boolean;
  clientsStatus: QueryStatus;
  clientsLoadingMore: boolean;
  clientsError: string | null;
  clientsFetchId: number;

  shops: KeyAccountShop[];
  shopsStatus: QueryStatus;
  shopsError: string | null;

  addresses: KeyAccountDeliveryAddress[];
  addressesStatus: QueryStatus;
  addressesError: string | null;

  linkedWarehouseCompanyId: string | null;
  warehouses: KAPoWarehouse[];
  brands: KAPoBrand[];
  variants: KAPoVariant[];
  warehousesStatus: QueryStatus;
  warehousesError: string | null;

  stockMap: Record<string, number>;
  onHandMap: Record<string, number>;
  reservedMap: Record<string, number>;
  stockStatus: QueryStatus;
  stockError: string | null;

  existingPo: Record<string, unknown> | null;
  existingItems: unknown[];
  existingPayments: unknown[];
  existingPoStatus: QueryStatus;
  existingPoError: string | null;

  createStatus: QueryStatus;
  updateStatus: QueryStatus;
  writeError: string | null;

  listRows: Record<string, unknown>[];
  listStatus: QueryStatus;
  listError: string | null;

  directorKamIds: string[];
  directorKamIdsStatus: QueryStatus;

  warehouseLocationNames: Record<string, string>;
  warehouseLocationNamesStatus: QueryStatus;
};

const initialState: KAPurchaseOrderState = {
  owners: [],
  ownersStatus: 'idle',
  ownersError: null,

  clients: [],
  clientsHasMore: false,
  clientsStatus: 'idle',
  clientsLoadingMore: false,
  clientsError: null,
  clientsFetchId: 0,

  shops: [],
  shopsStatus: 'idle',
  shopsError: null,

  addresses: [],
  addressesStatus: 'idle',
  addressesError: null,

  linkedWarehouseCompanyId: null,
  warehouses: [],
  brands: [],
  variants: [],
  warehousesStatus: 'idle',
  warehousesError: null,

  stockMap: {},
  onHandMap: {},
  reservedMap: {},
  stockStatus: 'idle',
  stockError: null,

  existingPo: null,
  existingItems: [],
  existingPayments: [],
  existingPoStatus: 'idle',
  existingPoError: null,

  createStatus: 'idle',
  updateStatus: 'idle',
  writeError: null,

  listRows: [],
  listStatus: 'idle',
  listError: null,

  directorKamIds: [],
  directorKamIdsStatus: 'idle',

  warehouseLocationNames: {},
  warehouseLocationNamesStatus: 'idle',
};

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

export const fetchKAPoOwners = createAsyncThunk('kaPurchaseOrder/fetchOwners', () =>
  kaRequest<{ owners: KAPoOwner[] }>('purchase-order', { params: { resource: 'owners' } })
);

export const fetchKAPoClients = createAsyncThunk(
  'kaPurchaseOrder/fetchClients',
  (args: { search?: string; offset?: number; kamId?: string; append?: boolean; fetchId?: number }) =>
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
    brands: KAPoBrand[];
    variants: KAPoVariant[];
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
  kaRequest<{ po: Record<string, unknown>; items: unknown[]; payments: unknown[] }>('purchase-order', {
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

export const fetchKAPoList = createAsyncThunk('kaPurchaseOrder/fetchList', () =>
  kaRequest<{ rows: Record<string, unknown>[] }>('purchase-order', { params: { resource: 'list' } })
);

export const fetchKADirectorKamIds = createAsyncThunk('kaPurchaseOrder/fetchDirectorKams', () =>
  kaRequest<{ kamIds: string[] }>('purchase-order', { params: { resource: 'director-kams' } })
);

export const fetchKAWarehouseLocationNames = createAsyncThunk('kaPurchaseOrder/fetchWarehouseNames', () =>
  kaRequest<{ namesById: Record<string, string> }>('purchase-order', {
    params: { resource: 'warehouse-names' },
  })
);

export const fetchKAPoItems = createAsyncThunk('kaPurchaseOrder/fetchPoItems', (poId: string) =>
  kaRequest<{ items: unknown[] }>('purchase-order', { params: { resource: 'po-items', poId } })
);

export const fetchKAPoPayments = createAsyncThunk('kaPurchaseOrder/fetchPoPayments', (poId: string) =>
  kaRequest<{ payments: unknown[] }>('purchase-order', { params: { resource: 'po-payments', poId } })
);

export const fetchKAPoPaymentSummary = createAsyncThunk(
  'kaPurchaseOrder/fetchPoPaymentSummary',
  (poId: string) =>
    kaRequest<{ paid: number; discount: number; entryCount: number }>('purchase-order', {
      params: { resource: 'po-payment-summary', poId },
    })
);

export const fetchKAPoDiscountRequests = createAsyncThunk(
  'kaPurchaseOrder/fetchPoDiscountRequests',
  (poId: string) =>
    kaRequest<{ requests: unknown[] }>('purchase-order', {
      params: { resource: 'po-discount-requests', poId },
    })
);

export const fetchKACompanyPendingDiscounts = createAsyncThunk(
  'kaPurchaseOrder/fetchCompanyPendingDiscounts',
  () =>
    kaRequest<{ requests: unknown[] }>('purchase-order', {
      params: { resource: 'company-pending-discounts' },
    })
);

export const fetchKAPoRfpfRevisions = createAsyncThunk(
  'kaPurchaseOrder/fetchPoRfpfRevisions',
  (poId: string) =>
    kaRequest<{ revisions: unknown[] }>('purchase-order', {
      params: { resource: 'po-rfpf-revisions', poId },
    })
);

export const fetchKAPoRebateSource = createAsyncThunk(
  'kaPurchaseOrder/fetchPoRebateSource',
  (rebateId: string) =>
    kaRequest<{ source: Record<string, unknown> | null }>('purchase-order', {
      params: { resource: 'po-rebate-source', rebateId },
    })
);

export const fetchKAPoRebateReturnLines = createAsyncThunk(
  'kaPurchaseOrder/fetchPoRebateReturnLines',
  (rebateId: string) =>
    kaRequest<{ lines: unknown[] }>('purchase-order', {
      params: { resource: 'po-rebate-return-lines', rebateId },
    })
);

export const fetchKAPoRebates = createAsyncThunk('kaPurchaseOrder/fetchPoRebates', (poId: string) =>
  kaRequest<{ rebates: unknown[] }>('purchase-order', { params: { resource: 'po-rebates', poId } })
);

export const patchKAPoWorkflow = createAsyncThunk(
  'kaPurchaseOrder/patchWorkflow',
  ({ poId, patch }: { poId: string; patch: Record<string, unknown> }) =>
    kaRequest<{
      ok: boolean;
      poId: string;
      patched: Record<string, unknown>;
      po: Record<string, unknown>;
    }>('purchase-order', {
      method: 'PATCH',
      params: { poId, action: 'workflow' },
      body: patch,
    })
);

export const setKAPoRfpf = createAsyncThunk(
  'kaPurchaseOrder/setRfpf',
  ({ poId, rfpfNumber, reason }: { poId: string; rfpfNumber: string; reason?: string | null }) =>
    kaRequest<{ success?: boolean; message?: string }>('purchase-order', {
      method: 'POST',
      body: { action: 'set-rfpf', poId, rfpfNumber, reason: reason ?? null },
    })
);

export type KAPoListPaymentPayload = {
  poId: string;
  amount: number;
  settlementDiscount?: number;
  settlementDiscountReason?: string | null;
  paymentMethod: string;
  bankType?: string | null;
  proofStoragePath?: string | null;
};

export const recordKAPoListPayment = createAsyncThunk(
  'kaPurchaseOrder/recordListPayment',
  (payload: KAPoListPaymentPayload) =>
    kaRequest<{ key_account_payment_status: string | null }>('purchase-order', {
      method: 'POST',
      body: { action: 'record-payment', ...payload },
    })
);

export const approveKASettlementDiscount = createAsyncThunk(
  'kaPurchaseOrder/approveDiscount',
  (requestId: string) =>
    kaRequest<{ success?: boolean; error?: string; purchase_order_id?: string }>('purchase-order', {
      method: 'POST',
      body: { action: 'approve-discount', requestId },
    })
);

export const rejectKASettlementDiscount = createAsyncThunk(
  'kaPurchaseOrder/rejectDiscount',
  ({ requestId, reason }: { requestId: string; reason?: string | null }) =>
    kaRequest<{ success?: boolean; error?: string; purchase_order_id?: string }>('purchase-order', {
      method: 'POST',
      body: { action: 'reject-discount', requestId, reason: reason ?? null },
    })
);

const kaPurchaseOrderSlice = createSlice({
  name: 'kaPurchaseOrder',
  initialState,
  reducers: {
    resetClients(state) {
      state.clients = [];
      state.clientsHasMore = false;
      state.clientsStatus = 'idle';
      state.clientsLoadingMore = false;
      state.clientsError = null;
    },
    setClientsList(state, action: PayloadAction<KeyAccountClient[]>) {
      state.clients = action.payload;
      state.clientsHasMore = false;
      state.clientsStatus = 'succeeded';
      state.clientsError = null;
    },
    resetShops(state) {
      state.shops = [];
      state.shopsStatus = 'idle';
      state.shopsError = null;
    },
    resetAddresses(state) {
      state.addresses = [];
      state.addressesStatus = 'idle';
      state.addressesError = null;
    },
    resetStock(state) {
      state.stockMap = {};
      state.onHandMap = {};
      state.reservedMap = {};
      state.stockStatus = 'idle';
      state.stockError = null;
    },
    resetExistingPo(state) {
      state.existingPo = null;
      state.existingItems = [];
      state.existingPayments = [];
      state.existingPoStatus = 'idle';
      state.existingPoError = null;
    },
    resetWriteStatus(state) {
      state.createStatus = 'idle';
      state.updateStatus = 'idle';
      state.writeError = null;
    },
    resetAll(state) {
      Object.assign(state, initialState);
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchKAPoOwners.pending, (state) => {
        state.ownersError = null;
        if (state.ownersStatus !== 'succeeded') state.ownersStatus = 'loading';
      })
      .addCase(fetchKAPoOwners.fulfilled, (state, action) => {
        state.ownersStatus = 'succeeded';
        state.owners = action.payload.owners || [];
      })
      .addCase(fetchKAPoOwners.rejected, (state, action) => {
        state.ownersStatus = 'failed';
        state.ownersError = action.error.message || 'Failed to load order owners';
        state.owners = [];
      })
      .addCase(fetchKAPoClients.pending, (state, action) => {
        state.clientsError = null;
        if (action.meta.arg.append) {
          state.clientsLoadingMore = true;
        } else {
          state.clientsFetchId = action.meta.arg.fetchId ?? state.clientsFetchId;
          if (state.clientsStatus !== 'succeeded') state.clientsStatus = 'loading';
        }
      })
      .addCase(fetchKAPoClients.fulfilled, (state, action) => {
        const { append, fetchId } = action.meta.arg;
        if (append) {
          state.clientsLoadingMore = false;
          const seen = new Set(state.clients.map((c) => c.id));
          const rows = (action.payload.clients || []).filter((c) => !seen.has(c.id));
          state.clients = [...state.clients, ...rows];
        } else if (fetchId === undefined || fetchId === state.clientsFetchId) {
          state.clientsStatus = 'succeeded';
          state.clients = action.payload.clients || [];
        }
        state.clientsHasMore = Boolean(action.payload.hasMore);
      })
      .addCase(fetchKAPoClients.rejected, (state, action) => {
        const { append, fetchId } = action.meta.arg;
        if (append) {
          state.clientsLoadingMore = false;
          return;
        }
        if (fetchId !== undefined && fetchId !== state.clientsFetchId) return;
        state.clientsStatus = 'failed';
        state.clientsError = action.error.message || 'Failed to load clients';
        state.clients = [];
        state.clientsHasMore = false;
      })
      .addCase(fetchKAPoShops.pending, (state) => {
        state.shopsError = null;
        if (state.shopsStatus !== 'succeeded') state.shopsStatus = 'loading';
      })
      .addCase(fetchKAPoShops.fulfilled, (state, action) => {
        state.shopsStatus = 'succeeded';
        state.shops = action.payload.shops || [];
      })
      .addCase(fetchKAPoShops.rejected, (state, action) => {
        state.shopsStatus = 'failed';
        state.shopsError = action.error.message || 'Failed to load shops';
      })
      .addCase(fetchKAPoAddresses.pending, (state) => {
        state.addressesError = null;
        if (state.addressesStatus !== 'succeeded') state.addressesStatus = 'loading';
      })
      .addCase(fetchKAPoAddresses.fulfilled, (state, action) => {
        state.addressesStatus = 'succeeded';
        state.addresses = action.payload.addresses || [];
      })
      .addCase(fetchKAPoAddresses.rejected, (state, action) => {
        state.addressesStatus = 'failed';
        state.addressesError = action.error.message || 'Failed to load addresses';
      })
      .addCase(fetchKAPoWarehouses.pending, (state) => {
        state.warehousesError = null;
        if (state.warehousesStatus !== 'succeeded') state.warehousesStatus = 'loading';
      })
      .addCase(fetchKAPoWarehouses.fulfilled, (state, action) => {
        state.warehousesStatus = 'succeeded';
        state.linkedWarehouseCompanyId = action.payload.linkedWarehouseCompanyId ?? null;
        state.warehouses = (action.payload.warehouses || []).map((w) => ({
          ...w,
          is_main: !!w.is_main,
        }));
        state.brands = action.payload.brands || [];
        state.variants = action.payload.variants || [];
      })
      .addCase(fetchKAPoWarehouses.rejected, (state, action) => {
        state.warehousesStatus = 'failed';
        state.warehousesError = action.error.message || 'Failed to load warehouses';
      })
      .addCase(fetchKAPoStock.pending, (state) => {
        state.stockError = null;
        if (state.stockStatus !== 'succeeded') state.stockStatus = 'loading';
      })
      .addCase(fetchKAPoStock.fulfilled, (state, action) => {
        state.stockStatus = 'succeeded';
        state.stockMap = action.payload.stockMap || {};
        state.onHandMap = action.payload.onHandMap || {};
        state.reservedMap = action.payload.reservedMap || {};
      })
      .addCase(fetchKAPoStock.rejected, (state, action) => {
        state.stockStatus = 'failed';
        state.stockError = action.error.message || 'Failed to load warehouse stock';
        state.stockMap = {};
        state.onHandMap = {};
        state.reservedMap = {};
      })
      .addCase(fetchKAExistingPo.pending, (state) => {
        state.existingPoError = null;
        if (state.existingPoStatus !== 'succeeded') state.existingPoStatus = 'loading';
      })
      .addCase(fetchKAExistingPo.fulfilled, (state, action) => {
        state.existingPoStatus = 'succeeded';
        state.existingPo = action.payload.po || null;
        state.existingItems = action.payload.items || [];
        state.existingPayments = action.payload.payments || [];
      })
      .addCase(fetchKAExistingPo.rejected, (state, action) => {
        state.existingPoStatus = 'failed';
        state.existingPoError = action.error.message || 'Failed to load purchase order';
      })
      .addCase(createKAPurchaseOrder.pending, (state) => {
        state.writeError = null;
        state.createStatus = 'loading';
      })
      .addCase(createKAPurchaseOrder.fulfilled, (state) => {
        state.createStatus = 'succeeded';
      })
      .addCase(createKAPurchaseOrder.rejected, (state, action) => {
        state.createStatus = 'failed';
        state.writeError = action.error.message || 'Failed to create purchase order';
      })
      .addCase(updateKAPurchaseOrder.pending, (state) => {
        state.writeError = null;
        state.updateStatus = 'loading';
      })
      .addCase(updateKAPurchaseOrder.fulfilled, (state) => {
        state.updateStatus = 'succeeded';
      })
      .addCase(updateKAPurchaseOrder.rejected, (state, action) => {
        state.updateStatus = 'failed';
        state.writeError = action.error.message || 'Failed to update purchase order';
      })
      .addCase(fetchKAPoList.pending, (state) => {
        state.listError = null;
        if (state.listStatus !== 'succeeded') state.listStatus = 'loading';
      })
      .addCase(fetchKAPoList.fulfilled, (state, action) => {
        state.listStatus = 'succeeded';
        state.listRows = action.payload.rows || [];
      })
      .addCase(fetchKAPoList.rejected, (state, action) => {
        state.listStatus = 'failed';
        state.listError = action.error.message || 'Failed to load purchase orders';
      })
      .addCase(fetchKADirectorKamIds.fulfilled, (state, action) => {
        state.directorKamIdsStatus = 'succeeded';
        state.directorKamIds = action.payload.kamIds || [];
      })
      .addCase(fetchKAWarehouseLocationNames.fulfilled, (state, action) => {
        state.warehouseLocationNamesStatus = 'succeeded';
        state.warehouseLocationNames = action.payload.namesById || {};
      });
  },
});

export const {
  resetClients,
  setClientsList,
  resetShops,
  resetAddresses,
  resetStock,
  resetExistingPo,
  resetWriteStatus,
  resetAll: resetKAPurchaseOrder,
} = kaPurchaseOrderSlice.actions;

export const kaPurchaseOrderReducer = kaPurchaseOrderSlice.reducer;
