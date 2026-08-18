import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { supabase } from '@/lib/supabase';
import type {
  KeyAccountClient,
  KeyAccountDeliveryAddress,
  KeyAccountShop,
} from '@/types/database.types';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

type ClientHierarchyState = {
  clients: KeyAccountClient[];
  shops: KeyAccountShop[];
  addresses: KeyAccountDeliveryAddress[];
  clientsStatus: QueryStatus;
  shopsStatus: QueryStatus;
  addressesStatus: QueryStatus;
  clientsError: string | null;
  shopsError: string | null;
  addressesError: string | null;
};

const initialState: ClientHierarchyState = {
  clients: [],
  shops: [],
  addresses: [],
  clientsStatus: 'idle',
  shopsStatus: 'idle',
  addressesStatus: 'idle',
  clientsError: null,
  shopsError: null,
  addressesError: null,
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

async function kaFetch<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  return kaRequest<T>(path, { params });
}

export type KAClientWritePayload = {
  client_name: string;
  client_category: string;
  contact_person?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
};

export type KAShopWritePayload = {
  shop_name: string;
  city?: string | null;
  region?: string | null;
  province?: string | null;
  contact_person?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  operating_hours?: string | null;
  notes?: string | null;
  cor_pdf_path?: string | null;
};

export type KAAddressWritePayload = {
  address_label: string;
  full_address: string;
  city?: string | null;
  region?: string | null;
  province?: string | null;
  zip_code?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  delivery_instructions?: string | null;
  is_default?: boolean;
};

export const fetchKAClients = createAsyncThunk<{ clients: KeyAccountClient[] }>(
  'kaClientHierarchy/fetchClients',
  () => kaFetch<{ clients: KeyAccountClient[] }>('client-hierarchy')
);

export const fetchKAShops = createAsyncThunk<{ shops: KeyAccountShop[] }, string>(
  'kaClientHierarchy/fetchShops',
  (clientId) => kaFetch<{ shops: KeyAccountShop[] }>('client-hierarchy', { clientId })
);

export const fetchKAAddresses = createAsyncThunk<{ addresses: KeyAccountDeliveryAddress[] }, string>(
  'kaClientHierarchy/fetchAddresses',
  (shopId) => kaFetch<{ addresses: KeyAccountDeliveryAddress[] }>('client-hierarchy', { shopId })
);

export const createKAClient = createAsyncThunk<{ client: KeyAccountClient }, KAClientWritePayload>(
  'kaClientHierarchy/createClient',
  (payload) => kaRequest<{ client: KeyAccountClient }>('client-hierarchy', { method: 'POST', body: payload })
);

export const updateKAClient = createAsyncThunk<
  { client: KeyAccountClient },
  { clientId: string } & KAClientWritePayload
>('kaClientHierarchy/updateClient', ({ clientId, ...payload }) =>
  kaRequest<{ client: KeyAccountClient }>('client-hierarchy', {
    method: 'PATCH',
    params: { clientId },
    body: payload,
  })
);

export const createKAShop = createAsyncThunk<
  { shop: KeyAccountShop },
  { clientId: string } & KAShopWritePayload
>('kaClientHierarchy/createShop', ({ clientId, ...payload }) =>
  kaRequest<{ shop: KeyAccountShop }>('client-hierarchy', {
    method: 'POST',
    params: { clientId },
    body: payload,
  })
);

export const updateKAShop = createAsyncThunk<
  { shop: KeyAccountShop },
  { shopId: string } & KAShopWritePayload
>('kaClientHierarchy/updateShop', ({ shopId, ...payload }) =>
  kaRequest<{ shop: KeyAccountShop }>('client-hierarchy', {
    method: 'PATCH',
    params: { shopId },
    body: payload,
  })
);

export const createKAAddress = createAsyncThunk<
  { address: KeyAccountDeliveryAddress },
  { shopId: string } & KAAddressWritePayload
>('kaClientHierarchy/createAddress', ({ shopId, ...payload }) =>
  kaRequest<{ address: KeyAccountDeliveryAddress }>('client-hierarchy', {
    method: 'POST',
    params: { shopId },
    body: payload,
  })
);

