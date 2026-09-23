import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { warehouseRequest } from './api';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type DisposalSaReceiptLine = {
  qty_good: number;
  qty_damaged: number;
  warehouse_variant: {
    name: string;
    brand: { name: string } | null;
  } | null;
};

export type DisposalSaReceipt = {
  id: string;
  received_at: string;
  notes: string | null;
  received_by_user: { full_name: string } | null;
  lines: DisposalSaReceiptLine[];
};

export type DisposalSaReturn = {
  id: string;
  request_number: string;
  return_type: string | null;
  status: string | null;
  created_at: string | null;
  approved_at: string | null;
  cancelled_at: string | null;
  source_agent_id: string | null;
  client_company: { company_name: string } | null;
  created_by_user: { full_name: string } | null;
  source_agent: { full_name: string } | null;
  approved_by_user: { full_name: string } | null;
  cancelled_by_user: { full_name: string } | null;
  destination_location: { name: string; is_main: boolean } | null;
  receipts: DisposalSaReceipt[];
};

export type DisposalRow = {
  id: string;
  quantity: number;
  source_type: string;
  notes: string | null;
  created_at: string;
  sa_stock_return_request_id: string | null;
  warehouse_location: { name: string; is_main: boolean } | null;
  variant: {
    name: string;
    variant_type: string;
    brand: { name: string } | null;
  } | null;
  disposed_by_user: { full_name: string } | null;
  fulfillment_po: { po_number: string } | null;
  rebate: { rebate_number: string } | null;
  sa_return: DisposalSaReturn | null;
  stock_return: { request_number: string } | null;
};

export type LocationOption = {
  id: string;
  name: string;
  is_main: boolean;
};

type WarehouseDisposalsState = {
  disposals: DisposalRow[];
  locations: LocationOption[];
  saReturns: DisposalSaReturn[];
  locationFilter: string | null;
  saReturnIdsKey: string | null;
  status: QueryStatus;
  locationsStatus: QueryStatus;
  saReturnsStatus: QueryStatus;
  error: string | null;
  locationsError: string | null;
  saReturnsError: string | null;
};

const initialState: WarehouseDisposalsState = {
  disposals: [],
  locations: [],
  saReturns: [],
  locationFilter: null,
  saReturnIdsKey: null,
  status: 'idle',
  locationsStatus: 'idle',
  saReturnsStatus: 'idle',
  error: null,
  locationsError: null,
  saReturnsError: null,
};

export const fetchWarehouseDisposals = createAsyncThunk(
  'warehouseDisposals/fetchList',
  (locationId?: string) =>
    warehouseRequest<{ disposals: DisposalRow[] }>('disposals', {
      params: {
        resource: 'list',
        locationId: locationId && locationId !== 'all' ? locationId : undefined,
      },
    })
);

export const fetchWarehouseDisposalLocations = createAsyncThunk(
  'warehouseDisposals/fetchLocations',
  () =>
    warehouseRequest<{ locations: LocationOption[] }>('disposals', {
      params: { resource: 'locations' },
    })
);

export const fetchWarehouseDisposalSaReturnDetails = createAsyncThunk(
  'warehouseDisposals/fetchSaReturnDetails',
  (requestIds: string[]) =>
    warehouseRequest<{ returns: DisposalSaReturn[] }>('disposals', {
      params: {
        resource: 'sa-return-details',
        requestIds: requestIds.join(','),
      },
    })
);

const warehouseDisposalsSlice = createSlice({
  name: 'warehouseDisposals',
  initialState,
  reducers: {
    resetWarehouseDisposals(state) {
      Object.assign(state, initialState);
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchWarehouseDisposals.pending, (state, action) => {
        state.error = null;
        state.locationFilter = action.meta.arg ?? 'all';
        if (state.status !== 'succeeded') state.status = 'loading';
      })
      .addCase(fetchWarehouseDisposals.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.disposals = action.payload.disposals;
        state.locationFilter = action.meta.arg ?? 'all';
      })
      .addCase(fetchWarehouseDisposals.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load disposals';
        state.disposals = [];
      })
      .addCase(fetchWarehouseDisposalLocations.pending, (state) => {
        state.locationsError = null;
        if (state.locationsStatus !== 'succeeded') state.locationsStatus = 'loading';
      })
      .addCase(fetchWarehouseDisposalLocations.fulfilled, (state, action) => {
        state.locationsStatus = 'succeeded';
        state.locations = action.payload.locations;
      })
      .addCase(fetchWarehouseDisposalLocations.rejected, (state, action) => {
        state.locationsStatus = 'failed';
        state.locationsError = action.error.message || 'Failed to load locations';
        state.locations = [];
      })
      .addCase(fetchWarehouseDisposalSaReturnDetails.pending, (state, action) => {
        state.saReturnsError = null;
        state.saReturnIdsKey = action.meta.arg.slice().sort().join(',');
        if (state.saReturnsStatus !== 'succeeded') state.saReturnsStatus = 'loading';
      })
      .addCase(fetchWarehouseDisposalSaReturnDetails.fulfilled, (state, action) => {
        state.saReturnsStatus = 'succeeded';
        state.saReturns = action.payload.returns;
        state.saReturnIdsKey = action.meta.arg.slice().sort().join(',');
      })
      .addCase(fetchWarehouseDisposalSaReturnDetails.rejected, (state, action) => {
        state.saReturnsStatus = 'failed';
        state.saReturnsError = action.error.message || 'Failed to load return details';
        state.saReturns = [];
      });
  },
});

export const { resetWarehouseDisposals } = warehouseDisposalsSlice.actions;
export const warehouseDisposalsReducer = warehouseDisposalsSlice.reducer;
