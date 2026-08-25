import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types/database.types';

export type KAUserDto = {
  id: string;
  name: string;
  email: string;
  phone: string;
  region: string;
  cities: string[];
  status: 'active' | 'inactive';
  role: string;
  totalSales: number;
  ordersCount: number;
};

type KAUsersState = {
  users: KAUserDto[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
};

const initialState: KAUsersState = {
  users: [],
  status: 'idle',
  error: null,
};

async function kaFetch<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`/api/key-account/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Failed to load ${path}`);
  }
  return body as T;
}

export const fetchKAUsers = createAsyncThunk<{ users: KAUserDto[] }>(
  'kaUserManagement/fetch',
  () => kaFetch<{ users: KAUserDto[] }>('user-management')
);

const kaUserManagementSlice = createSlice({
  name: 'kaUserManagement',
  initialState,
  reducers: {
    reset(state) {
      state.users = [];
      state.status = 'idle';
      state.error = null;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchKAUsers.pending, (state) => {
        state.error = null;
        if (state.status !== 'succeeded') state.status = 'loading';
      })
      .addCase(fetchKAUsers.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.users = action.payload.users;
      })
      .addCase(fetchKAUsers.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load Key Account users';
      });
  },
});

export const { reset: resetKAUsers } = kaUserManagementSlice.actions;
export const kaUserManagementReducer = kaUserManagementSlice.reducer;