export const updateKAAddress = createAsyncThunk<
  { address: KeyAccountDeliveryAddress },
  { addressId: string } & KAAddressWritePayload
>('kaClientHierarchy/updateAddress', ({ addressId, ...payload }) =>
  kaRequest<{ address: KeyAccountDeliveryAddress }>('client-hierarchy', {
    method: 'PATCH',
    params: { addressId },
    body: payload,
  })
);

const kaClientHierarchySlice = createSlice({
  name: 'kaClientHierarchy',
  initialState,
  reducers: {
    resetClients(state) {
      state.clients = [];
      state.clientsStatus = 'idle';
      state.clientsError = null;
    },
    resetShops(state) {
      state.shops = [];
      state.shopsStatus = 'idle';
      state.shopsError = null;
    },
    resetAddresses(state) {
      state.addresses = [];
      state.addressesStatus = 'idle';
      state.addressesError = null;
    },
    resetAll(state) {
      Object.assign(state, initialState);
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchKAClients.pending, (state) => {
        state.clientsError = null;
        if (state.clientsStatus !== 'succeeded') state.clientsStatus = 'loading';
      })
      .addCase(fetchKAClients.fulfilled, (state, action) => {
        state.clientsStatus = 'succeeded';
        state.clients = action.payload.clients;
      })
      .addCase(fetchKAClients.rejected, (state, action) => {
        state.clientsStatus = 'failed';
        state.clientsError = action.error.message || 'Failed to load clients';
      })
      .addCase(fetchKAShops.pending, (state) => {
        state.shopsError = null;
        if (state.shopsStatus !== 'succeeded') state.shopsStatus = 'loading';
      })
      .addCase(fetchKAShops.fulfilled, (state, action) => {
        state.shopsStatus = 'succeeded';
        state.shops = action.payload.shops;
      })
      .addCase(fetchKAShops.rejected, (state, action) => {
        state.shopsStatus = 'failed';
        state.shopsError = action.error.message || 'Failed to load shops';
      })
      .addCase(fetchKAAddresses.pending, (state) => {
        state.addressesError = null;
        if (state.addressesStatus !== 'succeeded') state.addressesStatus = 'loading';
      })
      .addCase(fetchKAAddresses.fulfilled, (state, action) => {
        state.addressesStatus = 'succeeded';
        state.addresses = action.payload.addresses;
      })
      .addCase(fetchKAAddresses.rejected, (state, action) => {
        state.addressesStatus = 'failed';
        state.addressesError = action.error.message || 'Failed to load addresses';
      })
      .addCase(createKAClient.fulfilled, (state, action) => {
        state.clients = [action.payload.client, ...state.clients.filter((c) => c.id !== action.payload.client.id)];
      })
      .addCase(updateKAClient.fulfilled, (state, action) => {
        state.clients = state.clients.map((c) => (c.id === action.payload.client.id ? action.payload.client : c));
      })
      .addCase(createKAShop.fulfilled, (state, action) => {
        state.shops = [action.payload.shop, ...state.shops.filter((s) => s.id !== action.payload.shop.id)];
      })
      .addCase(updateKAShop.fulfilled, (state, action) => {
        state.shops = state.shops.map((s) => (s.id === action.payload.shop.id ? action.payload.shop : s));
      })
      .addCase(createKAAddress.fulfilled, (state, action) => {
        state.addresses = [action.payload.address, ...state.addresses.filter((a) => a.id !== action.payload.address.id)];
      })
      .addCase(updateKAAddress.fulfilled, (state, action) => {
        state.addresses = state.addresses.map((a) =>
          a.id === action.payload.address.id ? action.payload.address : a
        );
      });
  },
});

export const {
  resetClients,
  resetShops,
  resetAddresses,
  resetAll: resetClientHierarchy,
} = kaClientHierarchySlice.actions;
export const kaClientHierarchyReducer = kaClientHierarchySlice.reducer;
