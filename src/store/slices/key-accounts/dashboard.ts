import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { supabase } from '@/lib/supabase';

type QueryStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type KADashboardPaymentSummary = {
  paidRevenue: number;
  partialRevenue: number;
  unpaidRevenue: number;
  consignmentRevenue: number;
  settlementDiscountRevenue: number;
  totalRevenue: number;
};

export type KADashboardMonthlyPaymentRow = {
  month: string;
  paidRevenue: number;
  partialRevenue: number;
  unpaidRevenue: number;
  consignmentRevenue: number;
  settlementDiscountRevenue: number;
  totalRevenue: number;
  unpaidOrders: number;
  partialOrders: number;
  consignmentOrders: number;
};

export type KADashboardOrderRef = {
  id: string;
  po_number?: string | null;
  order_date: string;
  total_amount: number | null;
  subtotal?: number | null;
  status?: string | null;
  workflow_status?: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  warehouse_location_id?: string | null;
  kam_id?: string | null;
  key_account_client_id?: string | null;
  key_account_payment_status?: string | null;
  key_account_payment_mode?: string | null;
  dr_number?: string | null;
  client?: { client_name: string | null } | { client_name: string | null }[] | null;
};

export type KADashboardPaymentRow = {
  purchase_order_id: string;
  amount: number | null;
  settlement_discount: number | null;
  created_at: string;
};

export type KADashboardRevenueResult = {
  summary: KADashboardPaymentSummary;
  monthlyData: KADashboardMonthlyPaymentRow[];
  orders: KADashboardOrderRef[];
  payments: KADashboardPaymentRow[];
  outstandingPaymentOrderCount: number;
  consignmentOrderCount: number;
  pendingOrderCount: number;
};

export type KADashboardStats = {
  totalClients: number;
  totalOrders: number;
  totalKAMs: number;
  pendingOrders: number;
  consignmentOrders: number;
  inactiveClients: number;
  totalRevenue: number;
};

export type KADashboardClientRow = {
  id: string;
  client_name: string;
  client_code: string;
  kam_name: string;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
  totalOrders: number;
  totalRevenue: number;
  paidRevenue: number;
  remainingBalance: number;
  consignmentRevenue: number;
  settlementDiscountRevenue: number;
};

export type KADashboardOrderRow = {
  id: string;
  client_name: string;
  shop_name: string;
  kam_name: string;
  total_amount: number;
  status: string;
  workflow_status: string | null;
  order_date: string;
  dr_number?: string | null;
};

export type KADashboardKamRow = {
  id: string;
  full_name: string;
  email: string;
  clientCount: number;
  orderCount: number;
  deliveredOrderCount: number;
  totalRevenue: number;
};

export type KADashboardBreakdownRow = {
  name: string;
  quantity: number;
  revenue: number;
  orderCount: number;
};

export type KADashboardBrandBreakdown = KADashboardBreakdownRow & {
  clientCount: number;
  variants: KADashboardBreakdownRow[];
  clients: KADashboardBreakdownRow[];
};

export type KADashboardOverviewResult = {
  stats: KADashboardStats;
  revenue: KADashboardRevenueResult;
  kamMonthly: Array<{ month: string; revenue: number }>;
  clients: KADashboardClientRow[];
  orders: KADashboardOrderRow[];
};

export type KADashboardTabsResult = {
  team: KADashboardKamRow[];
  clients: KADashboardClientRow[];
  orders: KADashboardOrderRow[];
  inactiveClients: number;
};

const emptySummary: KADashboardPaymentSummary = {
  paidRevenue: 0,
  partialRevenue: 0,
  unpaidRevenue: 0,
  consignmentRevenue: 0,
  settlementDiscountRevenue: 0,
  totalRevenue: 0,
};

export const emptyKADashboardRevenue: KADashboardRevenueResult = {
  summary: emptySummary,
  monthlyData: [],
  orders: [],
  payments: [],
  outstandingPaymentOrderCount: 0,
  consignmentOrderCount: 0,
  pendingOrderCount: 0,
};

const emptyStats: KADashboardStats = {
  totalClients: 0,
  totalOrders: 0,
  totalKAMs: 0,
  pendingOrders: 0,
  consignmentOrders: 0,
  inactiveClients: 0,
  totalRevenue: 0,
};

