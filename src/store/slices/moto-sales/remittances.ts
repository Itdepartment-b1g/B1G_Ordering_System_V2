import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { motoSalesRequest } from './api';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type AgentRemittanceSummary = {
  id: string;
  remittanceDate: string;
  remittedAt: string;
  itemsRemitted: number;
  totalUnits: number;
  ordersCount: number;
  remittedAmount: number;
  hasSignature: boolean;
  orderIds: string[];
};

export type AgentRemittanceOrderLine = {
  orderId: string;
  orderNumber: string;
  clientName: string;
  orderDate: string | null;
  paymentMethod: string | null;
  paymentMode: string | null;
  cashPortion: number;
  chequePortion: number;
  remittedAmount: number;
  fullOrderTotal: number;
  nonCashPortion?: number;
  nonCashLabel?: string;
  items: Array<{
    brandName: string;
    variantName: string;
    quantity: number;
  }>;
};

export type AgentRemittanceDetail = {
  id: string;
  remittanceDate: string;
  remittedAt: string;
  itemsRemitted: number;
  totalUnits: number;
  ordersCount: number;
  remittedAmount: number;
  signatureUrl: string | null;
  orders: AgentRemittanceOrderLine[];
};

export type AgentPendingRemittanceSummary = {
  cashChequeOrdersCount: number;
  cashChequeAmount: number;
  bankOrdersCount: number;
  bankAmount: number;
  totalOrdersCount: number;
};

type MotoRemittancesState = {
  items: AgentRemittanceSummary[];
  listStatus: QueryStatus;
  listError: string | null;
  selectedDetail: AgentRemittanceDetail | null;
  detailStatus: QueryStatus;
  detailError: string | null;
  pending: AgentPendingRemittanceSummary | null;
  pendingStatus: QueryStatus;
  pendingError: string | null;
};

const initialState: MotoRemittancesState = {
  items: [],
  listStatus: 'idle',
  listError: null,
  selectedDetail: null,
  detailStatus: 'idle',
  detailError: null,
  pending: null,
  pendingStatus: 'idle',
  pendingError: null,
};

export const fetchMyRemittances = createAsyncThunk(
  'motoRemittances/fetchList',
  async (input?: { date?: string }) => {
    const body = await motoSalesRequest<{ remittances: AgentRemittanceSummary[] }>(
      'remittances',
      {
        params: {
          resource: 'list',
          date: input?.date,
        },
      }
    );
    return body.remittances || [];
  }
);

export const fetchMyRemittanceDetail = createAsyncThunk(
  'motoRemittances/fetchDetail',
  async (id: string) => {
    const body = await motoSalesRequest<{ remittance: AgentRemittanceDetail }>('remittances', {
      params: {
        resource: 'detail',
        id,
      },
    });
    return body.remittance;
  }
);

export const fetchPendingRemittance = createAsyncThunk(
  'motoRemittances/fetchPending',
  async () => {
    const body = await motoSalesRequest<{ pending: AgentPendingRemittanceSummary }>('remittances', {
      params: { resource: 'pending' },
    });
    return body.pending;
  }
);

const motoRemittancesSlice = createSlice({
  name: 'motoRemittances',
  initialState,
  reducers: {
    clearMyRemittanceDetail(state) {
      state.selectedDetail = null;
      state.detailStatus = 'idle';
      state.detailError = null;
    },
    resetMotoRemittances(state) {
      Object.assign(state, initialState);
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchMyRemittances.pending, (state) => {
        state.listError = null;
        if (state.listStatus !== 'succeeded') state.listStatus = 'loading';
      })
      .addCase(fetchMyRemittances.fulfilled, (state, action) => {
        state.listStatus = 'succeeded';
        state.items = action.payload;
      })
      .addCase(fetchMyRemittances.rejected, (state, action) => {
        state.listStatus = 'failed';
        state.listError = action.error.message || 'Failed to load remittances';
        state.items = [];
      })
      .addCase(fetchMyRemittanceDetail.pending, (state) => {
        state.detailError = null;
        state.detailStatus = 'loading';
      })
      .addCase(fetchMyRemittanceDetail.fulfilled, (state, action) => {
        state.detailStatus = 'succeeded';
        state.selectedDetail = action.payload;
      })
      .addCase(fetchMyRemittanceDetail.rejected, (state, action) => {
        state.detailStatus = 'failed';
        state.detailError = action.error.message || 'Failed to load remittance detail';
        state.selectedDetail = null;
      })
      .addCase(fetchPendingRemittance.pending, (state) => {
        state.pendingError = null;
        if (state.pendingStatus !== 'succeeded') state.pendingStatus = 'loading';
      })
      .addCase(fetchPendingRemittance.fulfilled, (state, action) => {
        state.pendingStatus = 'succeeded';
        state.pending = action.payload;
      })
      .addCase(fetchPendingRemittance.rejected, (state, action) => {
        state.pendingStatus = 'failed';
        state.pendingError = action.error.message || 'Failed to load pending remittances';
        state.pending = null;
      });
  },
});

export const { clearMyRemittanceDetail, resetMotoRemittances } = motoRemittancesSlice.actions;
export const motoRemittancesReducer = motoRemittancesSlice.reducer;
