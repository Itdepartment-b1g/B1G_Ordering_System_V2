import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { TLRequestWithDetails } from '@/types/tlStockRequests.types';
import type { TlLostTransferLine } from '@/features/inventory/tl-stock-transfer/tlTransferLostItems';
import {
  mapTlTransferRows,
  tlRemainingToDispatch,
} from '@/features/inventory/tl-stock-transfer/tlStockTransferShared';
import { motoSalesRequest } from './api';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type TlTransferLeader = {
  id: string;
  full_name: string;
  region: string | null;
};

export type TlSourceStockRow = {
  variant_id: string;
  variant_name: string;
  variant_type: string;
  brand_name: string;
  stock: number;
};

export type TlShortageRow = {
  id: string;
  request_id: string;
  quantity: number;
  reason: string;
  reporter_notes: string | null;
  resolution_notes: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  request_number: string;
  tdr_number: string;
  requester_name: string;
  source_name: string;
  source_leader_id: string;
  brand_name: string;
  variant_name: string;
};

export type TlRpcResult = {
  success?: boolean;
  error?: string;
  request_number?: string;
  tdr_number?: string;
  tdr_kind?: string;
  status?: string;
  transferred_quantity?: number;
};

export type TlHistoryBundle = {
  tdrs: Array<{
    id: string;
    tdr_number: string;
    kind: string;
    created_at: string;
    items: Array<{
      tdr_id: string;
      request_item_id: string;
      dispatched_quantity: number;
      received_quantity: number;
    }>;
  }>;
  shortages: Array<{
    id: string;
    request_item_id: string | null;
    variant_id: string | null;
    quantity: number;
    reason: string | null;
    reporter_notes: string | null;
    status: string;
    reported_by: string | null;
    resolved_by: string | null;
    resolved_at: string | null;
    resolution_notes: string | null;
    created_at: string;
  }>;
  movements: Array<{
    variant_id: string;
    transaction_type: string;
    quantity: number;
    created_at: string;
    notes: string | null;
  }>;
  profiles: Array<{ id: string; full_name: string | null }>;
};

export type TlTdrDetails = {
  tdrs: Array<Record<string, unknown>>;
  shortages: Array<{ request_item_id: string | null; quantity: number; created_at: string }>;
  movements: Array<{
    variant_id: string;
    transaction_type: string;
    quantity: number;
    created_at: string;
    notes: string | null;
  }>;
};

type MotoSalesTlTransfersState = {
  myRequests: TLRequestWithDetails[];
  incomingRequests: TLRequestWithDetails[];
  dispatchedRequests: TLRequestWithDetails[];
  adminRequests: TLRequestWithDetails[];
  shortages: TlShortageRow[];
  lostLines: TlLostTransferLine[];
  leaders: TlTransferLeader[];
  sourceStock: TlSourceStockRow[];
  sourceStockLeaderId: string | null;
  myStatus: QueryStatus;
  incomingStatus: QueryStatus;
  dispatchedStatus: QueryStatus;
  adminStatus: QueryStatus;
  shortagesStatus: QueryStatus;
  lostStatus: QueryStatus;
  leadersStatus: QueryStatus;
  sourceStockStatus: QueryStatus;
  mutationStatus: QueryStatus;
  myError: string | null;
  incomingError: string | null;
  dispatchedError: string | null;
  adminError: string | null;
  shortagesError: string | null;
  lostError: string | null;
  leadersError: string | null;
  sourceStockError: string | null;
  mutationError: string | null;
};

const initialState: MotoSalesTlTransfersState = {
  myRequests: [],
  incomingRequests: [],
  dispatchedRequests: [],
  adminRequests: [],
  shortages: [],
  lostLines: [],
  leaders: [],
  sourceStock: [],
  sourceStockLeaderId: null,
  myStatus: 'idle',
  incomingStatus: 'idle',
  dispatchedStatus: 'idle',
  adminStatus: 'idle',
  shortagesStatus: 'idle',
  lostStatus: 'idle',
  leadersStatus: 'idle',
  sourceStockStatus: 'idle',
  mutationStatus: 'idle',
  myError: null,
  incomingError: null,
  dispatchedError: null,
  adminError: null,
  shortagesError: null,
  lostError: null,
  leadersError: null,
  sourceStockError: null,
  mutationError: null,
};

function isDispatchedTlRow(row: TLRequestWithDetails) {
  if (
    row.status === 'pending_source_tl' ||
    row.status === 'admin_approved' ||
    row.status === 'pending_admin'
  ) {
    return false;
  }
  return (
    row.status === 'pending_receipt' ||
    row.status === 'completed' ||
    row.status === 'incomplete' ||
    row.status === 'source_tl_rejected' ||
    Number(row.dispatched_quantity || 0) > 0
  );
}

