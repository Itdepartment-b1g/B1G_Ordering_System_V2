import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { supabase } from '@/lib/supabase';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type KAPaymentTermOptionRow = {
  id: string;
  company_id: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
};

type KAPaymentTermsState = {
  options: KAPaymentTermOptionRow[];
  activeOnlyFilter: boolean | null;
  status: QueryStatus;
  mutationStatus: QueryStatus;
  error: string | null;
  mutationError: string | null;
};

const initialState: KAPaymentTermsState = {
  options: [],
  activeOnlyFilter: null,
  status: 'idle',
  mutationStatus: 'idle',
  error: null,
  mutationError: null,
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

export const fetchKAPaymentTermOptions = createAsyncThunk(
  'kaPaymentTerms/fetch',
  (activeOnly: boolean = false) =>
    kaRequest<{ options: KAPaymentTermOptionRow[] }>('payment-terms', {
      params: { activeOnly: activeOnly ? 'true' : 'false' },
    })
);

export const createKAPaymentTermOption = createAsyncThunk(
  'kaPaymentTerms/create',
  (label: string) =>
    kaRequest<{ option: KAPaymentTermOptionRow }>('payment-terms', {
      method: 'POST',
      body: { label },
    })
);

export const updateKAPaymentTermOption = createAsyncThunk(
  'kaPaymentTerms/update',
  (payload: { id: string; label?: string; is_active?: boolean }) =>
    kaRequest<{ option: KAPaymentTermOptionRow }>('payment-terms', {
      method: 'PATCH',
      body: payload,
    })
);

export const deleteKAPaymentTermOption = createAsyncThunk(
  'kaPaymentTerms/delete',
  (id: string) =>
    kaRequest<{ ok: true; id: string }>('payment-terms', {
      method: 'DELETE',
      params: { id },
    })
);

const kaPaymentTermsSlice = createSlice({
  name: 'kaPaymentTerms',
  initialState,
  reducers: {
    resetKAPaymentTerms(state) {
      state.options = [];
      state.activeOnlyFilter = null;
      state.status = 'idle';
      state.mutationStatus = 'idle';
      state.error = null;
      state.mutationError = null;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchKAPaymentTermOptions.pending, (state) => {
        state.error = null;
        if (state.status !== 'succeeded') state.status = 'loading';
      })
      .addCase(fetchKAPaymentTermOptions.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.options = action.payload.options;
        state.activeOnlyFilter = action.meta.arg;
      })
      .addCase(fetchKAPaymentTermOptions.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load payment terms';
        state.options = [];
      })
      .addCase(createKAPaymentTermOption.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(updateKAPaymentTermOption.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(deleteKAPaymentTermOption.pending, (state) => {
        state.mutationError = null;
        state.mutationStatus = 'loading';
      })
      .addCase(createKAPaymentTermOption.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(updateKAPaymentTermOption.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(deleteKAPaymentTermOption.fulfilled, (state) => {
        state.mutationStatus = 'succeeded';
      })
      .addCase(createKAPaymentTermOption.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Failed to create payment term';
      })
      .addCase(updateKAPaymentTermOption.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Failed to update payment term';
      })
      .addCase(deleteKAPaymentTermOption.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.mutationError = action.error.message || 'Failed to delete payment term';
      });
  },
});

export const { resetKAPaymentTerms } = kaPaymentTermsSlice.actions;
export const kaPaymentTermsReducer = kaPaymentTermsSlice.reducer;
