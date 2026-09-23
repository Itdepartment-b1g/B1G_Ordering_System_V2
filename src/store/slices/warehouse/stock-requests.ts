import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { warehouseRequest } from './api';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type WarehouseStockRequestStatus =
  | 'pending_receive'
  | 'partially_received'
  | 'fully_received'
  | 'cancelled';

export type WarehouseStockRequestRow = {
  id: string;
  request_number: string;
  status: WarehouseStockRequestStatus;
  expected_delivery_date: string | null;
  notes: string | null;
  created_at: string;
  brand: { id: string; name: string } | null;
  created_by_user: { full_name: string } | null;
  items: Array<{
    id: string;
    variant_id: string;
    ordered_quantity: number;
    received_quantity: number;
    variant: {
      id: string;
      name: string;
      variant_type: string;
      brand: { id: string; name: string } | null;
    } | null;
  }>;
  receives: Array<{
    id: string;
    received_at: string;
    notes: string | null;
    batch: { batch_number: string; total_amount?: number | null } | null;
    received_by_user: { full_name: string } | null;
    lines: Array<{
      id: string;
      variant_id: string;
      quantity: number;
      box_count: number | null;
      units_per_box: number | null;
      loose_box_count: number | null;
      loose_qty: number | null;
      extra_qty: number;
      manufactured_date: string | null;
      expiration_date: string | null;
      unit_cost: number | null;
      variant: {
        id: string;
        name: string;
        brand: { id: string; name: string } | null;
      } | null;
    }>;
  }>;
};

export type BrandOption = { id: string; name: string };

export type CatalogVariant = {
  id: string;
  name: string;
  variant_type: string;
  brand_id: string;
  brand: { id: string; name: string } | { id: string; name: string }[] | null;
};

export type StockRequestItemInput = {
  variant_id: string;
  quantity: number;
};

type RpcResult = {
  success?: boolean;
  error?: string;
  request_number?: string;
  batch_number?: string;
  fully_received?: boolean;
  total_received?: number;
  total_amount?: number;
};

type WarehouseStockRequestsState = {
  requests: WarehouseStockRequestRow[];
  brands: BrandOption[];
  catalog: CatalogVariant[];
  status: QueryStatus;
  brandsStatus: QueryStatus;
  catalogStatus: QueryStatus;
  mutationStatus: QueryStatus;
  error: string | null;
  brandsError: string | null;
  catalogError: string | null;
  mutationError: string | null;
};

const initialState: WarehouseStockRequestsState = {
  requests: [],
  brands: [],
  catalog: [],
  status: 'idle',
  brandsStatus: 'idle',
  catalogStatus: 'idle',
  mutationStatus: 'idle',
  error: null,
  brandsError: null,
  catalogError: null,
  mutationError: null,
};

export const fetchWarehouseStockRequests = createAsyncThunk(
  'warehouseStockRequests/fetch',
  () => warehouseRequest<{ requests: WarehouseStockRequestRow[] }>('stock-requests', {
    params: { resource: 'list' },
  })
);

export const fetchWarehouseStockRequestBrands = createAsyncThunk(
  'warehouseStockRequests/fetchBrands',
  () => warehouseRequest<{ brands: BrandOption[] }>('stock-requests', {
    params: { resource: 'brands' },
  })
);

export const fetchWarehouseStockRequestCatalog = createAsyncThunk(
  'warehouseStockRequests/fetchCatalog',
  () => warehouseRequest<{ variants: CatalogVariant[] }>('stock-requests', {
    params: { resource: 'catalog' },
  })
);

export const createWarehouseStockRequest = createAsyncThunk(
  'warehouseStockRequests/create',
  (payload: {
    brand_id?: string | null;
    items: StockRequestItemInput[];
    notes?: string | null;
    expected_delivery_date?: string | null;
  }) =>
    warehouseRequest<RpcResult>('stock-requests', {
      method: 'POST',
      body: { action: 'create', ...payload },
    })
);

export const updateWarehouseStockRequest = createAsyncThunk(
  'warehouseStockRequests/update',
  (payload: {
    request_id: string;
    items: StockRequestItemInput[];
    notes?: string | null;
    expected_delivery_date?: string | null;
  }) =>
    warehouseRequest<RpcResult>('stock-requests', {
      method: 'PATCH',
      body: payload,
    })
);

export const receiveWarehouseStockRequest = createAsyncThunk(
  'warehouseStockRequests/receive',
  (payload: { request_id: string; items: unknown[]; notes?: string | null }) =>
    warehouseRequest<RpcResult>('stock-requests', {
      method: 'POST',
      body: { action: 'receive', ...payload },
    })
);

export const cancelWarehouseStockRequest = createAsyncThunk(
  'warehouseStockRequests/cancel',
  (payload: { request_id: string; reason?: string | null }) =>
    warehouseRequest<RpcResult>('stock-requests', {
      method: 'POST',
      body: { action: 'cancel', ...payload },
    })
);

const warehouseStockRequestsSlice = createSlice({
  name: 'warehouseStockRequests',
  initialState,
  reducers: {
    resetWarehouseStockRequests(state) {
      Object.assign(state, initialState);
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchWarehouseStockRequests.pending, (state) => {
        state.error = null;
        if (state.status !== 'succeeded') state.status = 'loading';
      })
      .addCase(fetchWarehouseStockRequests.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.requests = action.payload.requests;
      })
      .addCase(fetchWarehouseStockRequests.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load stock requests';
        state.requests = [];
      })
      .addCase(fetchWarehouseStockRequestBrands.pending, (state) => {
        state.brandsError = null;
        if (state.brandsStatus !== 'succeeded') state.brandsStatus = 'loading';
      })
      .addCase(fetchWarehouseStockRequestBrands.fulfilled, (state, action) => {
        state.brandsStatus = 'succeeded';
        state.brands = action.payload.brands;
      })
      .addCase(fetchWarehouseStockRequestBrands.rejected, (state, action) => {
        state.brandsStatus = 'failed';
        state.brandsError = action.error.message || 'Failed to load brands';
        state.brands = [];
      })
      .addCase(fetchWarehouseStockRequestCatalog.pending, (state) => {
        state.catalogError = null;
        if (state.catalogStatus !== 'succeeded') state.catalogStatus = 'loading';
      })
      .addCase(fetchWarehouseStockRequestCatalog.fulfilled, (state, action) => {
        state.catalogStatus = 'succeeded';
        state.catalog = action.payload.variants;
      })
      .addCase(fetchWarehouseStockRequestCatalog.rejected, (state, action) => {
        state.catalogStatus = 'failed';
        state.catalogError = action.error.message || 'Failed to load catalog';
        state.catalog = [];
      })
      .addCase(createWarehouseStockRequest.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(updateWarehouseStockRequest.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(receiveWarehouseStockRequest.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(cancelWarehouseStockRequest.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(createWarehouseStockRequest.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(updateWarehouseStockRequest.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(receiveWarehouseStockRequest.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(cancelWarehouseStockRequest.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(createWarehouseStockRequest.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Failed to create stock request';
      })
      .addCase(updateWarehouseStockRequest.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Failed to update stock request';
      })
      .addCase(receiveWarehouseStockRequest.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Failed to receive stock';
      })
      .addCase(cancelWarehouseStockRequest.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Failed to cancel request';
      });
  },
});

export const { resetWarehouseStockRequests } = warehouseStockRequestsSlice.actions;
export const warehouseStockRequestsReducer = warehouseStockRequestsSlice.reducer;