export const fetchMyTlTransfers = createAsyncThunk('motoSalesTlTransfers/fetchMine', async () => {
  const body = await motoSalesRequest<{ requests: unknown[] }>('tl-stock-transfers', {
    params: { resource: 'mine' },
  });
  return mapTlTransferRows(body.requests as never[]);
});

export const fetchIncomingTlTransfers = createAsyncThunk(
  'motoSalesTlTransfers/fetchIncoming',
  async () => {
    const body = await motoSalesRequest<{ requests: unknown[] }>('tl-stock-transfers', {
      params: { resource: 'incoming' },
    });
    return mapTlTransferRows(body.requests as never[]).filter(
      (row) =>
        row.status === 'pending_source_tl' ||
        row.status === 'admin_approved' ||
        tlRemainingToDispatch(row) > 0
    );
  }
);

export const fetchDispatchedTlTransfers = createAsyncThunk(
  'motoSalesTlTransfers/fetchDispatched',
  async () => {
    const body = await motoSalesRequest<{ requests: unknown[] }>('tl-stock-transfers', {
      params: { resource: 'dispatched' },
    });
    return mapTlTransferRows(body.requests as never[]).filter(isDispatchedTlRow);
  }
);

export const fetchAdminTlTransfers = createAsyncThunk(
  'motoSalesTlTransfers/fetchAdmin',
  async (companyId?: string) => {
    const body = await motoSalesRequest<{ requests: unknown[] }>('tl-stock-transfers', {
      params: { resource: 'admin', company_id: companyId },
    });
    return mapTlTransferRows(body.requests as never[]);
  }
);

export const fetchTlTransferRequest = createAsyncThunk(
  'motoSalesTlTransfers/fetchRequest',
  async (requestId: string) => {
    const body = await motoSalesRequest<{ request: unknown }>('tl-stock-transfers', {
      params: { resource: 'request', id: requestId },
    });
    return mapTlTransferRows(body.request ? [body.request] : []);
  }
);

export const fetchTlTransferLeaders = createAsyncThunk('motoSalesTlTransfers/fetchLeaders', () =>
  motoSalesRequest<{ leaders: TlTransferLeader[] }>('tl-stock-transfers', {
    params: { resource: 'leaders' },
  })
);

export const fetchTlSourceStock = createAsyncThunk(
  'motoSalesTlTransfers/fetchSourceStock',
  (sourceLeaderId: string) =>
    motoSalesRequest<{ source_leader_id: string; rows: TlSourceStockRow[] }>('tl-stock-transfers', {
      params: { resource: 'source-stock', source_leader_id: sourceLeaderId },
    })
);

export const fetchTlSourceAvailability = createAsyncThunk(
  'motoSalesTlTransfers/fetchSourceAvailability',
  (args: { sourceLeaderId: string; variantIds: string[] }) =>
    motoSalesRequest<{ rows: Array<{ variant_id: string; stock: number }> }>('tl-stock-transfers', {
      params: {
        resource: 'source-availability',
        source_leader_id: args.sourceLeaderId,
        variant_ids: args.variantIds.join(','),
      },
    })
);

export const fetchTlTransferShortages = createAsyncThunk('motoSalesTlTransfers/fetchShortages', () =>
  motoSalesRequest<{ shortages: TlShortageRow[] }>('tl-stock-transfers', {
    params: { resource: 'shortages' },
  })
);

export const fetchTlLostLines = createAsyncThunk('motoSalesTlTransfers/fetchLost', () =>
  motoSalesRequest<{ lines: TlLostTransferLine[] }>('tl-stock-transfers', {
    params: { resource: 'lost' },
  })
);

export const fetchTlTransferHistoryData = createAsyncThunk(
  'motoSalesTlTransfers/fetchHistory',
  (args: { requestId: string; profileIds?: string[] }) =>
    motoSalesRequest<TlHistoryBundle>('tl-stock-transfers', {
      params: {
        resource: 'history',
        request_id: args.requestId,
        profile_ids: args.profileIds?.length ? args.profileIds.join(',') : undefined,
      },
    })
);

export const fetchTlTransferTdrDetails = createAsyncThunk(
  'motoSalesTlTransfers/fetchTdrDetails',
  (requestId: string) =>
    motoSalesRequest<TlTdrDetails>('tl-stock-transfers', {
      params: { resource: 'tdr-details', request_id: requestId },
    })
);

export const submitTlStockTransfer = createAsyncThunk(
  'motoSalesTlTransfers/submit',
  (payload: { source_leader_id: string; items: Array<{ variant_id: string; quantity: number }>; notes?: string | null }) =>
    motoSalesRequest<TlRpcResult>('tl-stock-transfers', {
      method: 'POST',
      body: { action: 'submit', ...payload },
    })
);

