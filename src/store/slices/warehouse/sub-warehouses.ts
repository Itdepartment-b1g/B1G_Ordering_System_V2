import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { warehouseRequest } from './api';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type SubWarehouseLocationRow = {
  id: string;
  name: string;
  is_main: boolean;
  created_at: string | null;
};

export type SubWarehouseLocationUserRow = {
  location_id: string;
  user_id: string;
  profile: { full_name: string | null; email: string | null } | null;
};

export type MyWarehouseLocationDto = {
  location_id: string;
  warehouse_locations: { id: string; name: string; is_main: boolean };
} | null;

export type ReturnLotRow = {
  lot_id: string;
  variant_id: string;
  brandName: string;
  variantName: string;
  variantType: string;
  batch_number: string;
  expiration_date: string | null;
  quantity_remaining: number;
  received_at: string;
};

type RpcResult = {
  success?: boolean;
  error?: string;
  request_number?: string;
};

type WarehouseSubWarehousesState = {
  locations: SubWarehouseLocationRow[];
  locationUsers: SubWarehouseLocationUserRow[];
  myLocation: MyWarehouseLocationDto;
  poReservedByVariantId: Record<string, number>;
  poReservedLocationId: string | null;
  returnLots: ReturnLotRow[];
  returnLotsLocationId: string | null;
  status: QueryStatus;
  locationUsersStatus: QueryStatus;
  myLocationStatus: QueryStatus;
  poReservedStatus: QueryStatus;
  returnLotsStatus: QueryStatus;
  mutationStatus: QueryStatus;
  error: string | null;
  locationUsersError: string | null;
  myLocationError: string | null;
  poReservedError: string | null;
  returnLotsError: string | null;
  mutationError: string | null;
};

const initialState: WarehouseSubWarehousesState = {
  locations: [],
  locationUsers: [],
  myLocation: null,
  poReservedByVariantId: {},
  poReservedLocationId: null,
  returnLots: [],
  returnLotsLocationId: null,
  status: 'idle',
  locationUsersStatus: 'idle',
  myLocationStatus: 'idle',
  poReservedStatus: 'idle',
  returnLotsStatus: 'idle',
  mutationStatus: 'idle',
  error: null,
  locationUsersError: null,
  myLocationError: null,
  poReservedError: null,
  returnLotsError: null,
  mutationError: null,
};

export const fetchSubWarehouseLocations = createAsyncThunk(
  'warehouseSubWarehouses/fetchLocations',
  () =>
    warehouseRequest<{ locations: SubWarehouseLocationRow[] }>('sub-warehouses', {
      params: { resource: 'list' },
    })
);

export const fetchSubWarehouseLocationUsers = createAsyncThunk(
  'warehouseSubWarehouses/fetchLocationUsers',
  () =>
    warehouseRequest<{ locationUsers: SubWarehouseLocationUserRow[] }>('sub-warehouses', {
      params: { resource: 'location-users' },
    })
);

export const fetchMyWarehouseLocation = createAsyncThunk(
  'warehouseSubWarehouses/fetchMyLocation',
  () =>
    warehouseRequest<{ myLocation: MyWarehouseLocationDto }>('sub-warehouses', {
      params: { resource: 'my-location' },
    })
);

export const fetchSubWarehousePoReserved = createAsyncThunk(
  'warehouseSubWarehouses/fetchPoReserved',
  (locationId: string) =>
    warehouseRequest<{ reservedByVariantId: Record<string, number> }>('sub-warehouses', {
      params: { resource: 'po-reserved', locationId },
    })
);

export const fetchSubWarehouseReturnLots = createAsyncThunk(
  'warehouseSubWarehouses/fetchReturnLots',
  (locationId: string) =>
    warehouseRequest<{ lots: ReturnLotRow[] }>('sub-warehouses', {
      params: { resource: 'return-lots', locationId },
    })
);

export const createSubWarehouse = createAsyncThunk(
  'warehouseSubWarehouses/create',
  (payload: {
    location_name: string;
    full_name: string;
    email: string;
    password: string;
    phone?: string | null;
  }) =>
    warehouseRequest<RpcResult>('sub-warehouses', {
      method: 'POST',
      body: { action: 'create', ...payload },
    })
);

export const allocateToSubWarehouse = createAsyncThunk(
  'warehouseSubWarehouses/allocate',
  (payload: {
    location_id: string;
    items: Array<{ variant_id: string; quantity: number }>;
    notes?: string | null;
  }) =>
    warehouseRequest<RpcResult>('sub-warehouses', {
      method: 'POST',
      body: { action: 'allocate', ...payload },
    })
);

