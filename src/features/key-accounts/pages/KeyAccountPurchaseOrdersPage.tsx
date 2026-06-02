import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Eye,
  Check,
  X,
  Send,
  MapPin,
  CreditCard,
  Plus,
  Store,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { PurchaseOrderDeliveryDetailsPanel, keyAccountDeliveryDetailsEnabled } from '@/features/orders/components/PurchaseOrderDeliveryDetailsPanel';
import { KeyAccountPoWarehouseProgress } from '@/features/key-accounts/components/KeyAccountPoWarehouseProgress';
import type { KeyAccountPoPaymentStatus, PurchaseOrderKeyAccountPayment } from '@/types/database.types';
import {
  getKeyAccountPaymentProofSignedUrl,
  uploadKeyAccountPaymentProof,
} from '@/features/key-accounts/kaPaymentProofUpload';
import {
  keyAccountWorkflowBadgeClass,
  keyAccountWorkflowLabel,
} from '@/features/key-accounts/keyAccountWorkflowStatus';
import { KeyAccountShopCorView } from '@/features/key-accounts/components/KeyAccountShopCorView';
import {
  isKeyAccountAccounting,
  isKeyAccountSalesAdmin,
  isKeyAccountSalesHead,
} from '@/features/key-accounts/keyAccountRoles';
import { isDeliveredKeyAccountOrder } from '@/features/key-accounts/key-accounts-analytics/keyAccountAnalyticsShared';
import {
  formatRebateCurrency,
  getRebateReplacementPricingTotals,
  isRebateDerivedPurchaseOrder,
  rebateReplacementOrderTotalLabel,
  rebateStatusBadgeClass,
  rebateStatusLabel,
  RebateReplacementPricingSummary,
} from '@/features/key-accounts/rebates';

type KeyAccountWorkflowStatus =
  | 'kam_pending'
  | 'director_pending'
  | 'admin_pending'
  | 'approved'
  | 'rejected'
  | 'warehouse_reserved'
  | 'fulfilled'
  | 'partial_delivered'
  | 'delivered';

type Row = {
  id: string;
  po_number: string;
  company_id: string;
  company_account_type?: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  workflow_status: KeyAccountWorkflowStatus;
  status: string;
  order_date: string;
  expected_delivery_date?: string | null;
  total_amount: number;
  subtotal?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  discount?: number | null;
  kam_id?: string | null;
  rfpf_number?: string | null;
  dr_number?: string | null;
  key_account_client_id?: string | null;
  warehouse_location_id?: string | null;
  warehouse_location?: { name: string } | null;
  director_approved_at?: string | null;
  director_approved_by?: string | null;
  admin_approved_at?: string | null;
  admin_approved_by?: string | null;
  created_by?: string | null;
  key_account_shop_id?: string | null;
  key_account_address_id?: string | null;
  key_account_payment_terms?: string | null;
  key_account_payment_mode?: 'full' | 'split' | null;
  key_account_payment_status?: KeyAccountPoPaymentStatus | null;
  client?: { client_name: string } | null;
  shop?: { shop_name: string; cor_pdf_path?: string | null } | null;
  address?: {
    address_label: string;
    full_address: string;
    city: string;
    province: string;
    zip_code: string;
    contact_name: string;
    contact_phone: string;
    is_default: boolean;
  } | null;
  kam?: { full_name: string; email: string } | null;
  items?: Array<{
    id: string;
    variant_id: string;
    warehouse_location_id?: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
    warehouse_locations?: { name: string } | { name: string }[] | null;
    variants?: { name: string; variant_type: string; brands?: { name: string } | null } | null;
  }>;
};

type TabKey = 'pending' | 'rebates' | 'warehouse' | 'done' | 'my' | 'all';

const PO_PER_PAGE = 10;

type PoItemRow = NonNullable<Row['items']>[number];

function resolveWarehouseLocationName(
  loc: { name: string } | { name: string }[] | null | undefined
): string | null {
  if (!loc) return null;
  const row = Array.isArray(loc) ? loc[0] : loc;
  return row?.name?.trim() || null;
}

function itemWarehouseName(
  it: PoItemRow,
  namesById: Record<string, string>,
  poHeaderLocationId?: string | null
): string {
  const fromJoin = resolveWarehouseLocationName(it.warehouse_locations);
  if (fromJoin) return fromJoin;
  const locId = it.warehouse_location_id || poHeaderLocationId || null;
  if (locId && namesById[locId]) return namesById[locId];
  return '—';
}

function createInitialTabPages(): Record<TabKey, number> {
  return { pending: 1, rebates: 1, warehouse: 1, done: 1, my: 1, all: 1 };
}

function paymentStatusBadgeClass(s: string | null | undefined) {
  switch (s) {
    case 'paid':
      return 'bg-emerald-600 text-white';
    case 'partial':
      return 'bg-amber-500 text-white';
    default:
      return 'bg-slate-500 text-white';
  }
}

/** Key Account POs with payment tracking that are not fully paid (unpaid or partial). */
function isKeyAccountPaymentNotComplete(po: {
  key_account_payment_mode?: string | null;
  key_account_payment_status?: string | null;
}): boolean {
  if (!po.key_account_payment_mode) return false;
  return po.key_account_payment_status !== 'paid';
}

export function KeyAccountPurchaseOrdersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'all',
  });

  const orderDateRange = useMemo(() => {
    return getDateRangeFromPreset(
      dateRangeFilter.preset,
      dateRangeFilter.customStart,
      dateRangeFilter.customEnd
    );
  }, [dateRangeFilter]);

  const [viewOpen, setViewOpen] = useState(false);
  const [active, setActive] = useState<Row | null>(null);

  const [actingId, setActingId] = useState<string | null>(null);
  const [rfpfDraft, setRfpfDraft] = useState('');

  const [payments, setPayments] = useState<
    (PurchaseOrderKeyAccountPayment & { recorder?: { full_name: string | null; email: string | null } | null })[]
  >([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [directorKamIds, setDirectorKamIds] = useState<Set<string>>(new Set());

  const [recordPayOpen, setRecordPayOpen] = useState(false);
  const [newPayAmount, setNewPayAmount] = useState('');
  const [newPayMethod, setNewPayMethod] = useState<'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE'>('BANK_TRANSFER');
  const [newPayBank, setNewPayBank] = useState<'Unionbank' | 'BPI' | 'PBCOM'>('BPI');
  const [newPayFile, setNewPayFile] = useState<File | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [paymentSummaryPaid, setPaymentSummaryPaid] = useState<number | null>(null);
  const [paymentSummaryLoading, setPaymentSummaryLoading] = useState(false);
  const [linkedWarehouseNamesById, setLinkedWarehouseNamesById] = useState<Record<string, string>>({});
  const [paymentEntryCount, setPaymentEntryCount] = useState(0);
  const [tabPages, setTabPages] = useState<Record<TabKey, number>>(createInitialTabPages);
  const [poRebates, setPoRebates] = useState<
    { id: string; rebate_number: string; status: string; disputed_total: number; resolution_type: string }[]
  >([]);
  const [poRebatesLoading, setPoRebatesLoading] = useState(false);
  const [rebateSource, setRebateSource] = useState<{
    rebate_number: string;
    source_po_number: string;
    disputed_total: number;
    replacement_total: number;
  } | null>(null);

  const role = user?.role;
  const isKAM = role === 'key_account_manager';
  const isDirector = role === 'sales_director';
  const isSalesHead = isKeyAccountSalesHead(role);
  const isSalesAdmin = isKeyAccountSalesAdmin(role);
  const isReadOnlyAccounting = isKeyAccountAccounting(role);

  const canDirectorApprove = (po: Row) =>
    isDirector && (po.workflow_status === 'director_pending' || po.workflow_status === 'kam_pending');
  const canSalesAdminReview = (po: Row) => isSalesAdmin && po.workflow_status === 'admin_pending';

  /** RFPF is persisted only after the PO reaches `warehouse_reserved` (see sales admin actions below). */
  const canSaveRfpf = (po: Row) => isSalesAdmin && po.workflow_status === 'warehouse_reserved';

  const canSubmitToWarehouse = (po: Row) =>
    isSalesAdmin && po.workflow_status === 'admin_pending';

  const isCreatedByCurrentUser = (po: Row) => po.created_by === user?.id;
  const isPendingWorkflow = (po: Row) =>
    po.workflow_status === 'kam_pending' ||
    po.workflow_status === 'director_pending' ||
    po.workflow_status === 'admin_pending';
  const isWarehouseWorkflow = (po: Row) =>
    po.workflow_status === 'warehouse_reserved' ||
    po.status === 'approved_for_fulfillment' ||
    po.status === 'approved' ||
    po.status === 'partially_fulfilled';
  const isDoneWorkflow = (po: Row) =>
    po.workflow_status === 'fulfilled' ||
    po.workflow_status === 'partial_delivered' ||
    po.workflow_status === 'delivered' ||
    po.status === 'fulfilled';

  const paidTotalForPayments = (list: typeof payments) =>
    list.reduce((s, p) => s + Number(p.amount || 0), 0);

  async function loadPaymentSummary(poId: string) {
    setPaymentSummaryLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_order_key_account_payments')
        .select('amount')
        .eq('purchase_order_id', poId);
      if (error) throw error;
      const rows = data || [];
      const paid = rows.reduce((s: number, r: { amount: number }) => s + Number(r.amount || 0), 0);
      setPaymentSummaryPaid(paid);
      setPaymentEntryCount(rows.length);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading payment summary',
        description: e?.message || 'Failed to load payment totals',
      });
      setPaymentSummaryPaid(0);
      setPaymentEntryCount(0);
    } finally {
      setPaymentSummaryLoading(false);
    }
  }

  const canRecordRemainingPayment = (po: Row | null) => {
    if (!po || !user?.id) return false;
    if (!po.key_account_payment_mode) return false;
    const payStatus = String(po.key_account_payment_status || 'unpaid');
    if (!(payStatus === 'partial' || payStatus === 'unpaid')) return false;
    if (
      ![
        'kam_pending',
        'director_pending',
        'admin_pending',
        'approved',
        'warehouse_reserved',
        'fulfilled',
        'partial_delivered',
        'delivered',
      ].includes(po.workflow_status)
    )
      return false;
    const actorOk =
      po.created_by === user.id ||
      isSalesAdmin ||
      isSalesHead ||
      (isDirector && !!po.kam_id && directorKamIds.has(po.kam_id));
    return actorOk;
  };

  const loadPayments = async (poId: string) => {
    setPaymentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_order_key_account_payments')
        .select(
          `
          *,
          recorder:profiles!purchase_order_key_account_payments_recorded_by_fkey(full_name,email)
        `
        )
        .eq('purchase_order_id', poId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setPayments((data as any) || []);
      setPaymentSummaryPaid(paidTotalForPayments((data as any) || []));
      setPaymentEntryCount(((data as any) || []).length);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading payments',
        description: e?.message || 'Failed to load payment history',
      });
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const fetchRows = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // RLS controls broad role access. KAMs are further scoped to only POs they created.
      let query = supabase
        .from('purchase_orders')
        .select(
          `
          id,
          po_number,
          company_id,
          company_account_type,
          po_order_kind,
          source_rebate_id,
          workflow_status,
          status,
          order_date,
          expected_delivery_date,
          total_amount,
          subtotal,
          tax_rate,
          tax_amount,
          discount,
          kam_id,
          rfpf_number,
          dr_number,
          key_account_payment_terms,
          key_account_payment_mode,
          key_account_payment_status,
          director_approved_at,
          director_approved_by,
          admin_approved_at,
          admin_approved_by,
          created_by,
          warehouse_location_id,
          warehouse_location:warehouse_locations(name),
          key_account_client_id,
          key_account_shop_id,
          key_account_address_id,
          client:key_account_clients(client_name),
          shop:key_account_shops(shop_name, cor_pdf_path),
          address:key_account_delivery_addresses(address_label,full_address,city,province,zip_code,contact_name,contact_phone,is_default),
          kam:profiles!purchase_orders_kam_id_fkey(full_name,email)
        `
        )
        .eq('company_account_type', 'Key Accounts')
        .order('created_at', { ascending: false });

      if (isKAM) {
        query = query.eq('created_by', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRows((data as any) || []);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading Key Account POs',
        description: e?.message || 'Failed to load purchase orders',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, user?.company_id]);

  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_linked_warehouse_locations');
      if (cancelled || error) return;
      const map: Record<string, string> = {};
      for (const row of (data as { id: string; name: string }[]) || []) {
        if (row?.id && row?.name) map[row.id] = row.name;
      }
      setLinkedWarehouseNamesById(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.company_id]);

  useEffect(() => {
    setTabPages(createInitialTabPages());
  }, [q, orderDateRange.start, orderDateRange.end]);

  useEffect(() => {
    if (!user?.id || user.role !== 'sales_director') {
      setDirectorKamIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('kam_director_assignments')
        .select('kam_id')
        .eq('director_id', user.id);
      if (error || cancelled) return;
      setDirectorKamIds(new Set((data || []).map((r: { kam_id: string }) => r.kam_id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role]);

  const filtered = useMemo(() => {
    const dateFiltered = rows.filter((r) => {
      // `purchase_orders.order_date` is typically an ISO timestamp.
      // Pass a Date object so `isDateInRange` doesn't assume YYYY-MM-DD input.
      return isDateInRange(new Date(r.order_date), orderDateRange.start, orderDateRange.end);
    });
    const query = q.trim().toLowerCase();
    if (!query) return dateFiltered;
    return dateFiltered.filter((r) => {
      const po = (r.po_number || '').toLowerCase();
      const client = (r.client?.client_name || '').toLowerCase();
      const shop = (r.shop?.shop_name || '').toLowerCase();
      const ws = (r.workflow_status || '').toLowerCase();
      const dr = (r.dr_number || '').toLowerCase();
      const rf = (r.rfpf_number || '').toLowerCase();
      const paymentStatus = String(r.key_account_payment_status || 'unpaid')
        .toLowerCase()
        .replace(/_/g, ' ');
      const paymentMode = (r.key_account_payment_mode || '').toLowerCase();
      return [po, client, shop, ws, dr, rf, paymentStatus, paymentMode].some((x) =>
        x.includes(query)
      );
    });
  }, [rows, q, orderDateRange.end, orderDateRange.start]);

  const byTab = useMemo(() => {
    const myRows = filtered.filter(isCreatedByCurrentUser);
    const rebateRows = filtered.filter((r) => String(r.po_order_kind || '') === 'rebate_fulfillment');

    // Workflow tabs use the full filtered list so a director's own POs still appear
    // under Pending / Warehouse / Done (My PO remains a separate "created by me" view).
    return {
      pending: filtered.filter(isPendingWorkflow),
      rebates: rebateRows,
      warehouse: filtered.filter(isWarehouseWorkflow),
      done: filtered.filter(isDoneWorkflow),
      my: myRows,
      all: filtered,
    };
  }, [filtered, user?.id]);

  const visibleTabs = useMemo<Array<{ value: TabKey; label: string }>>(
    () => [
      { value: 'pending', label: 'Pending' },
      { value: 'rebates', label: 'Rebate' },
      { value: 'warehouse', label: 'Warehouse' },
      { value: 'done', label: 'Done' },
      ...(isDirector ? [{ value: 'my' as TabKey, label: 'My PO' }] : []),
      { value: 'all', label: 'All' },
    ],
    [isDirector]
  );

  const openView = async (po: Row) => {
    setActive(po);
    setRfpfDraft(po.rfpf_number || '');
    setViewOpen(true);
    setRebateSource(null);
    setRecordPayOpen(false);
    setNewPayAmount('');
    setNewPayMethod('BANK_TRANSFER');
    setNewPayBank('BPI');
    setNewPayFile(null);
    setPayments([]);
    setPaymentHistoryOpen(false);
    setPaymentSummaryPaid(null);
    setPaymentEntryCount(0);
    if (po.key_account_payment_mode) void loadPaymentSummary(po.id);

    try {
      const { data: items, error } = await supabase
        .from('purchase_order_items')
        .select(
          `
          id,
          variant_id,
          warehouse_location_id,
          quantity,
          unit_price,
          total_price,
          variants (
            name,
            variant_type,
            brands ( name )
          )
        `
        )
        .eq('purchase_order_id', po.id);
      if (error) throw error;
      setActive((prev) => (prev ? { ...prev, items: (items as any) || [] } : prev));
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading PO items',
        description: e?.message || 'Failed to load items',
      });
    }

    if (String(po.po_order_kind || '') === 'rebate_fulfillment' && po.source_rebate_id) {
      try {
        const { data, error } = await supabase
          .from('key_account_po_rebates')
          .select(
            'rebate_number, disputed_total, replacement_total, source_po:purchase_orders!key_account_po_rebates_purchase_order_id_fkey(po_number)'
          )
          .eq('id', po.source_rebate_id)
          .maybeSingle();
        if (!error && data) {
          const src = (data as any).source_po;
          const poNum = Array.isArray(src) ? src?.[0]?.po_number : src?.po_number;
          if (poNum) {
            setRebateSource({
              rebate_number: (data as any).rebate_number,
              source_po_number: poNum,
              disputed_total: Number((data as any).disputed_total) || 0,
              replacement_total: Number((data as any).replacement_total) || 0,
            });
          }
        }
      } catch {
        setRebateSource(null);
      }
    }

    if (isDoneWorkflow(po)) {
      setPoRebatesLoading(true);
      try {
        if (isDeliveredKeyAccountOrder(po)) {
          const { data: rebateRows, error: rebateErr } = await supabase
            .from('key_account_po_rebates')
            .select('id, rebate_number, status, disputed_total, resolution_type')
            .eq('purchase_order_id', po.id)
            .order('created_at', { ascending: false });
          if (rebateErr) throw rebateErr;
          setPoRebates(rebateRows || []);
        } else {
          setPoRebates([]);
        }
      } catch {
        setPoRebates([]);
      } finally {
        setPoRebatesLoading(false);
      }
    } else {
      setPoRebates([]);
    }
  };

  const updateWorkflow = async (poId: string, patch: Partial<Row>) => {
    setActingId(poId);
    try {
      const { error } = await supabase.from('purchase_orders').update(patch).eq('id', poId);
      if (error) throw error;
      await fetchRows();
      setViewOpen(false);
      setActive(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: e?.message || 'Failed to update PO' });
    } finally {
      setActingId(null);
    }
  };

  const directorApprove = async () => {
    if (!active || !user?.id) return;
    await updateWorkflow(active.id, {
      workflow_status: 'admin_pending',
      director_approved_at: new Date().toISOString(),
      director_approved_by: user.id,
    } as any);
  };

  const directorReject = async () => {
    if (!active || !user?.id) return;
    await updateWorkflow(active.id, {
      workflow_status: 'rejected',
      status: 'rejected',
      director_approved_at: new Date().toISOString(),
      director_approved_by: user.id,
    } as any);
  };

  const salesAdminSaveRfpf = async () => {
    if (!active) return;
    if (active.workflow_status !== 'warehouse_reserved') {
      toast({
        variant: 'destructive',
        title: 'Cannot save RFPF yet',
        description: 'Submit this PO to the warehouse queue first. RFPF can only be saved once workflow status is Warehouse reserved.',
      });
      return;
    }
    const rfpf = rfpfDraft.trim();
    if (!rfpf) {
      toast({ variant: 'destructive', title: 'RFPF required', description: 'Enter the RFPF number to save.' });
      return;
    }
    setActingId(active.id);
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ rfpf_number: rfpf } as any)
        .eq('id', active.id)
        .eq('workflow_status', 'warehouse_reserved');
      if (error) throw error;
      await fetchRows();
      setActive((prev) => (prev ? { ...prev, rfpf_number: rfpf } : prev));
      toast({ title: 'RFPF saved' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e?.message || 'Failed to save RFPF' });
    } finally {
      setActingId(null);
    }
  };

  const salesAdminSubmitToWarehouse = async () => {
    if (!active || !user?.id) return;

    // Release to warehouse queue first; RFPF is entered and saved only after `warehouse_reserved`.
    // Keep `status` as pending so the existing Warehouse inbox can approve it.
    await updateWorkflow(active.id, {
      workflow_status: 'warehouse_reserved',
      admin_approved_at: new Date().toISOString(),
      admin_approved_by: user.id,
      custom_pricing_confirmed: true,
      status: 'pending',
    } as any);
  };

  const submitRemainingPayment = async () => {
    if (!active || !user?.company_id) return;
    const paidSoFar =
      paymentSummaryPaid !== null ? paymentSummaryPaid : paidTotalForPayments(payments);
    const remaining = Math.round((Number(active.total_amount) - paidSoFar) * 100) / 100;
    const raw = parseFloat(String(newPayAmount).replace(/,/g, ''));
    const amt = Math.round(raw * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ variant: 'destructive', title: 'Amount', description: 'Enter a valid payment amount.' });
      return;
    }
    if (amt > remaining + 0.0001) {
      toast({
        variant: 'destructive',
        title: 'Amount too high',
        description: `Remaining balance is ₱${remaining.toFixed(2)}.`,
      });
      return;
    }
    if (newPayMethod === 'BANK_TRANSFER' && !newPayBank) {
      toast({ variant: 'destructive', title: 'Bank required', description: 'Select a bank.' });
      return;
    }
    setSavingPayment(true);
    try {
      let proofPath: string | null = null;
      if (newPayFile) {
        try {
          proofPath = await uploadKeyAccountPaymentProof(user.company_id, active.id, newPayFile);
        } catch (upErr: any) {
          toast({
            variant: 'destructive',
            title: 'Proof upload failed',
            description: upErr?.message || 'Continuing without proof.',
          });
        }
      }
      const { error } = await supabase.from('purchase_order_key_account_payments').insert({
        purchase_order_id: active.id,
        company_id: user.company_id,
        amount: amt,
        payment_method: newPayMethod,
        bank_type: newPayMethod === 'BANK_TRANSFER' ? newPayBank : null,
        proof_storage_path: proofPath,
      });
      if (error) throw error;
      toast({ title: 'Payment recorded' });
      setRecordPayOpen(false);
      setNewPayAmount('');
      setNewPayFile(null);
      await loadPaymentSummary(active.id);
      if (paymentHistoryOpen) {
        await loadPayments(active.id);
      } else {
        setPayments([]);
      }
      const { data: poRow } = await supabase
        .from('purchase_orders')
        .select('key_account_payment_status')
        .eq('id', active.id)
        .maybeSingle();
      if (poRow) {
        setActive((prev) =>
          prev ? { ...prev, key_account_payment_status: (poRow as any).key_account_payment_status } : prev
        );
      }
      await fetchRows();
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Payment failed',
        description: e?.message || 'Could not save payment',
      });
    } finally {
      setSavingPayment(false);
    }
  };

  const openPaymentProof = async (path: string | null | undefined) => {
    if (!path) return;
    try {
      const url = await getKeyAccountPaymentProofSignedUrl(path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not open proof',
        description: e?.message || 'Signed URL failed',
      });
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {isKAM ? 'My Purchase Orders' : 'Key Account Purchase Orders'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isKAM
              ? 'Track the Key Account POs you created.'
              : isDirector
                ? 'Review assigned KAM POs, or open My PO for orders you created.'
                : isSalesAdmin
                  ? 'Final review: submit to warehouse.'
                  : isSalesHead
                    ? 'Create POs for admin review; Sales Admin submits to warehouse.'
                    : isReadOnlyAccounting
                      ? 'View purchase orders, delivery, dispatch, and payment history.'
                      : 'Purchase Orders'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center">
          <Input
            placeholder="Search PO / client / workflow / payment / DR / RFPF…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full sm:w-[360px]"
          />
          <DateRangeFilterPopover
            value={dateRangeFilter}
            onChange={setDateRangeFilter}
            triggerClassName="w-full sm:w-[220px] justify-between h-10 shrink-0"
            align="end"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{byTab.pending.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">In Warehouse</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{byTab.warehouse.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Delivered/Fulfilled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{byTab.done.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="w-full justify-between gap-1 px-4 sm:gap-2 md:gap-4 overflow-x-auto">
          {visibleTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="px-8 sm:px-4">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {visibleTabs.map((tab) => {
          const tabRows = byTab[tab.value];
          const totalPages = Math.max(1, Math.ceil(tabRows.length / PO_PER_PAGE));
          const currentPage = Math.min(Math.max(1, tabPages[tab.value]), totalPages);
          const paginatedRows = tabRows.slice(
            (currentPage - 1) * PO_PER_PAGE,
            currentPage * PO_PER_PAGE
          );

          return (
          <TabsContent key={tab.value} value={tab.value}>
            <Card>
              <CardContent className="pt-6">
                <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Shop</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment status</TableHead>
                      <TableHead>DR</TableHead>
                      <TableHead>RFPF</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          No purchase orders found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedRows.map((po: Row) => (
                        <TableRow key={po.id}>
                        <TableCell className="font-mono font-medium">
                          <div className="flex items-center gap-2">
                            <span>{po.po_number}</span>
                            {String(po.po_order_kind || '') === 'rebate_fulfillment' ? (
                              <Badge variant="secondary" className="text-xs font-normal">
                                Rebate replacement
                              </Badge>
                            ) : String(po.po_order_kind || '') === 'rebate_topup' ? (
                              <Badge variant="secondary" className="text-xs font-normal">
                                Rebate top-up
                              </Badge>
                            ) : null}

                            {isKeyAccountPaymentNotComplete(po) ? (
                              <span
                                className="relative -top-2 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-sm ring-2 ring-red-500/25"
                                title="Payment not complete"
                                aria-label="Payment not fully paid"
                              />
                            ) : null}
                          </div>
                        </TableCell>
                          <TableCell>{po.client?.client_name || '—'}</TableCell>
                          <TableCell>{po.shop?.shop_name || '—'}</TableCell>
                          <TableCell>
                            <Badge className={keyAccountWorkflowBadgeClass(po.workflow_status)}>
                              {keyAccountWorkflowLabel(po.workflow_status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {po.key_account_payment_mode ? (
                              <Badge className={paymentStatusBadgeClass(po.key_account_payment_status || 'unpaid')}>
                                {String(po.key_account_payment_status || 'unpaid').replace(/_/g, ' ')}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{po.dr_number || '—'}</TableCell>
                          <TableCell className="font-medium">{po.rfpf_number || '—'}</TableCell>
                          <TableCell className="text-right font-semibold">₱{Number(po.total_amount || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">

                              <Button variant="ghost" size="sm" onClick={() => void openView(po)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>

                {tabRows.length > PO_PER_PAGE && (
                  <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
                    <div className="text-xs text-muted-foreground">
                      Showing{' '}
                      <span className="font-medium">
                        {(currentPage - 1) * PO_PER_PAGE + 1}-
                        {Math.min(currentPage * PO_PER_PAGE, tabRows.length)}
                      </span>{' '}
                      of <span className="font-medium">{tabRows.length}</span> purchase orders
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setTabPages((prev) => ({
                            ...prev,
                            [tab.value]: Math.max(1, currentPage - 1),
                          }))
                        }
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Prev
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setTabPages((prev) => ({
                            ...prev,
                            [tab.value]: Math.min(totalPages, currentPage + 1),
                          }))
                        }
                        disabled={currentPage === totalPages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          );
        })}
      </Tabs>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-full max-w-4xl max-h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
          <DialogHeader className="shrink-0 px-4 pt-4 pb-2 sm:px-6 sm:pt-6">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
              {active && isKeyAccountPaymentNotComplete(active) ? (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-sm ring-2 ring-red-500/25"
                  title="Payment not complete"
                  aria-label="Payment not fully paid"
                />
              ) : null}
              <span>Key Account PO Details</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6">
            {active ? (
              <div className="space-y-5 pb-6">
                <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">PO Number</div>
                    <div className="text-xl font-bold font-mono break-all sm:text-2xl flex flex-wrap items-center gap-2">
                      <span>{active.po_number}</span>
                      {String(active.po_order_kind || '') === 'rebate_fulfillment' ? (
                        <Badge variant="secondary">Rebate replacement</Badge>
                      ) : String(active.po_order_kind || '') === 'rebate_topup' ? (
                        <Badge variant="secondary">Rebate top-up</Badge>
                      ) : null}
                    </div>
                    {rebateSource ? (
                      <>
                        <div className="text-xs text-muted-foreground">Source PO</div>
                        <div className="text-lg font-bold font-mono break-all">
                          {rebateSource.source_po_number}{' '}
                          <Badge variant="outline" className="ml-2 align-middle">
                            {rebateSource.rebate_number}
                          </Badge>
                        </div>
                      </>
                    ) : null}
                    <div className="text-xs text-muted-foreground">RFPF Number</div>
                    <div className="text-lg font-bold font-mono">{active.rfpf_number?.toUpperCase() || '—'}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {active.client?.client_name || '—'} · {active.shop?.shop_name || '—'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Badge className={keyAccountWorkflowBadgeClass(active.workflow_status)}>
                      {keyAccountWorkflowLabel(active.workflow_status)}
                    </Badge>
                    {active.dr_number ? (
                      <Badge variant="secondary">DR: {active.dr_number}</Badge>
                    ) : active.workflow_status === 'partial_delivered' ? (
                      <Badge variant="outline">Partial delivery</Badge>
                    ) : null}
                  </div>
                </div>

                <KeyAccountPoWarehouseProgress
                  purchaseOrderId={active.id}
                  workflowStatus={active.workflow_status}
                  fulfillmentType="warehouse_transfer"
                />

                {isDoneWorkflow(active) && (
                  <Card className="border-dashed">
                    <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Rebates
                      </CardTitle>
                      {isDeliveredKeyAccountOrder(active) &&
                        !isRebateDerivedPurchaseOrder(active) &&
                        !isReadOnlyAccounting && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setViewOpen(false);
                            navigate(`/key-accounts/rebates/new?poId=${active.id}`);
                          }}
                        >
                          Create rebate
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="text-sm">
                      {isDeliveredKeyAccountOrder(active) ? (
                        poRebatesLoading ? (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading rebates…
                          </div>
                        ) : poRebates.length === 0 ? (
                          <p className="text-muted-foreground">
                            No rebates on this PO yet. Use Create rebate for client complaints (slow moving, quality, etc.).
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {poRebates.map((r) => (
                              <div
                                key={r.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                              >
                                <span className="font-mono font-medium">{r.rebate_number}</span>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-muted-foreground capitalize">{r.resolution_type}</span>
                                  <span>{formatRebateCurrency(r.disputed_total)}</span>
                                  <Badge variant="outline" className={rebateStatusBadgeClass(r.status)}>
                                    {rebateStatusLabel(r.status)}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                            <Button
                              variant="link"
                              className="px-0 h-auto"
                              onClick={() => {
                                setViewOpen(false);
                                navigate('/key-accounts/rebates');
                              }}
                            >
                              View all rebates
                            </Button>
                          </div>
                        )
                      ) : (
                        <p className="text-muted-foreground">
                          Rebates are available after warehouse completes dispatch and this PO is marked{' '}
                          <span className="font-medium text-foreground">Delivered</span>. Current status:{' '}
                          <span className="font-medium">{keyAccountWorkflowLabel(active.workflow_status)}</span>.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="grid grid-cols-2 sm:grid-cols-subgrid sm:col-span-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Order date</Label>
                      <div className="font-medium">{new Date(active.order_date).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Expected</Label>
                      <div className="font-medium">
                        {active.expected_delivery_date ? new Date(active.expected_delivery_date).toLocaleDateString() : '—'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Created By</Label>
                    <div className="font-medium">{active.kam?.full_name || '—'}</div>
                    <div className="text-xs text-muted-foreground">{active.kam?.email || ''}</div>
                  </div>
                </div>

                {active.key_account_payment_mode ? (
                  <Card>
                    <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Payment
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {active.key_account_payment_mode}
                        </Badge>
                        <Badge className={paymentStatusBadgeClass(active.key_account_payment_status || 'unpaid')}>
                          {String(active.key_account_payment_status || 'unpaid')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Terms</Label>
                        <p className="text-sm font-medium whitespace-pre-wrap">
                          {active.key_account_payment_terms || '—'}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">
                            {rebateReplacementOrderTotalLabel(
                              getRebateReplacementPricingTotals(active, rebateSource)
                            )}
                          </span>
                          <div className="font-semibold">₱{Number(active.total_amount || 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Paid to date</span>
                          <div className="font-semibold">
                            {paymentSummaryLoading ? (
                              <span className="inline-flex items-center gap-2 text-muted-foreground font-normal">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                …
                              </span>
                            ) : (
                              `₱${(paymentSummaryPaid ?? 0).toFixed(2)}`
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Remaining</span>
                          <div className="font-semibold">
                            ₱
                            {paymentSummaryLoading
                              ? '…'
                              : Math.max(
                                  0,
                                  Math.round(
                                    (Number(active.total_amount) - (paymentSummaryPaid ?? 0)) * 100
                                  ) / 100
                                ).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {canRecordRemainingPayment(active) && !isReadOnlyAccounting && (
                        <Button type="button" variant="default" size="sm" onClick={() => setRecordPayOpen(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          {String(active.key_account_payment_status || 'unpaid') === 'unpaid'
                            ? 'Record payment'
                            : 'Record remaining payment'}
                        </Button>
                      )}

                      <Collapsible
                        open={paymentHistoryOpen}
                        onOpenChange={(next) => {
                          setPaymentHistoryOpen(next);
                          if (next && active?.id) void loadPayments(active.id);
                        }}
                      >
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full justify-between gap-2">
                            <span>View payment history</span>
                            <span className="flex items-center gap-2 text-xs text-muted-foreground font-normal tabular-nums">
                              {paymentEntryCount > 0
                                ? `${paymentEntryCount} entr${paymentEntryCount === 1 ? 'y' : 'ies'}`
                                : null}
                              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
                            </span>
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-3 space-y-3 data-[state=closed]:animate-none">
                          {paymentsLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading…
                            </div>
                          ) : payments.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No payment rows yet.</p>
                          ) : (
                            <div className="rounded-md border overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead>Recorded by</TableHead>
                                    <TableHead>Proof</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {payments.map((p) => (
                                    <TableRow key={p.id}>
                                      <TableCell className="text-sm whitespace-nowrap">
                                        {new Date(p.created_at).toLocaleString()}
                                      </TableCell>
                                      <TableCell className="text-right font-medium tabular-nums">
                                        ₱{Number(p.amount).toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {p.payment_method}
                                        {p.bank_type ? ` · ${p.bank_type}` : ''}
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {(p as any).recorder?.full_name || '—'}
                                      </TableCell>
                                      <TableCell>
                                        {p.proof_storage_path ? (
                                          <Button
                                            type="button"
                                            variant="link"
                                            className="h-auto p-0"
                                            onClick={() => void openPaymentProof(p.proof_storage_path)}
                                          >
                                            View
                                          </Button>
                                        ) : (
                                          <span className="text-muted-foreground text-sm">—</span>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            Proof files open in a new tab via a short-lived signed URL.
                          </p>
                        </CollapsibleContent>
                      </Collapsible>
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/30">
                    This PO was created before payment tracking. No payment ledger is attached.
                  </p>
                )}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Store className="h-4 w-4" />
                      Shop
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm font-medium">{active.shop?.shop_name || '—'}</p>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        COR (Certificate of Registration)
                      </Label>
                      <div className="mt-1.5">
                        <KeyAccountShopCorView corPdfPath={active.shop?.cor_pdf_path} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Delivery Address */}
                <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Delivery Address
                      </CardTitle>
                    </CardHeader>

                    <CardContent>
                      {active.address ? (
                        <div className="space-y-4">
                          {/* Top Section - 2 Columns */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            
                            {/* Left Side - Address */}
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {active.address.address_label}
                                </span>

                                {active.address.is_default && (
                                  <Badge variant="secondary" className="text-xs">
                                    Default
                                  </Badge>
                                )}
                              </div>

                              <p className="text-sm text-muted-foreground font-medium">
                                {active.address.full_address}
                              </p>

                              <p className="text-sm text-muted-foreground font-medium">
                                {active.address.city}, {active.address.province}{" "}
                                {active.address.zip_code}
                              </p>
                            </div>

                            {/* Right Side - Contact Info */}
                            <div className="space-y-2">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Contact Name
                                </p>
                                <p className="text-sm font-medium">
                                  {active.address.contact_name}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Contact Phone
                                </p>
                                <p className="text-sm font-medium">
                                  {active.address.contact_phone}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">
                          No delivery address specified.
                        </p>
                      )}
                    </CardContent>
                </Card>

                {active && keyAccountDeliveryDetailsEnabled(active) && (
                  <PurchaseOrderDeliveryDetailsPanel
                    purchaseOrderId={active.id}
                    enabled
                    warehouseNamesById={linkedWarehouseNamesById}
                  />
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {active.items ? (
                      <div className="w-full overflow-x-auto rounded-md border">
                        <Table className="min-w-[720px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="whitespace-nowrap">Brand</TableHead>
                            <TableHead className="whitespace-nowrap">Variant</TableHead>
                            <TableHead className="whitespace-nowrap">Warehouse</TableHead>
                            <TableHead className="whitespace-nowrap">Type</TableHead>
                            <TableHead className="text-right whitespace-nowrap">Qty</TableHead>
                            <TableHead className="text-right whitespace-nowrap">Unit</TableHead>
                            <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {active.items.map((it) => (
                            <TableRow key={it.id}>
                              <TableCell className="font-medium whitespace-nowrap">{it.variants?.brands?.name || '—'}</TableCell>
                              <TableCell className="whitespace-nowrap">{it.variants?.name || it.variant_id}</TableCell>
                              <TableCell className="text-sm whitespace-nowrap">
                                {itemWarehouseName(it, linkedWarehouseNamesById, active.warehouse_location_id)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{it.variants?.variant_type || '—'}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{it.quantity}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">₱{Number(it.unit_price || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right font-semibold whitespace-nowrap">₱{Number(it.total_price || 0).toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      </div>
                    ) : (
                      <div className="py-6 text-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                        Loading items…
                      </div>
                    )}
                  </CardContent>
                </Card>

                <RebateReplacementPricingSummary order={active} rebate={rebateSource} />

                {isSalesAdmin && (
                  <Card>

                    <CardContent className="space-y-3">
                      {canSalesAdminReview(active) && (
                        <>
                          <Button
                            onClick={() => void salesAdminSubmitToWarehouse()}
                            disabled={!canSubmitToWarehouse(active) || actingId === active.id}
                          >
                            {actingId === active.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                            Submit to Warehouse
                          </Button>
                        </>
                      )}
                      {canSaveRfpf(active) && (
                        <>
                          <div className="space-y-2">
                            <Label>RFPF Number</Label>
                            <Input value={rfpfDraft} onChange={(e) => setRfpfDraft(e.target.value)} placeholder="Enter RFPF…" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => void salesAdminSaveRfpf()}
                              disabled={actingId === active.id}
                            >
                              {actingId === active.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                              Save RFPF
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            RFPF is stored only while this PO is in Warehouse reserved status.
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t px-4 py-4 sm:px-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {active &&
              isDeliveredKeyAccountOrder(active) &&
              !isRebateDerivedPurchaseOrder(active) &&
              !isReadOnlyAccounting && (
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  setViewOpen(false);
                  navigate(`/key-accounts/rebates/new?poId=${active.id}`);
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Create rebate
              </Button>
            )}
            {active && canDirectorApprove(active) && !isReadOnlyAccounting && (
              <>
                <Button
                  className="w-full sm:w-auto"
                  variant="outline"
                  onClick={() => void directorReject()}
                  disabled={actingId === active.id}
                >
                  {actingId === active.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <X className="h-4 w-4 mr-2" />}
                  Reject
                </Button>
                <Button className="w-full sm:w-auto" onClick={() => void directorApprove()} disabled={actingId === active.id}>
                  {actingId === active.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  Approve
                </Button>
              </>
            )}
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

          <Dialog open={recordPayOpen} onOpenChange={setRecordPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
                <DialogTitle>
                  {String(active?.key_account_payment_status || 'unpaid') === 'unpaid'
                    ? 'Record payment'
                    : 'Record remaining payment'}
                </DialogTitle>
          </DialogHeader>
          {active ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Remaining balance:{' '}
                <span className="font-semibold text-foreground">
                  ₱
                  {Math.max(
                    0,
                    Math.round(
                      (Number(active.total_amount) -
                        (paymentSummaryPaid !== null
                          ? paymentSummaryPaid
                          : paidTotalForPayments(payments))) *
                        100
                    ) / 100
                  ).toFixed(2)}
                </span>
              </p>
              <div className="space-y-2">
                <Label>Amount (₱) *</Label>
                <Input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={newPayAmount}
                  onChange={(e) => setNewPayAmount(e.target.value)}
                  placeholder="Amount to record"
                />
              </div>
              <div className="space-y-2">
                <Label>Payment method *</Label>
                <Select
                  value={newPayMethod}
                  onValueChange={(v) =>
                    setNewPayMethod(v as 'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GCASH">GCash</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newPayMethod === 'BANK_TRANSFER' && (
                <div className="space-y-2">
                  <Label>Bank *</Label>
                  <Select value={newPayBank} onValueChange={(v) => setNewPayBank(v as 'Unionbank' | 'BPI' | 'PBCOM')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Unionbank">Unionbank</SelectItem>
                      <SelectItem value="BPI">BPI</SelectItem>
                      <SelectItem value="PBCOM">PBCOM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Payment proof (optional)</Label>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                  onChange={(e) => setNewPayFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setRecordPayOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void submitRemainingPayment()} disabled={savingPayment}>
                  {savingPayment ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'Save payment'
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