export const dispatchTlStockTransfer = createAsyncThunk(
  'motoSalesTlTransfers/dispatch',
  (payload: {
    request_id: string;
    dispatched_quantity: number;
    signature_url: string;
    signature_path: string;
    shortfall_reason?: string | null;
    notes?: string | null;
    proof_urls?: string[] | null;
    reuse_tdr?: string | null;
  }) =>
    motoSalesRequest<TlRpcResult>('tl-stock-transfers', {
      method: 'POST',
      body: { action: 'dispatch', ...payload },
    })
);

export const receiveTlStockTransfer = createAsyncThunk(
  'motoSalesTlTransfers/receive',
  (payload: {
    request_id: string;
    signature_url: string;
    signature_path: string;
    received_quantity: number;
    shortfall_reason?: string | null;
    shortfall_notes?: string | null;
    proof_urls?: string[] | null;
  }) =>
    motoSalesRequest<TlRpcResult>('tl-stock-transfers', {
      method: 'POST',
      body: { action: 'receive', ...payload },
    })
);

export const rejectTlStockTransfer = createAsyncThunk(
  'motoSalesTlTransfers/reject',
  (payload: { request_id: string; reason: string }) =>
    motoSalesRequest<TlRpcResult>('tl-stock-transfers', {
      method: 'POST',
      body: { action: 'reject', ...payload },
    })
);

export const adminApproveTlStockTransfer = createAsyncThunk(
  'motoSalesTlTransfers/adminApprove',
  (payload: {
    request_id: string;
    approved_quantity: number;
    notes?: string | null;
    company_id?: string | null;
  }) =>
    motoSalesRequest<TlRpcResult>('tl-stock-transfers', {
      method: 'POST',
      body: { action: 'admin-approve', ...payload },
    })
);

export const adminRejectTlStockTransfer = createAsyncThunk(
  'motoSalesTlTransfers/adminReject',
  (payload: { request_id: string; reason: string; company_id?: string | null }) =>
    motoSalesRequest<TlRpcResult>('tl-stock-transfers', {
      method: 'POST',
      body: { action: 'admin-reject', ...payload },
    })
);

export const resolveTlStockDiscrepancy = createAsyncThunk(
  'motoSalesTlTransfers/resolveDiscrepancy',
  (payload: { discrepancy_id: string; resolution: string; notes?: string | null }) =>
    motoSalesRequest<TlRpcResult>('tl-stock-transfers', {
      method: 'POST',
      body: { action: 'resolve-discrepancy', ...payload },
    })
);

function markLoading(
  state: MotoSalesTlTransfersState,
  statusKey: keyof MotoSalesTlTransfersState,
  errorKey: keyof MotoSalesTlTransfersState
) {
  (state[errorKey] as string | null) = null;
  if (state[statusKey] !== 'succeeded') {
    (state[statusKey] as QueryStatus) = 'loading';
  }
}

const mutationThunks = [
  submitTlStockTransfer,
  dispatchTlStockTransfer,
  receiveTlStockTransfer,
  rejectTlStockTransfer,
  adminApproveTlStockTransfer,
  adminRejectTlStockTransfer,
  resolveTlStockDiscrepancy,
];

