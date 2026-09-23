import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { warehouseRequest } from './api';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type WarehouseMembershipStatus = 'main' | 'sub' | 'unlinked';

export type WarehouseMembership = {
  status: WarehouseMembershipStatus;
  isMain: boolean;
  locationId: string | null;
};

export type WarehouseLocationRow = {
  id: string;
  name: string;
  is_main: boolean;
};

type WarehouseLocationsState = {
  membership: WarehouseMembership;
  locations: WarehouseLocationRow[];
  membershipStatus: QueryStatus;
  locationsStatus: QueryStatus;
  membershipError: string | null;
  locationsError: string | null;
};

const initialMembership: WarehouseMembership = {
  status: 'unlinked',
  isMain: true,
  locationId: null,
};

const initialState: WarehouseLocationsState = {
  membership: initialMembership,
  locations: [],
  membershipStatus: 'idle',
  locationsStatus: 'idle',
  membershipError: null,
  locationsError: null,
};

export const fetchWarehouseMembership = createAsyncThunk(
  'warehouseLocations/fetchMembership',
  () => warehouseRequest<{ membership: WarehouseMembership }>('membership')
);

export const fetchWarehouseLocations = createAsyncThunk(
  'warehouseLocations/fetchLocations',
  () => warehouseRequest<{ locations: WarehouseLocationRow[] }>('locations')
);

const warehouseLocationsSlice = createSlice({
  name: 'warehouseLocations',
  initialState,
  reducers: {
    resetWarehouseLocations(state) {
      state.membership = initialMembership;
      state.locations = [];
      state.membershipStatus = 'idle';
      state.locationsStatus = 'idle';
      state.membershipError = null;
      state.locationsError = null;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchWarehouseMembership.pending, (state) => {
        state.membershipError = null;
        if (state.membershipStatus !== 'succeeded') state.membershipStatus = 'loading';
      })
      .addCase(fetchWarehouseMembership.fulfilled, (state, action) => {
        state.membershipStatus = 'succeeded';
        state.membership = action.payload.membership;
      })
      .addCase(fetchWarehouseMembership.rejected, (state, action) => {
        state.membershipStatus = 'failed';
        state.membershipError = action.error.message || 'Failed to load warehouse membership';
        state.membership = initialMembership;
      })
      .addCase(fetchWarehouseLocations.pending, (state) => {
        state.locationsError = null;
        if (state.locationsStatus !== 'succeeded') state.locationsStatus = 'loading';
      })
      .addCase(fetchWarehouseLocations.fulfilled, (state, action) => {
        state.locationsStatus = 'succeeded';
        state.locations = action.payload.locations;
      })
      .addCase(fetchWarehouseLocations.rejected, (state, action) => {
        state.locationsStatus = 'failed';
        state.locationsError = action.error.message || 'Failed to load warehouse locations';
        state.locations = [];
      });
  },
});

export const { resetWarehouseLocations } = warehouseLocationsSlice.actions;
export const warehouseLocationsReducer = warehouseLocationsSlice.reducer;
