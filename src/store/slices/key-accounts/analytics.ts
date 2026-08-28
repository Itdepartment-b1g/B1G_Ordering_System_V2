import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { supabase } from '@/lib/supabase';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type KAAnalyticsPaidBrandRow = {
  brandId: string;
  brandName: string;
  billed: number;
  paid: number;
  discount: number;
  remaining: number;
  quantity: number;
  orderCount: number;
  status: 'unpaid' | 'partial' | 'paid';
};

export type KAAnalyticsPaidVariantRow = {
  brandId: string;
  brandName: string;
  variantId: string;
  variantName: string;
  billed: number;
  paid: number;
  discount: number;
  remaining: number;
  quantity: number;
  orderCount: number;
};

export type KAProductPaidByBrandResult = {
  brands: KAAnalyticsPaidBrandRow[];
  variants: KAAnalyticsPaidVariantRow[];
  unallocatedPaid: number;
  unallocatedDiscount: number;
  poCount: number;
};

export type KAAnalyticsDataset = {
  orders: Record<string, unknown>[];
  items: Record<string, unknown>[];
  people: Record<string, unknown>[];
  clients: Record<string, unknown>[];
  payments: Array<{
    purchase_order_id: string;
    amount: number | null;
    settlement_discount: number | null;
    created_at: string;
  }>;
  paidByOrderId: Record<string, number>;
  rebates: Record<string, unknown>[];
  transferReservations: Array<{
    purchase_order_id: string;
    warehouse_location_id: string;
    variant_id: string;
    quantity_reserved: number;
    quantity_fulfilled: number;
  }>;
  transferLocationStatuses: Array<{
    purchase_order_id: string;
    warehouse_location_id: string;
    status: string;
  }>;
};

export type KAFsnLocation = {
  id: string;
  name: string;
  is_main: boolean;
};

export type KAFsnCatalogBrand = {
  id: string;
  name: string;
  allVariants: Array<{
    id: string;
    name: string;
    variantType: string;
    stock: number;
    allocatedStock: number;
    price: number;
    status: 'in-stock' | 'out-of-stock';
  }>;
};

type KAAnalyticsState = {
  dataset: KAAnalyticsDataset | null;
  datasetStatus: QueryStatus;
  datasetError: string | null;

  paidByBrand: KAProductPaidByBrandResult;
  paidByBrandDateStart: string | null;
  paidByBrandDateEnd: string | null;
  paidByBrandStatus: QueryStatus;
  paidByBrandError: string | null;

  clientBrandCollections: KAProductPaidByBrandResult;
  clientBrandCollectionsClientId: string | null;
  clientBrandCollectionsStatus: QueryStatus;
  clientBrandCollectionsError: string | null;

  fsnHubCompanyId: string | null;
  fsnLocations: KAFsnLocation[];
  fsnSetupStatus: QueryStatus;
  fsnSetupError: string | null;
  fsnCatalog: KAFsnCatalogBrand[];
  fsnCatalogLocationId: string | null;
  fsnCatalogStatus: QueryStatus;
  fsnCatalogError: string | null;
};

const emptyPaidByBrand: KAProductPaidByBrandResult = {
  brands: [],
  variants: [],
  unallocatedPaid: 0,
  unallocatedDiscount: 0,
  poCount: 0,
};