const motoSalesTlTransfersSlice = createSlice({
  name: 'motoSalesTlTransfers',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchMyTlTransfers.pending, (state) => {
        markLoading(state, 'myStatus', 'myError');
      })
      .addCase(fetchMyTlTransfers.fulfilled, (state, action) => {
        state.myStatus = 'succeeded';
        state.myRequests = action.payload;
      })
      .addCase(fetchMyTlTransfers.rejected, (state, action) => {
        state.myStatus = 'failed';
        state.myError = action.error.message || 'Failed to load your transfers';
        state.myRequests = [];
      })
      .addCase(fetchIncomingTlTransfers.pending, (state) => {
        markLoading(state, 'incomingStatus', 'incomingError');
      })
      .addCase(fetchIncomingTlTransfers.fulfilled, (state, action) => {
        state.incomingStatus = 'succeeded';
        state.incomingRequests = action.payload;
      })
      .addCase(fetchIncomingTlTransfers.rejected, (state, action) => {
        state.incomingStatus = 'failed';
        state.incomingError = action.error.message || 'Failed to load incoming transfers';
        state.incomingRequests = [];
      })
      .addCase(fetchDispatchedTlTransfers.pending, (state) => {
        markLoading(state, 'dispatchedStatus', 'dispatchedError');
      })
      .addCase(fetchDispatchedTlTransfers.fulfilled, (state, action) => {
        state.dispatchedStatus = 'succeeded';
        state.dispatchedRequests = action.payload;
      })
      .addCase(fetchDispatchedTlTransfers.rejected, (state, action) => {
        state.dispatchedStatus = 'failed';
        state.dispatchedError = action.error.message || 'Failed to load dispatched transfers';
        state.dispatchedRequests = [];
      })
      .addCase(fetchAdminTlTransfers.pending, (state) => {
        markLoading(state, 'adminStatus', 'adminError');
      })
      .addCase(fetchAdminTlTransfers.fulfilled, (state, action) => {
        state.adminStatus = 'succeeded';
        state.adminRequests = action.payload;
      })
      .addCase(fetchAdminTlTransfers.rejected, (state, action) => {
        state.adminStatus = 'failed';
        state.adminError = action.error.message || 'Failed to load transfers';
        state.adminRequests = [];
      })
      .addCase(fetchTlTransferShortages.pending, (state) => {
        markLoading(state, 'shortagesStatus', 'shortagesError');
      })
      .addCase(fetchTlTransferShortages.fulfilled, (state, action) => {
        state.shortagesStatus = 'succeeded';
        state.shortages = action.payload.shortages;
      })
      .addCase(fetchTlTransferShortages.rejected, (state, action) => {
        state.shortagesStatus = 'failed';
        state.shortagesError = action.error.message || 'Failed to load shortages';
        state.shortages = [];
      })
      .addCase(fetchTlLostLines.pending, (state) => {
        markLoading(state, 'lostStatus', 'lostError');
      })
      .addCase(fetchTlLostLines.fulfilled, (state, action) => {
        state.lostStatus = 'succeeded';
        state.lostLines = action.payload.lines;
      })
      .addCase(fetchTlLostLines.rejected, (state, action) => {
        state.lostStatus = 'failed';
        state.lostError = action.error.message || 'Failed to load missing and lost items';
        state.lostLines = [];
      })
      .addCase(fetchTlTransferLeaders.pending, (state) => {
        markLoading(state, 'leadersStatus', 'leadersError');
      })
      .addCase(fetchTlTransferLeaders.fulfilled, (state, action) => {
        state.leadersStatus = 'succeeded';
        state.leaders = action.payload.leaders;
      })
      .addCase(fetchTlTransferLeaders.rejected, (state, action) => {
        state.leadersStatus = 'failed';
        state.leadersError = action.error.message || 'Failed to load team leaders';
        state.leaders = [];
      })
      .addCase(fetchTlSourceStock.pending, (state) => {
        markLoading(state, 'sourceStockStatus', 'sourceStockError');
      })
      .addCase(fetchTlSourceStock.fulfilled, (state, action) => {
        state.sourceStockStatus = 'succeeded';
        state.sourceStockLeaderId = action.payload.source_leader_id;
        state.sourceStock = action.payload.rows;
      })
      .addCase(fetchTlSourceStock.rejected, (state, action) => {
        state.sourceStockStatus = 'failed';
        state.sourceStockError = action.error.message || 'Failed to load stock';
        state.sourceStock = [];
      });

    for (const thunk of mutationThunks) {
      builder
        .addCase(thunk.pending, (state) => {
          state.mutationError = null;
          state.mutationStatus = 'loading';
        })
        .addCase(thunk.fulfilled, (state) => {
          state.mutationStatus = 'succeeded';
        })
        .addCase(thunk.rejected, (state, action) => {
          state.mutationStatus = 'failed';
          state.mutationError = action.error.message || 'Request failed';
        });
    }
  },
});

export const motoSalesTlTransfersReducer = motoSalesTlTransfersSlice.reducer;

export type TlTransferListName =
  | 'mine'
  | 'incoming'
  | 'dispatched'
  | 'shortages'
  | 'lost'
  | 'admin';

const LEADER_TL_LISTS: TlTransferListName[] = [
  'mine',
  'incoming',
  'dispatched',
  'shortages',
  'lost',
];

export function refreshTlTransferLists(
  dispatch: (action: unknown) => unknown,
  options?: {
    includeAdmin?: boolean;
    companyId?: string | null;
    lists?: TlTransferListName[];
  }
) {
  const lists =
    options?.lists ??
    (options?.includeAdmin ? (['admin', ...LEADER_TL_LISTS] as TlTransferListName[]) : LEADER_TL_LISTS);
  const tasks = lists.map((list) => {
    switch (list) {
      case 'mine':
        return dispatch(fetchMyTlTransfers());
      case 'incoming':
        return dispatch(fetchIncomingTlTransfers());
      case 'dispatched':
        return dispatch(fetchDispatchedTlTransfers());
      case 'shortages':
        return dispatch(fetchTlTransferShortages());
      case 'lost':
        return dispatch(fetchTlLostLines());
      case 'admin':
        return dispatch(fetchAdminTlTransfers(options?.companyId || undefined));
    }
  });
  return Promise.all(tasks);
}