type KADashboardState = {
  overviewYear: number | null;
  overview: KADashboardOverviewResult | null;
  overviewStatus: QueryStatus;
  overviewError: string | null;

  tabsDateStart: string | null;
  tabsDateEnd: string | null;
  tabs: KADashboardTabsResult | null;
  tabsStatus: QueryStatus;
  tabsError: string | null;

  breakdownDateStart: string | null;
  breakdownDateEnd: string | null;
  brands: KADashboardBrandBreakdown[];
  breakdownStatus: QueryStatus;
  breakdownError: string | null;
};

const initialState: KADashboardState = {
  overviewYear: null,
  overview: null,
  overviewStatus: 'idle',
  overviewError: null,

  tabsDateStart: null,
  tabsDateEnd: null,
  tabs: null,
  tabsStatus: 'idle',
  tabsError: null,

  breakdownDateStart: null,
  breakdownDateEnd: null,
  brands: [],
  breakdownStatus: 'idle',
  breakdownError: null,
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

export const fetchKADashboardOverview = createAsyncThunk(
  'kaDashboard/fetchOverview',
  (year: number) =>
    kaRequest<KADashboardOverviewResult>('dashboard', {
      params: { resource: 'overview', year: String(year) },
    })
);

export const fetchKADashboardTabs = createAsyncThunk(
  'kaDashboard/fetchTabs',
  (args: { dateStart?: string; dateEnd?: string }) =>
    kaRequest<KADashboardTabsResult>('dashboard', {
      params: {
        resource: 'tabs',
        dateStart: args.dateStart,
        dateEnd: args.dateEnd,
      },
    })
);

export const fetchKADashboardPurchaseBreakdown = createAsyncThunk(
  'kaDashboard/fetchPurchaseBreakdown',
  (args: { dateStart?: string; dateEnd?: string }) =>
    kaRequest<{ brands: KADashboardBrandBreakdown[] }>('dashboard', {
      params: {
        resource: 'purchase-breakdown',
        dateStart: args.dateStart,
        dateEnd: args.dateEnd,
      },
    })
);

const kaDashboardSlice = createSlice({
  name: 'kaDashboard',
  initialState,
  reducers: {
    resetKADashboard() {
      return initialState;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchKADashboardOverview.pending, (state, action) => {
        state.overviewStatus = 'loading';
        state.overviewError = null;
        state.overviewYear = action.meta.arg;
      })
      .addCase(fetchKADashboardOverview.fulfilled, (state, action) => {
        state.overviewStatus = 'succeeded';
        state.overview = action.payload;
      })
      .addCase(fetchKADashboardOverview.rejected, (state, action) => {
        state.overviewStatus = 'failed';
        state.overviewError = action.error.message || 'Failed to load dashboard';
        state.overview = null;
      })
      .addCase(fetchKADashboardTabs.pending, (state, action) => {
        state.tabsStatus = 'loading';
        state.tabsError = null;
        state.tabsDateStart = action.meta.arg.dateStart || null;
        state.tabsDateEnd = action.meta.arg.dateEnd || null;
      })
      .addCase(fetchKADashboardTabs.fulfilled, (state, action) => {
        state.tabsStatus = 'succeeded';
        state.tabs = action.payload;
      })
      .addCase(fetchKADashboardTabs.rejected, (state, action) => {
        state.tabsStatus = 'failed';
        state.tabsError = action.error.message || 'Failed to load dashboard tabs';
        state.tabs = null;
      })
      .addCase(fetchKADashboardPurchaseBreakdown.pending, (state, action) => {
        state.breakdownStatus = 'loading';
        state.breakdownError = null;
        state.breakdownDateStart = action.meta.arg.dateStart || null;
        state.breakdownDateEnd = action.meta.arg.dateEnd || null;
      })
      .addCase(fetchKADashboardPurchaseBreakdown.fulfilled, (state, action) => {
        state.breakdownStatus = 'succeeded';
        state.brands = action.payload.brands;
      })
      .addCase(fetchKADashboardPurchaseBreakdown.rejected, (state, action) => {
        state.breakdownStatus = 'failed';
        state.breakdownError = action.error.message || 'Failed to load purchase breakdown';
        state.brands = [];
      });
  },
});

export const { resetKADashboard } = kaDashboardSlice.actions;
export const kaDashboardReducer = kaDashboardSlice.reducer;
