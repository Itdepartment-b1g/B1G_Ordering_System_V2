import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { warehouseRequest } from './api';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type InternalStockRequestRow = Record<string, unknown> & {
  id: string;
  request_number: string;
  status: string;
  open_discrepancy_count?: number;
};

type RpcResult = {
  success?: boolean;
  error?: string;
  request_id?: string;
  request_number?: string;
  status?: string;
  dr_number?: string;
  allocated?: number;
  [key: string]: unknown;
};

type WarehouseInternalStockRequestsState = {
  requests: InternalStockRequestRow[];
  detail: InternalStockRequestRow | null;
  subLocations: Array<{ id: string; name: string; is_main: boolean }>;
  status: QueryStatus;
  detailStatus: QueryStatus;
  subLocationsStatus: QueryStatus;
  mutationStatus: QueryStatus;
  error: string | null;
  detailError: string | null;
  subLocationsError: string | null;
  mutationError: string | null;
};

const initialState: WarehouseInternalStockRequestsState = {
  requests: [],
  detail: null,
  subLocations: [],
  status: 'idle',
  detailStatus: 'idle',
  subLocationsStatus: 'idle',
  mutationStatus: 'idle',
  error: null,
  detailError: null,
  subLocationsError: null,
  mutationError: null,
};

export const fetchInternalStockRequestsList = createAsyncThunk(
  'warehouseInternalStockRequests/fetchList',
  (params?: { status?: string; fromLocationId?: string; includeEvents?: boolean }) =>
    warehouseRequest<{ requests: InternalStockRequestRow[] }>('internal-stock-requests', {
      params: {
        resource: 'list',
        status: params?.status,
        fromLocationId: params?.fromLocationId,
        includeEvents: params?.includeEvents ? '1' : undefined,
      },
    })
);

export const fetchInternalStockRequestDetail = createAsyncThunk(
  'warehouseInternalStockRequests/fetchDetail',
  (requestId: string) =>
    warehouseRequest<{ request: InternalStockRequestRow | null }>('internal-stock-requests', {
      params: { resource: 'detail', requestId },
    })
);

export const fetchInternalStockSubLocations = createAsyncThunk(
  'warehouseInternalStockRequests/fetchSubLocations',
  () =>
    warehouseRequest<{ locations: Array<{ id: string; name: string; is_main: boolean }> }>(
      'internal-stock-requests',
      { params: { resource: 'sub-locations' } }
    )
);

export const postInternalStockRequestAction = createAsyncThunk(
  'warehouseInternalStockRequests/action',
  (body: Record<string, unknown>) =>
    warehouseRequest<RpcResult>('internal-stock-requests', {
      method: 'POST',
      body,
    })
);

const warehouseInternalStockRequestsSlice = createSlice({
  name: 'warehouseInternalStockRequests',
  initialState,
  reducers: {
    resetWarehouseInternalStockRequests(state) {
      Object.assign(state, initialState);
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchInternalStockRequestsList.pending, (state) => {
        state.error = null;
        if (state.status !== 'succeeded') state.status = 'loading';
      })
      .addCase(fetchInternalStockRequestsList.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.requests = action.payload.requests;
      })
      .addCase(fetchInternalStockRequestsList.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load internal stock requests';
        state.requests = [];
      })
      .addCase(fetchInternalStockRequestDetail.pending, (state) => {
        state.detailError = null;
        state.detailStatus = 'loading';
      })
      .addCase(fetchInternalStockRequestDetail.fulfilled, (state, action) => {
        state.detailStatus = 'succeeded';
        state.detail = action.payload.request;
      })
      .addCase(fetchInternalStockRequestDetail.rejected, (state, action) => {
        state.detailStatus = 'failed';
        state.detailError = action.error.message || 'Failed to load request detail';
        state.detail = null;
      })
      .addCase(fetchInternalStockSubLocations.pending, (state) => {
        state.subLocationsError = null;
        if (state.subLocationsStatus !== 'succeeded') state.subLocationsStatus = 'loading';
      })
      .addCase(fetchInternalStockSubLocations.fulfilled, (state, action) => {
        state.subLocationsStatus = 'succeeded';
        state.subLocations = action.payload.locations;
      })
      .addCase(fetchInternalStockSubLocations.rejected, (state, action) => {
        state.subLocationsStatus = 'failed';
        state.subLocationsError = action.error.message || 'Failed to load sub-warehouses';
        state.subLocations = [];
      })
      .addCase(postInternalStockRequestAction.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(postInternalStockRequestAction.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(postInternalStockRequestAction.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Action failed';
      });
  },
});

export const { resetWarehouseInternalStockRequests } = warehouseInternalStockRequestsSlice.actions;
export const warehouseInternalStockRequestsReducer = warehouseInternalStockRequestsSlice.reducer;