export const createSubWarehouseStockReturn = createAsyncThunk(
  'warehouseSubWarehouses/return',
  (payload: {
    from_location_id: string;
    items: Array<{ lot_id: string; quantity: number }>;
    notes?: string | null;
  }) =>
    warehouseRequest<RpcResult>('sub-warehouses', {
      method: 'POST',
      body: { action: 'return', ...payload },
    })
);

const warehouseSubWarehousesSlice = createSlice({
  name: 'warehouseSubWarehouses',
  initialState,
  reducers: {
    resetWarehouseSubWarehouses(state) {
      Object.assign(state, initialState);
    },
    clearSubWarehouseReturnLots(state) {
      state.returnLots = [];
      state.returnLotsLocationId = null;
      state.returnLotsStatus = 'idle';
      state.returnLotsError = null;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchSubWarehouseLocations.pending, (state) => {
        state.error = null;
        if (state.status !== 'succeeded') state.status = 'loading';
      })
      .addCase(fetchSubWarehouseLocations.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.locations = action.payload.locations;
      })
      .addCase(fetchSubWarehouseLocations.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load locations';
        state.locations = [];
      })
      .addCase(fetchSubWarehouseLocationUsers.pending, (state) => {
        state.locationUsersError = null;
        if (state.locationUsersStatus !== 'succeeded') state.locationUsersStatus = 'loading';
      })
      .addCase(fetchSubWarehouseLocationUsers.fulfilled, (state, action) => {
        state.locationUsersStatus = 'succeeded';
        state.locationUsers = action.payload.locationUsers;
      })
      .addCase(fetchSubWarehouseLocationUsers.rejected, (state, action) => {
        state.locationUsersStatus = 'failed';
        state.locationUsersError = action.error.message || 'Failed to load location users';
        state.locationUsers = [];
      })
      .addCase(fetchMyWarehouseLocation.pending, (state) => {
        state.myLocationError = null;
        if (state.myLocationStatus !== 'succeeded') state.myLocationStatus = 'loading';
      })
      .addCase(fetchMyWarehouseLocation.fulfilled, (state, action) => {
        state.myLocationStatus = 'succeeded';
        state.myLocation = action.payload.myLocation;
      })
      .addCase(fetchMyWarehouseLocation.rejected, (state, action) => {
        state.myLocationStatus = 'failed';
        state.myLocationError = action.error.message || 'Failed to load my location';
        state.myLocation = null;
      })
      .addCase(fetchSubWarehousePoReserved.pending, (state, action) => {
        state.poReservedError = null;
        state.poReservedLocationId = action.meta.arg;
        if (state.poReservedStatus !== 'succeeded') state.poReservedStatus = 'loading';
      })
      .addCase(fetchSubWarehousePoReserved.fulfilled, (state, action) => {
        state.poReservedStatus = 'succeeded';
        state.poReservedByVariantId = action.payload.reservedByVariantId;
        state.poReservedLocationId = action.meta.arg;
      })
      .addCase(fetchSubWarehousePoReserved.rejected, (state, action) => {
        state.poReservedStatus = 'failed';
        state.poReservedError = action.error.message || 'Failed to load PO reserved qty';
        state.poReservedByVariantId = {};
      })
      .addCase(fetchSubWarehouseReturnLots.pending, (state, action) => {
        state.returnLotsError = null;
        state.returnLotsLocationId = action.meta.arg;
        if (state.returnLotsStatus !== 'succeeded') state.returnLotsStatus = 'loading';
      })
      .addCase(fetchSubWarehouseReturnLots.fulfilled, (state, action) => {
        state.returnLotsStatus = 'succeeded';
        state.returnLots = action.payload.lots;
        state.returnLotsLocationId = action.meta.arg;
      })
      .addCase(fetchSubWarehouseReturnLots.rejected, (state, action) => {
        state.returnLotsStatus = 'failed';
        state.returnLotsError = action.error.message || 'Failed to load return lots';
        state.returnLots = [];
      })
      .addCase(createSubWarehouse.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(allocateToSubWarehouse.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(createSubWarehouseStockReturn.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(createSubWarehouse.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(allocateToSubWarehouse.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(createSubWarehouseStockReturn.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(createSubWarehouse.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Failed to create sub-warehouse';
      })
      .addCase(allocateToSubWarehouse.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Failed to allocate stock';
      })
      .addCase(createSubWarehouseStockReturn.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Failed to return stock';
      });
  },
});

export const { resetWarehouseSubWarehouses, clearSubWarehouseReturnLots } =
  warehouseSubWarehousesSlice.actions;
export const warehouseSubWarehousesReducer = warehouseSubWarehousesSlice.reducer;
