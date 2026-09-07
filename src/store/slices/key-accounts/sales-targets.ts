import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { supabase } from '@/lib/supabase';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type KASalesTargetAssigneeRole = 'sales_director' | 'key_account_manager';

export type KASalesTargetAssignee = {
  id: string;
  fullName: string;
  role: KASalesTargetAssigneeRole;
  directorId: string | null;
  directorName: string | null;
};

export type KASalesTargetRow = {
  id: string;
  assigneeId: string;
  targetMonth: string;
  targetRevenue: number;
};

export type KASalesTargetActual = {
  assigneeId: string;
  month: string;
  actualRevenue: number;
  actualOrders: number;
  actualQty: number;
};

export type KASalesTargetPo = {
  id: string;
  poNumber: string;
  poDate: string;
  clientName: string;
  shopName: string;
  balance: number;
  total: number;
};

export type KASalesTargetRange = {
  startMonth: string;
  endMonth: string;
};

type KASalesTargetsState = {
  assignees: KASalesTargetAssignee[];
  targets: KASalesTargetRow[];
  actuals: KASalesTargetActual[];
  purchaseOrders: KASalesTargetPo[];
  range: KASalesTargetRange | null;
  detailKey: string | null;
  status: QueryStatus;
  saveStatus: QueryStatus;
  detailStatus: QueryStatus;
  error: string | null;
  saveError: string | null;
  detailError: string | null;
};

const initialState: KASalesTargetsState = {
  assignees: [],
  targets: [],
  actuals: [],
  purchaseOrders: [],
  range: null,
  detailKey: null,
  status: 'idle',
  saveStatus: 'idle',
  detailStatus: 'idle',
  error: null,
  saveError: null,
  detailError: null,
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

export const fetchKASalesTargets = createAsyncThunk(
  'kaSalesTargets/fetch',
  (range: KASalesTargetRange) =>
    kaRequest<{
      assignees: KASalesTargetAssignee[];
      targets: KASalesTargetRow[];
      actuals: KASalesTargetActual[];
    }>('sales-targets', {
      params: {
        startMonth: range.startMonth,
        endMonth: range.endMonth,
      },
    })
);

export const upsertKASalesTarget = createAsyncThunk(
  'kaSalesTargets/upsert',
  (payload: { assigneeId: string; targetMonth: string; targetRevenue: number }) =>
    kaRequest<{ target: KASalesTargetRow }>('sales-targets', {
      method: 'POST',
      body: payload,
    })
);

export const deleteKASalesTarget = createAsyncThunk(
  'kaSalesTargets/delete',
  (payload: { assigneeId: string; targetMonth: string }) =>
    kaRequest<{ ok: true; assigneeId: string; targetMonth: string }>('sales-targets', {
      method: 'DELETE',
      params: {
        assigneeId: payload.assigneeId,
        targetMonth: payload.targetMonth,
      },
    })
);

export const fetchKASalesTargetPos = createAsyncThunk(
  'kaSalesTargets/fetchPos',
  (payload: { assigneeId: string; month: string }) =>
    kaRequest<{ purchaseOrders: KASalesTargetPo[] }>('sales-targets', {
      params: {
        resource: 'pos',
        assigneeId: payload.assigneeId,
        month: payload.month,
      },
    })
);

const kaSalesTargetsSlice = createSlice({
  name: 'kaSalesTargets',
  initialState,
  reducers: {
    resetKASalesTargets() {
      return initialState;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchKASalesTargets.pending, (state, action) => {
        state.error = null;
        if (state.status !== 'succeeded') state.status = 'loading';
        state.range = action.meta.arg;
      })
      .addCase(fetchKASalesTargets.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.assignees = action.payload.assignees;
        state.targets = action.payload.targets;
        state.actuals = action.payload.actuals;
        state.range = action.meta.arg;
      })
      .addCase(fetchKASalesTargets.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load sales targets';
        state.assignees = [];
        state.targets = [];
        state.actuals = [];
      })
      .addCase(upsertKASalesTarget.pending, (state) => {
        state.saveError = null;
        state.saveStatus = 'loading';
      })
      .addCase(upsertKASalesTarget.fulfilled, (state, action) => {
        state.saveStatus = 'succeeded';
        const next = action.payload.target;
        const index = state.targets.findIndex(
          (row) => row.assigneeId === next.assigneeId && row.targetMonth === next.targetMonth
        );
        if (index >= 0) state.targets[index] = next;
        else state.targets.push(next);
      })
      .addCase(upsertKASalesTarget.rejected, (state, action) => {
        state.saveStatus = 'failed';
        state.saveError = action.error.message || 'Failed to save sales target';
      })
      .addCase(deleteKASalesTarget.pending, (state) => {
        state.saveError = null;
        state.saveStatus = 'loading';
      })
      .addCase(deleteKASalesTarget.fulfilled, (state, action) => {
        state.saveStatus = 'succeeded';
        state.targets = state.targets.filter(
          (row) =>
            !(
              row.assigneeId === action.payload.assigneeId &&
              row.targetMonth === action.payload.targetMonth
            )
        );
      })
      .addCase(deleteKASalesTarget.rejected, (state, action) => {
        state.saveStatus = 'failed';
        state.saveError = action.error.message || 'Failed to clear sales target';
      })
      .addCase(fetchKASalesTargetPos.pending, (state, action) => {
        state.detailError = null;
        state.detailStatus = 'loading';
        state.detailKey = `${action.meta.arg.assigneeId}:${action.meta.arg.month}`;
        state.purchaseOrders = [];
      })
      .addCase(fetchKASalesTargetPos.fulfilled, (state, action) => {
        state.detailStatus = 'succeeded';
        state.purchaseOrders = action.payload.purchaseOrders;
        state.detailKey = `${action.meta.arg.assigneeId}:${action.meta.arg.month}`;
      })
      .addCase(fetchKASalesTargetPos.rejected, (state, action) => {
        state.detailStatus = 'failed';
        state.detailError = action.error.message || 'Failed to load purchase orders';
        state.purchaseOrders = [];
      });
  },
});

export const { resetKASalesTargets } = kaSalesTargetsSlice.actions;
export const kaSalesTargetsReducer = kaSalesTargetsSlice.reducer;
