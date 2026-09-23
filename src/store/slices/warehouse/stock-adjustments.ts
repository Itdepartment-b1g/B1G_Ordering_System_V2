import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { warehouseRequest } from './api';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type WarehouseStockAdjustmentRow = {
  id: string;
  direction: 'in' | 'out';
  quantity: number;
  reason: string;
  notes: string | null;
  created_at: string;
  warehouse_location: { name: string; is_main: boolean } | null;
  variant: {
    name: string;
    variant_type: string;
    brand: { id: string; name: string } | null;
  } | null;
  batch: { batch_number: string } | null;
  performed_by_user: { full_name: string } | null;
};

export type BrandOption = { id: string; name: string };
export type VariantOption = { id: string; name: string; variant_type: string; brand_id: string };
export type LocationOption = { id: string; name: string; is_main: boolean };

export type BatchLotOption = {
  lot_id: string;
  batch_id: string;
  batch_number: string;
  source_type: string;
  quantity_remaining: number;
  quantity_received: number;
  received_at: string;
  expiration_date: string | null;
};

type RpcResult = {
  success?: boolean;
  error?: string;
  batch_number?: string;
  direction?: string;
  quantity?: number;
  remaining_after?: number;
};

type WarehouseStockAdjustmentsState = {
  adjustments: WarehouseStockAdjustmentRow[];
  locations: LocationOption[];
  brands: BrandOption[];
  variants: VariantOption[];
  batchLots: BatchLotOption[];
  variantsBrandId: string | null;
  batchLotsKey: string | null;
  status: QueryStatus;
  locationsStatus: QueryStatus;
  brandsStatus: QueryStatus;
  variantsStatus: QueryStatus;
  batchLotsStatus: QueryStatus;
  mutationStatus: QueryStatus;
  error: string | null;
  locationsError: string | null;
  brandsError: string | null;
  variantsError: string | null;
  batchLotsError: string | null;
  mutationError: string | null;
};

const initialState: WarehouseStockAdjustmentsState = {
  adjustments: [],
  locations: [],
  brands: [],
  variants: [],
  batchLots: [],
  variantsBrandId: null,
  batchLotsKey: null,
  status: 'idle',
  locationsStatus: 'idle',
  brandsStatus: 'idle',
  variantsStatus: 'idle',
  batchLotsStatus: 'idle',
  mutationStatus: 'idle',
  error: null,
  locationsError: null,
  brandsError: null,
  variantsError: null,
  batchLotsError: null,
  mutationError: null,
};

export const fetchWarehouseStockAdjustments = createAsyncThunk(
  'warehouseStockAdjustments/fetch',
  () =>
    warehouseRequest<{ adjustments: WarehouseStockAdjustmentRow[] }>('stock-adjustments', {
      params: { resource: 'list' },
    })
);

export const fetchWarehouseStockAdjustmentLocations = createAsyncThunk(
  'warehouseStockAdjustments/fetchLocations',
  () =>
    warehouseRequest<{ locations: LocationOption[] }>('stock-adjustments', {
      params: { resource: 'locations' },
    })
);

export const fetchWarehouseStockAdjustmentBrands = createAsyncThunk(
  'warehouseStockAdjustments/fetchBrands',
  () =>
    warehouseRequest<{ brands: BrandOption[] }>('stock-adjustments', {
      params: { resource: 'brands' },
    })
);

export const fetchWarehouseStockAdjustmentVariants = createAsyncThunk(
  'warehouseStockAdjustments/fetchVariants',
  (brandId: string) =>
    warehouseRequest<{ variants: VariantOption[] }>('stock-adjustments', {
      params: { resource: 'variants', brandId },
    })
);

export const fetchWarehouseStockAdjustmentBatchLots = createAsyncThunk(
  'warehouseStockAdjustments/fetchBatchLots',
  (args: { locationId: string; variantId: string }) =>
    warehouseRequest<{ lots: BatchLotOption[] }>('stock-adjustments', {
      params: {
        resource: 'batch-lots',
        locationId: args.locationId,
        variantId: args.variantId,
      },
    })
);

export const applyWarehouseStockAdjustment = createAsyncThunk(
  'warehouseStockAdjustments/apply',
  (payload: {
    warehouse_location_id: string;
    variant_id: string;
    quantity_delta: number;
    reason: string;
    notes?: string | null;
    lot_id?: string | null;
  }) =>
    warehouseRequest<RpcResult>('stock-adjustments', {
      method: 'POST',
      body: payload,
    })
);

