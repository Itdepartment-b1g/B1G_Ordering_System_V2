import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { warehouseRequest } from './api';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type InventoryBatchSourceType =
  | 'opening_balance'
  | 'stock_request_receive'
  | 'adjustment_in';

export type LotReceivePacking = {
  box_count: number | null;
  units_per_box: number | null;
  loose_box_count?: number | null;
  loose_qty?: number | null;
  extra_qty?: number | null;
  quantity?: number | null;
  label: string | null;
};

export type BatchInventoryLotLine = {
  lotId: string;
  batchId: string;
  variantId: string;
  variantName: string;
  variantType: string | null;
  expirationDate: string | null;
  quantity: number;
  packing?: LotReceivePacking | null;
};

export type BatchInventoryBrandGroup = {
  brandId: string;
  brandName: string;
  lots: BatchInventoryLotLine[];
};

export type BatchInventoryGroup = {
  batchId: string;
  batchNumber: string;
  receivedAt: string;
  sourceType: InventoryBatchSourceType;
  totalAmount: number;
  locationId: string;
  locationName: string;
  skuCount: number;
  totalUnits: number;
  brands: BatchInventoryBrandGroup[];
};

export type WarehouseLocationOption = {
  id: string;
  name: string;
  is_main: boolean;
};

type WarehouseBatchViewState = {
  groups: BatchInventoryGroup[];
  locationId: string | null;
  locations: WarehouseLocationOption[];
  status: QueryStatus;
  locationsStatus: QueryStatus;
  error: string | null;
  locationsError: string | null;
};

const initialState: WarehouseBatchViewState = {
  groups: [],
  locationId: null,
  locations: [],
  status: 'idle',
  locationsStatus: 'idle',
  error: null,
  locationsError: null,
};

export const fetchWarehouseBatchInventory = createAsyncThunk(
  'warehouseBatchView/fetchInventory',
  (locationId: string) =>
    warehouseRequest<{ groups: BatchInventoryGroup[] }>('batch-view', {
      params: { resource: 'inventory', locationId },
    })
);

export const fetchWarehouseBatchViewLocations = createAsyncThunk(
  'warehouseBatchView/fetchLocations',
  () =>
    warehouseRequest<{ locations: WarehouseLocationOption[] }>('batch-view', {
      params: { resource: 'locations' },
    })
);

const warehouseBatchViewSlice = createSlice({
  name: 'warehouseBatchView',
  initialState,
  reducers: {
    resetWarehouseBatchView(state) {
      Object.assign(state, initialState);
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchWarehouseBatchInventory.pending, (state, action) => {
        state.error = null;
        if (state.locationId !== action.meta.arg) {
          state.groups = [];
          state.locationId = action.meta.arg;
        }
        state.status = 'loading';
      })
      .addCase(fetchWarehouseBatchInventory.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.groups = action.payload.groups;
        state.locationId = action.meta.arg;
      })
      .addCase(fetchWarehouseBatchInventory.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load batch inventory';
        state.groups = [];
      })
      .addCase(fetchWarehouseBatchViewLocations.pending, (state) => {
        state.locationsError = null;
        if (state.locationsStatus !== 'succeeded') state.locationsStatus = 'loading';
      })
      .addCase(fetchWarehouseBatchViewLocations.fulfilled, (state, action) => {
        state.locationsStatus = 'succeeded';
        state.locations = action.payload.locations;
      })
      .addCase(fetchWarehouseBatchViewLocations.rejected, (state, action) => {
        state.locationsStatus = 'failed';
        state.locationsError = action.error.message || 'Failed to load locations';
        state.locations = [];
      });
  },
});

export const { resetWarehouseBatchView } = warehouseBatchViewSlice.actions;
export const warehouseBatchViewReducer = warehouseBatchViewSlice.reducer;
