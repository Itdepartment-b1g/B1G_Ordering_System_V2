import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { supabase } from '@/lib/supabase';
import type { BankAccount, KeyAccountPaymentSettings } from '@/types/database.types';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type KAPaymentSettingsWritePayload = {
  bank_accounts: BankAccount[];
  gcash_number: string | null;
  gcash_name: string | null;
  gcash_qr_url: string | null;
  cash_enabled: boolean;
  cheque_enabled: boolean;
  gcash_enabled: boolean;
  bank_transfer_enabled: boolean;
};

export type KAPaymentSettingsUpdatePayload = KAPaymentSettingsWritePayload & {
  id: string;
};

type KAPaymentSettingsState = {
  settings: KeyAccountPaymentSettings | null;
  createdByName: string | null;
  status: QueryStatus;
  saveStatus: QueryStatus;
  error: string | null;
  saveError: string | null;
};

const initialState: KAPaymentSettingsState = {
  settings: null,
  createdByName: null,
  status: 'idle',
  saveStatus: 'idle',
  error: null,
  saveError: null,
};

async function kaRequest<T>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
  }
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`/api/key-account/${path}`, {
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

export const fetchKAPaymentSettings = createAsyncThunk(
  'kaPaymentSettings/fetch',
  () =>
    kaRequest<{ settings: KeyAccountPaymentSettings | null; createdByName: string | null }>(
      'payment-settings'
    )
);

export const createKAPaymentSettings = createAsyncThunk(
  'kaPaymentSettings/create',
  (payload: KAPaymentSettingsWritePayload) =>
    kaRequest<{ settings: KeyAccountPaymentSettings }>('payment-settings', {
      method: 'POST',
      body: payload,
    })
);

export const updateKAPaymentSettings = createAsyncThunk(
  'kaPaymentSettings/update',
  (payload: KAPaymentSettingsUpdatePayload) =>
    kaRequest<{ settings: KeyAccountPaymentSettings }>('payment-settings', {
      method: 'PATCH',
      body: payload,
    })
);

const kaPaymentSettingsSlice = createSlice({
  name: 'kaPaymentSettings',
  initialState,
  reducers: {
    resetKAPaymentSettings(state) {
      state.settings = null;
      state.createdByName = null;
      state.status = 'idle';
      state.saveStatus = 'idle';
      state.error = null;
      state.saveError = null;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchKAPaymentSettings.pending, (state) => {
        state.error = null;
        if (state.status !== 'succeeded') state.status = 'loading';
      })
      .addCase(fetchKAPaymentSettings.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.settings = action.payload.settings;
        state.createdByName = action.payload.createdByName;
      })
      .addCase(fetchKAPaymentSettings.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load payment settings';
        state.settings = null;
        state.createdByName = null;
      })
      .addCase(createKAPaymentSettings.pending, (state) => {
        state.saveError = null;
        state.saveStatus = 'loading';
      })
      .addCase(updateKAPaymentSettings.pending, (state) => {
        state.saveError = null;
        state.saveStatus = 'loading';
      })
      .addCase(createKAPaymentSettings.fulfilled, (state, action) => {
        state.saveStatus = 'succeeded';
        if (!state.settings && action.payload.settings) {
          state.settings = action.payload.settings;
        }
      })
      .addCase(updateKAPaymentSettings.fulfilled, (state) => {
        state.saveStatus = 'succeeded';
      })
      .addCase(createKAPaymentSettings.rejected, (state, action) => {
        state.saveStatus = 'failed';
        state.saveError = action.error.message || 'Failed to save payment settings';
      })
      .addCase(updateKAPaymentSettings.rejected, (state, action) => {
        state.saveStatus = 'failed';
        state.saveError = action.error.message || 'Failed to save payment settings';
      });
  },
});

export const { resetKAPaymentSettings } = kaPaymentSettingsSlice.actions;
export const kaPaymentSettingsReducer = kaPaymentSettingsSlice.reducer;