const warehouseStockAdjustmentsSlice = createSlice({
  name: 'warehouseStockAdjustments',
  initialState,
  reducers: {
    resetWarehouseStockAdjustments(state) {
      Object.assign(state, initialState);
    },
    clearWarehouseStockAdjustmentVariants(state) {
      state.variants = [];
      state.variantsBrandId = null;
      state.variantsStatus = 'idle';
      state.variantsError = null;
    },
    clearWarehouseStockAdjustmentBatchLots(state) {
      state.batchLots = [];
      state.batchLotsKey = null;
      state.batchLotsStatus = 'idle';
      state.batchLotsError = null;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchWarehouseStockAdjustments.pending, (state) => {
        state.error = null;
        if (state.status !== 'succeeded') state.status = 'loading';
      })
      .addCase(fetchWarehouseStockAdjustments.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.adjustments = action.payload.adjustments;
      })
      .addCase(fetchWarehouseStockAdjustments.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load stock adjustments';
        state.adjustments = [];
      })
      .addCase(fetchWarehouseStockAdjustmentLocations.pending, (state) => {
        state.locationsError = null;
        if (state.locationsStatus !== 'succeeded') state.locationsStatus = 'loading';
      })
      .addCase(fetchWarehouseStockAdjustmentLocations.fulfilled, (state, action) => {
        state.locationsStatus = 'succeeded';
        state.locations = action.payload.locations;
      })
      .addCase(fetchWarehouseStockAdjustmentLocations.rejected, (state, action) => {
        state.locationsStatus = 'failed';
        state.locationsError = action.error.message || 'Failed to load locations';
        state.locations = [];
      })
      .addCase(fetchWarehouseStockAdjustmentBrands.pending, (state) => {
        state.brandsError = null;
        if (state.brandsStatus !== 'succeeded') state.brandsStatus = 'loading';
      })
      .addCase(fetchWarehouseStockAdjustmentBrands.fulfilled, (state, action) => {
        state.brandsStatus = 'succeeded';
        state.brands = action.payload.brands;
      })
      .addCase(fetchWarehouseStockAdjustmentBrands.rejected, (state, action) => {
        state.brandsStatus = 'failed';
        state.brandsError = action.error.message || 'Failed to load brands';
        state.brands = [];
      })
      .addCase(fetchWarehouseStockAdjustmentVariants.pending, (state, action) => {
        state.variantsError = null;
        state.variantsBrandId = action.meta.arg;
        if (state.variantsStatus !== 'succeeded') state.variantsStatus = 'loading';
      })
      .addCase(fetchWarehouseStockAdjustmentVariants.fulfilled, (state, action) => {
        state.variantsStatus = 'succeeded';
        state.variants = action.payload.variants;
        state.variantsBrandId = action.meta.arg;
      })
      .addCase(fetchWarehouseStockAdjustmentVariants.rejected, (state, action) => {
        state.variantsStatus = 'failed';
        state.variantsError = action.error.message || 'Failed to load variants';
        state.variants = [];
      })
      .addCase(fetchWarehouseStockAdjustmentBatchLots.pending, (state, action) => {
        state.batchLotsError = null;
        state.batchLotsKey = `${action.meta.arg.locationId}:${action.meta.arg.variantId}`;
        if (state.batchLotsStatus !== 'succeeded') state.batchLotsStatus = 'loading';
      })
      .addCase(fetchWarehouseStockAdjustmentBatchLots.fulfilled, (state, action) => {
        state.batchLotsStatus = 'succeeded';
        state.batchLots = action.payload.lots;
        state.batchLotsKey = `${action.meta.arg.locationId}:${action.meta.arg.variantId}`;
      })
      .addCase(fetchWarehouseStockAdjustmentBatchLots.rejected, (state, action) => {
        state.batchLotsStatus = 'failed';
        state.batchLotsError = action.error.message || 'Failed to load batch lots';
        state.batchLots = [];
      })
      .addCase(applyWarehouseStockAdjustment.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(applyWarehouseStockAdjustment.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(applyWarehouseStockAdjustment.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Adjustment failed';
      });
  },
});

export const {
  resetWarehouseStockAdjustments,
  clearWarehouseStockAdjustmentVariants,
  clearWarehouseStockAdjustmentBatchLots,
} = warehouseStockAdjustmentsSlice.actions;
export const warehouseStockAdjustmentsReducer = warehouseStockAdjustmentsSlice.reducer;