const initialState: KAAnalyticsState = {
  dataset: null,
  datasetStatus: 'idle',
  datasetError: null,

  paidByBrand: emptyPaidByBrand,
  paidByBrandDateStart: null,
  paidByBrandDateEnd: null,
  paidByBrandStatus: 'idle',
  paidByBrandError: null,

  clientBrandCollections: emptyPaidByBrand,
  clientBrandCollectionsClientId: null,
  clientBrandCollectionsStatus: 'idle',
  clientBrandCollectionsError: null,

  fsnHubCompanyId: null,
  fsnLocations: [],
  fsnSetupStatus: 'idle',
  fsnSetupError: null,
  fsnCatalog: [],
  fsnCatalogLocationId: null,
  fsnCatalogStatus: 'idle',
  fsnCatalogError: null,
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

export const fetchKAProductPaidByBrand = createAsyncThunk(
  'kaAnalytics/fetchProductPaidByBrand',
  (args: { dateStart?: string; dateEnd?: string }) =>
    kaRequest<KAProductPaidByBrandResult>('analytics', {
      params: {
        resource: 'product-paid-by-brand',
        dateStart: args.dateStart,
        dateEnd: args.dateEnd,
      },
    })
);

export const fetchKAClientBrandCollections = createAsyncThunk(
  'kaAnalytics/fetchClientBrandCollections',
  (args: { clientId: string; dateStart?: string; dateEnd?: string }) =>
    kaRequest<KAProductPaidByBrandResult>('analytics', {
      params: {
        resource: 'product-paid-by-brand',
        clientId: args.clientId,
        dateStart: args.dateStart,
        dateEnd: args.dateEnd,
      },
    })
);

export const fetchKAAnalyticsDataset = createAsyncThunk('kaAnalytics/fetchDataset', () =>
  kaRequest<KAAnalyticsDataset>('analytics', { params: { resource: 'dataset' } })
);

export const fetchKAFsnSetup = createAsyncThunk('kaAnalytics/fetchFsnSetup', () =>
  kaRequest<{ hubCompanyId: string | null; locations: KAFsnLocation[] }>('analytics', {
    params: { resource: 'fsn-setup' },
  })
);

export const fetchKAFsnCatalog = createAsyncThunk(
  'kaAnalytics/fetchFsnCatalog',
  (locationId: string) =>
    kaRequest<{ brands: KAFsnCatalogBrand[] }>('analytics', {
      params: { resource: 'fsn-catalog', locationId },
    })
);

export const fetchKAAnalyticsPoPaymentHistory = createAsyncThunk(
  'kaAnalytics/fetchPoPaymentHistory',
  (poId: string) =>
    kaRequest<{
      payments: Array<{
        id: string;
        amount: number | null;
        settlement_discount: number | null;
        created_at: string;
        payment_method: string | null;
        bank_type: string | null;
        recorder: unknown;
      }>;
      paid: number;
      discount: number;
      cashEntries: number;
    }>('analytics', { params: { resource: 'po-payment-history', poId } })
);

export const fetchKAAnalyticsRebateSource = createAsyncThunk(
  'kaAnalytics/fetchRebateSource',
  (rebateId: string) =>
    kaRequest<{ rebateNumber: string | null; sourcePoNumber: string | null }>('analytics', {
      params: { resource: 'rebate-source', rebateId },
    })
);

const kaAnalyticsSlice = createSlice({
  name: 'kaAnalytics',
  initialState,
  reducers: {
    resetKAAnalytics() {
      return initialState;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchKAAnalyticsDataset.pending, (state) => {
        state.datasetStatus = 'loading';
        state.datasetError = null;
      })
      .addCase(fetchKAAnalyticsDataset.fulfilled, (state, action) => {
        state.datasetStatus = 'succeeded';
        state.dataset = action.payload;
      })
      .addCase(fetchKAAnalyticsDataset.rejected, (state, action) => {
        state.datasetStatus = 'failed';
        state.datasetError = action.error.message || 'Failed to load analytics';
        state.dataset = null;
      })
      .addCase(fetchKAProductPaidByBrand.pending, (state, action) => {
        state.paidByBrandStatus = 'loading';
        state.paidByBrandError = null;
        state.paidByBrandDateStart = action.meta.arg.dateStart || null;
        state.paidByBrandDateEnd = action.meta.arg.dateEnd || null;
      })
      .addCase(fetchKAProductPaidByBrand.fulfilled, (state, action) => {
        state.paidByBrandStatus = 'succeeded';
        state.paidByBrand = action.payload;
      })
      .addCase(fetchKAProductPaidByBrand.rejected, (state, action) => {
        state.paidByBrandStatus = 'failed';
        state.paidByBrandError = action.error.message || 'Failed to load paid-by-brand analytics';
        state.paidByBrand = emptyPaidByBrand;
      })
      .addCase(fetchKAClientBrandCollections.pending, (state, action) => {
        state.clientBrandCollectionsStatus = 'loading';
        state.clientBrandCollectionsError = null;
        state.clientBrandCollectionsClientId = action.meta.arg.clientId;
      })
      .addCase(fetchKAClientBrandCollections.fulfilled, (state, action) => {
        state.clientBrandCollectionsStatus = 'succeeded';
        state.clientBrandCollections = action.payload;
      })
      .addCase(fetchKAClientBrandCollections.rejected, (state, action) => {
        state.clientBrandCollectionsStatus = 'failed';
        state.clientBrandCollectionsError =
          action.error.message || 'Failed to load client brand collections';
        state.clientBrandCollections = emptyPaidByBrand;
      })
      .addCase(fetchKAFsnSetup.pending, (state) => {
        state.fsnSetupStatus = 'loading';
        state.fsnSetupError = null;
      })
      .addCase(fetchKAFsnSetup.fulfilled, (state, action) => {
        state.fsnSetupStatus = 'succeeded';
        state.fsnHubCompanyId = action.payload.hubCompanyId;
        state.fsnLocations = action.payload.locations;
      })
      .addCase(fetchKAFsnSetup.rejected, (state, action) => {
        state.fsnSetupStatus = 'failed';
        state.fsnSetupError = action.error.message || 'Failed to load FSN setup';
        state.fsnHubCompanyId = null;
        state.fsnLocations = [];
      })
      .addCase(fetchKAFsnCatalog.pending, (state, action) => {
        state.fsnCatalogStatus = 'loading';
        state.fsnCatalogError = null;
        state.fsnCatalogLocationId = action.meta.arg;
      })
      .addCase(fetchKAFsnCatalog.fulfilled, (state, action) => {
        state.fsnCatalogStatus = 'succeeded';
        state.fsnCatalog = action.payload.brands;
      })
      .addCase(fetchKAFsnCatalog.rejected, (state, action) => {
        state.fsnCatalogStatus = 'failed';
        state.fsnCatalogError = action.error.message || 'Failed to load FSN catalog';
        state.fsnCatalog = [];
      });
  },
});

export const { resetKAAnalytics } = kaAnalyticsSlice.actions;
export const kaAnalyticsReducer = kaAnalyticsSlice.reducer;
