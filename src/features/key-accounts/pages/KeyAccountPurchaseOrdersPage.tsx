import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  approveKASettlementDiscount,
  fetchKACompanyPendingDiscounts,
  fetchKADirectorKamIds,
  fetchKAPoDiscountRequests,
  fetchKAPoItems,
  fetchKAPoList,
  fetchKAPoBrandBalances,
  fetchKAPoPaymentSummary,
  fetchKAPoPayments,
  fetchKAPoRebateReturnLines,
  fetchKAPoRebateSource,
  fetchKAPoRebates,
  fetchKAPoRfpfRevisions,
  fetchKAWarehouseLocationNames,
  patchKAPoWorkflow,
  recordKAPoListPayment,
  rejectKASettlementDiscount,
  markKAPoCommissioned,
  previewKAPoBrandBalances,
  setKAPoRfpf,
  type KAPoBrandBalance,
} from '@/store/slices/key-accounts/purchase-order';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import { cn } from '@/lib/utils';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { firstRelation } from '@/features/key-accounts/key-accounts-analytics/keyAccountAnalyticsShared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  FileText,
  Pencil,
  ChevronDown,
  History,
  MoreVertical,
  BadgeCheck,
  Pin,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PurchaseOrderDeliveryDetailsPanel, keyAccountDeliveryDetailsEnabled } from '@/features/orders/components/PurchaseOrderDeliveryDetailsPanel';
import { PurchaseOrderHistoryDialog } from '@/features/orders/components/PurchaseOrderHistoryDialog';
import { logPurchaseOrderEvent } from '@/features/orders/purchaseOrderEventsApi';
import type { PurchaseOrder } from '@/features/orders/types';
import { KeyAccountPoWarehouseProgress } from '@/features/key-accounts/components/KeyAccountPoWarehouseProgress';
import type {
  KeyAccountPoPaymentStatus,
  KeyAccountSettlementDiscountRequest,
  PurchaseOrderKeyAccountPayment,
} from '@/types/database.types';
import { uploadKeyAccountPaymentProof } from '@/features/key-accounts/kaPaymentProofUpload';
import {
  KeyAccountBrandPaymentSplit,
  buildBrandPaymentAllocations,
  type BrandPaymentSplitRow,
} from '@/features/key-accounts/components/KeyAccountBrandPaymentSplit';
import {
  keyAccountWorkflowBadgeClass,
  keyAccountWorkflowLabel,
} from '@/features/key-accounts/keyAccountWorkflowStatus';
import { KeyAccountShopCorView } from '@/features/key-accounts/components/KeyAccountShopCorView';
import {
  isKeyAccountAccounting,
  isKeyAccountSalesAdmin,
  isKeyAccountSalesHead,
  canEditKeyAccountPo,
  isKeyAccountOnBehalfPo,
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
  KeyAccountRebateDetailDialog,
} from '@/features/key-accounts/rebates';
import { generateAndOpenKeyAccountCofPdf } from '@/features/key-accounts/cof/generateKeyAccountCofPdf';
import {
  KeyAccountPaymentProofStoredPreview,
  KeyAccountPaymentProofUploadField,
} from '@/features/key-accounts/components/KeyAccountPaymentProofPreview';
import { sendNotification } from '@/features/shared/lib/notification.helpers';
import { KeyAccountOutstandingPaymentsDialog } from '@/features/key-accounts/components/KeyAccountOutstandingPaymentsDialog';

type KeyAccountWorkflowStatus =
  | 'owner_pending'
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
  created_at?: string | null;
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
  key_account_payment_terms_source?: 'client' | 'company' | 'custom' | null;
  key_account_payment_terms_created_by?: string | null;
  key_account_notification_option?: string | null;
  key_account_notification_date?: string | null;
  key_account_notification_sent_at?: string | null;
  commissioned_at?: string | null;
  commissioned_by?: string | null;
  remaining_balance?: number | null;
  client?: {
    client_name: string;
    client_code?: string;
    contact_phone?: string | null;
    tin_number?: string | null;
  } | null;
  shop?: {
    shop_name: string;
    cor_pdf_path?: string | null;
    city?: string | null;
    province?: string | null;
    region?: string | null;
  } | null;
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
  created_by_user?: { full_name: string | null; email: string | null } | null;
  payment_terms_creator?: { full_name: string | null; email: string | null } | null;
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
const MAX_RFPF_EDITS = 2;
const PO_TABLE_FREEZE_STORAGE_KEY = 'ka-po-list-freeze-column';

const PO_TABLE_COLUMNS = [
  { id: 'po', label: 'PO', minWidth: 200 },
  { id: 'created', label: 'Created', minWidth: 170 },
  { id: 'owner', label: 'Order owner', minWidth: 160 },
  { id: 'client', label: 'Client', minWidth: 150 },
  { id: 'shop', label: 'Shop', minWidth: 140 },
  { id: 'status', label: 'Status', minWidth: 130 },
  { id: 'payment', label: 'Payment status', minWidth: 140 },
  { id: 'commissioned', label: 'Commissioned', minWidth: 140 },
  { id: 'dr', label: 'DR', minWidth: 110 },
  { id: 'rfpf', label: 'RFPF', minWidth: 110 },
  { id: 'balance', label: 'Balance', minWidth: 130 },
  { id: 'total', label: 'Total', minWidth: 120 },
  { id: 'actions', label: 'Actions', minWidth: 150 },
] as const;

type PoTableColumnId = (typeof PO_TABLE_COLUMNS)[number]['id'];
type FreezeColumnId = 'none' | Exclude<PoTableColumnId, 'actions'>;

const FREEZEABLE_COLUMNS = PO_TABLE_COLUMNS.filter(
  (column): column is (typeof PO_TABLE_COLUMNS)[number] & { id: Exclude<PoTableColumnId, 'actions'> } =>
    column.id !== 'actions'
);

function readStoredFreezeColumn(): FreezeColumnId {
  try {
    const stored = localStorage.getItem(PO_TABLE_FREEZE_STORAGE_KEY);
    if (stored === 'none') return 'none';
    if (FREEZEABLE_COLUMNS.some((column) => column.id === stored)) {
      return stored as FreezeColumnId;
    }
  } catch {
    /* ignore */
  }
  return 'po';
}

function getPoTableFreezeProps(
  columnId: PoTableColumnId,
  frozenThrough: FreezeColumnId,
  options?: { header?: boolean; className?: string }
) {
  const extraClassName = options?.className;
  if (frozenThrough === 'none') {
    return { className: extraClassName };
  }

  const freezeIndex = PO_TABLE_COLUMNS.findIndex((column) => column.id === frozenThrough);
  const columnIndex = PO_TABLE_COLUMNS.findIndex((column) => column.id === columnId);
  if (freezeIndex < 0 || columnIndex < 0 || columnIndex > freezeIndex) {
    return { className: extraClassName };
  }

  const left = PO_TABLE_COLUMNS.slice(0, columnIndex).reduce((sum, column) => sum + column.minWidth, 0);
  const isLastFrozen = columnIndex === freezeIndex;

  return {
    className: cn(
      'sticky bg-background group-hover:bg-muted',
      options?.header ? 'z-20 bg-background' : 'z-10',
      isLastFrozen && 'border-r border-border',
      extraClassName
    ),
    style: {
      left,
      minWidth: PO_TABLE_COLUMNS[columnIndex].minWidth,
    } as const,
  };
}

function freezeHeaderTitle(columnId: Exclude<PoTableColumnId, 'actions'>, frozenColumn: FreezeColumnId) {
  if (frozenColumn === columnId) return 'Unfreeze';
  const label = FREEZEABLE_COLUMNS.find((column) => column.id === columnId)?.label || columnId;
  return columnId === 'po' ? 'Freeze PO' : `Freeze through ${label}`;
}

function PoFreezeTableHead({
  columnId,
  frozenColumn,
  onToggle,
  className,
}: {
  columnId: Exclude<PoTableColumnId, 'actions'>;
  frozenColumn: FreezeColumnId;
  onToggle: (columnId: Exclude<PoTableColumnId, 'actions'>) => void;
  className?: string;
}) {
  const label = FREEZEABLE_COLUMNS.find((column) => column.id === columnId)?.label || columnId;
  const isFrozenEnd = frozenColumn === columnId;

  return (
    <TableHead
      {...getPoTableFreezeProps(columnId, frozenColumn, {
        header: true,
        className: cn(
          'group/head cursor-pointer select-none hover:text-foreground',
          className
        ),
      })}
      title={freezeHeaderTitle(columnId, frozenColumn)}
      aria-pressed={isFrozenEnd}
      onClick={() => onToggle(columnId)}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5',
          className?.includes('text-right') && 'w-full justify-end'
        )}
      >
        {label}
        <Pin
          className={cn(
            'h-3 w-3 shrink-0 transition-opacity',
            isFrozenEnd
              ? 'text-foreground fill-current opacity-100'
              : 'text-muted-foreground opacity-0 group-hover/head:opacity-70'
          )}
        />
      </span>
    </TableHead>
  );
}

interface RfpfRevision {
  id: string;
  previousRfpfNumber: string;
  newRfpfNumber: string;
  reason: string;
  changedByName: string;
  createdAt: string;
}

type PoItemRow = NonNullable<Row['items']>[number];

function resolveWarehouseLocationName(
  loc: { name: string } | { name: string }[] | null | undefined
): string | null {
  if (!loc) return null;
  const row = Array.isArray(loc) ? loc[0] : loc;
  return row?.name?.trim() || null;
}

function normalizePoRow(order: any): Row {
  const rawLoc = Array.isArray(order.warehouse_location)
    ? order.warehouse_location[0]
    : order.warehouse_location;
  const rawClient = Array.isArray(order.client) ? order.client[0] : order.client;
  const rawShop = Array.isArray(order.shop) ? order.shop[0] : order.shop;
  const rawAddress = Array.isArray(order.address) ? order.address[0] : order.address;
  const rawKam = Array.isArray(order.kam) ? order.kam[0] : order.kam;
  const rawCreatedBy = Array.isArray(order.created_by_user)
    ? order.created_by_user[0]
    : order.created_by_user;

  return {
    ...order,
    warehouse_location: rawLoc ?? null,
    client: rawClient ?? null,
    shop: rawShop ?? null,
    address: rawAddress ?? null,
    kam: rawKam ?? null,
    created_by_user: rawCreatedBy ?? null,
  };
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

function normalizePoItemRow(item: any): PoItemRow {
  const variant = firstRelation(item.variants);
  const brand = firstRelation(variant?.brands);
  return {
    ...item,
    warehouse_locations: firstRelation(item.warehouse_locations) ?? item.warehouse_locations ?? null,
    variants: variant
      ? {
          name: variant.name,
          variant_type: variant.variant_type,
          brands: brand ? { name: brand.name } : null,
        }
      : null,
  };
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

function brandBalanceStatusClass(status: string) {
  switch (status) {
    case 'paid':
      return 'bg-emerald-600 text-white hover:bg-emerald-600';
    case 'partial':
      return 'bg-amber-500 text-white hover:bg-amber-500';
    default:
      return 'bg-slate-500 text-white hover:bg-slate-500';
  }
}

function formatPaymentAllocationSummary(
  allocations:
    | Array<{
        allocated_amount?: number | null;
        allocated_discount?: number | null;
        item?:
          | {
              variants?:
                | { name?: string | null; brands?: { name?: string | null } | { name?: string | null }[] | null }
                | { name?: string | null; brands?: { name?: string | null } | { name?: string | null }[] | null }[]
                | null;
            }
          | Array<{
              variants?:
                | { name?: string | null; brands?: { name?: string | null } | { name?: string | null }[] | null }
                | { name?: string | null; brands?: { name?: string | null } | { name?: string | null }[] | null }[]
                | null;
            }>
          | null;
      }>
    | null
    | undefined
) {
  if (!allocations?.length) return [];
  const byBrand = new Map<string, { cash: number; discount: number }>();
  for (const row of allocations) {
    const item = firstRelation(row.item);
    const variant = firstRelation(item?.variants);
    const brand = firstRelation(variant?.brands);
    const name = brand?.name || variant?.name || 'Allocated';
    const current = byBrand.get(name) || { cash: 0, discount: 0 };
    current.cash += Number(row.allocated_amount || 0);
    current.discount += Number(row.allocated_discount || 0);
    byBrand.set(name, current);
  }
  return [...byBrand.entries()].map(([brand, amounts]) => ({ brand, ...amounts }));
}

function notificationOptionLabel(option: string | null | undefined): string {
  switch (option) {
    case 'none':
    case undefined:
    case null:
      return "Don't notify";
    case 'net_15':
      return 'Net 15';
    case 'net_30':
      return 'Net 30';
    case 'net_60':
      return 'Net 60';
    case 'days_before_3':
      return '3 days before due';
    case 'days_before_1':
      return '1 day before due';
    case 'custom':
      return 'Custom date';
    default:
      return String(option);
  }
}

function formatISODateManila(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
}

/** Display timestamptz values in Asia/Manila (storage remains UTC). */
function formatDateTimeManila(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function RfpfRevisionEntry({ revision }: { revision: RfpfRevision }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className="w-full text-left hover:bg-muted/40 transition-colors p-3">
          <div className="flex items-start gap-2 min-w-0">
            {open ? (
              <ChevronDown className="shrink-0 text-muted-foreground mt-0.5 h-4 w-4" />
            ) : (
              <ChevronRight className="shrink-0 text-muted-foreground mt-0.5 h-4 w-4" />
            )}
            <div className="min-w-0 space-y-0.5">
              <div className="text-xs text-muted-foreground">
                {format(new Date(revision.createdAt), 'MMMM dd, yyyy • h:mm a')}
                {' · '}
                <span className="font-medium text-foreground">{revision.changedByName}</span>
              </div>
              <p className="text-sm truncate">
                <span className="text-muted-foreground">Reason: </span>
                {revision.reason}
              </p>
            </div>
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t bg-muted/10 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">Previous</p>
            <p className="font-mono text-sm font-medium">{revision.previousRfpfNumber.toUpperCase()}</p>
          </div>
          <div className="space-y-1 sm:border-l sm:pl-3">
            <p className="text-xs font-semibold text-muted-foreground">Updated to</p>
            <p className="font-mono text-sm font-medium">{revision.newRfpfNumber.toUpperCase()}</p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Key Account POs with payment tracking that are not fully paid (unpaid or partial). */
function isKeyAccountPaymentNotComplete(po: {
  key_account_payment_mode?: string | null;
  key_account_payment_status?: string | null;
}): boolean {
  if (!po.key_account_payment_mode) return false;
  return po.key_account_payment_status !== 'paid';
}

function isKeyAccountPoFullyPaid(po: {
  key_account_payment_status?: string | null;
}): boolean {
  return String(po.key_account_payment_status || 'unpaid') === 'paid';
}

export function KeyAccountPurchaseOrdersPage() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const listRowsRaw = useAppSelector((s) => s.kaPurchaseOrder.listRows);
  const directorKamIdsFromStore = useAppSelector((s) => s.kaPurchaseOrder.directorKamIds);
  const linkedWarehouseNamesById = useAppSelector((s) => s.kaPurchaseOrder.warehouseLocationNames);
  const brandBalancesPoId = useAppSelector((s) => s.kaPurchaseOrder.brandBalancesPoId);
  const brandBalancesFromStore = useAppSelector((s) => s.kaPurchaseOrder.brandBalances);
  const unallocatedPaid = useAppSelector((s) => s.kaPurchaseOrder.unallocatedPaid);
  const unallocatedDiscount = useAppSelector((s) => s.kaPurchaseOrder.unallocatedDiscount);
  const brandBalancesStatus = useAppSelector((s) => s.kaPurchaseOrder.brandBalancesStatus);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState(() => searchParams.get('search')?.trim() || searchParams.get('po')?.trim() || '');
  const initialTabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const t = String(initialTabParam || '').toLowerCase();
    if (t === 'pending' || t === 'rebates' || t === 'warehouse' || t === 'done' || t === 'my' || t === 'all') {
      return t;
    }
    // Deep-link from email/search → show matching row across statuses
    return searchParams.get('search') || searchParams.get('po') ? 'all' : 'pending';
  });
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
  const [historyOrder, setHistoryOrder] = useState<Row | null>(null);
  const [outstandingDialogOpen, setOutstandingDialogOpen] = useState(false);
  const [commissionPreviewPo, setCommissionPreviewPo] = useState<Row | null>(null);
  const [commissionPreviewBrands, setCommissionPreviewBrands] = useState<KAPoBrandBalance[]>([]);
  const [commissionPreviewLoading, setCommissionPreviewLoading] = useState(false);
  const [commissionConfirmPo, setCommissionConfirmPo] = useState<Row | null>(null);
  const commissionPreviewReqRef = useRef(0);
  const [frozenColumn, setFrozenColumn] = useState<FreezeColumnId>(readStoredFreezeColumn);

  const [actingId, setActingId] = useState<string | null>(null);
  const [ownerApproveTarget, setOwnerApproveTarget] = useState<Row | null>(null);
  const [cofLoadingId, setCofLoadingId] = useState<string | null>(null);
  const [rfpfDraft, setRfpfDraft] = useState('');
  const [warehouseSubmitMode, setWarehouseSubmitMode] = useState<'without_rfpf' | 'with_rfpf'>(
    'without_rfpf'
  );
  const [rfpfRevisions, setRfpfRevisions] = useState<RfpfRevision[]>([]);
  const [rfpfRevisionsLoading, setRfpfRevisionsLoading] = useState(false);
  const [editRfpfOpen, setEditRfpfOpen] = useState(false);
  const [editRfpfDraft, setEditRfpfDraft] = useState('');
  const [editRfpfReason, setEditRfpfReason] = useState('');
  const [submittingRfpfEdit, setSubmittingRfpfEdit] = useState(false);

  const [payments, setPayments] = useState<
    (PurchaseOrderKeyAccountPayment & { recorder?: { full_name: string | null; email: string | null } | null })[]
  >([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const directorKamIds = useMemo(() => new Set(directorKamIdsFromStore), [directorKamIdsFromStore]);
  const brandBalances = useMemo<KAPoBrandBalance[]>(
    () => (active?.id && brandBalancesPoId === active.id ? brandBalancesFromStore : []),
    [active?.id, brandBalancesPoId, brandBalancesFromStore]
  );
  const openBrandBalances = useMemo(
    () => brandBalances.filter((row) => row.remaining > 0.001),
    [brandBalances]
  );

  const [recordPayOpen, setRecordPayOpen] = useState(false);
  const [newPayAmount, setNewPayAmount] = useState('');
  const [newPaySettlementDiscount, setNewPaySettlementDiscount] = useState('');
  const [newPaySettlementReason, setNewPaySettlementReason] = useState('');
  const [newPayMethod, setNewPayMethod] = useState<'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE'>('BANK_TRANSFER');
  const [newPayBank, setNewPayBank] = useState<'Unionbank' | 'BPI' | 'PBCOM'>('BPI');
  const [newPayFile, setNewPayFile] = useState<File | null>(null);
  const [newPayCashByBrand, setNewPayCashByBrand] = useState<Record<string, string>>({});
  const [newPayPerPieceDiscount, setNewPayPerPieceDiscount] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  const openBrandSplitRows = useMemo<BrandPaymentSplitRow[]>(
    () =>
      openBrandBalances.map((row) => ({
        brandId: row.brandId,
        brandName: row.brandName,
        remaining: row.remaining,
      })),
    [openBrandBalances]
  );
  const parsedNewPayCash = useMemo(() => {
    if (newPayAmount.trim() === '') return 0;
    const n = parseFloat(String(newPayAmount).replace(/,/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }, [newPayAmount]);
  const parsedNewPayDiscount = useMemo(() => {
    if (newPaySettlementDiscount.trim() === '') return 0;
    const n = parseFloat(String(newPaySettlementDiscount).replace(/,/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }, [newPaySettlementDiscount]);
  /** When exactly one brand has cash entered, allow per-piece discount helper. */
  const singleCashBrandForDiscount = useMemo(() => {
    const withCash = openBrandBalances.filter((row) => {
      const raw = newPayCashByBrand[row.brandId] ?? '';
      if (raw.trim() === '') return false;
      const n = parseFloat(String(raw).replace(/,/g, ''));
      return Number.isFinite(n) && n > 0;
    });
    if (openBrandBalances.length === 1) return openBrandBalances[0];
    return withCash.length === 1 ? withCash[0] : null;
  }, [openBrandBalances, newPayCashByBrand]);

  const unpaidWholePcsForDiscount = useMemo(() => {
    if (!singleCashBrandForDiscount) return 0;
    const qty = Number(singleCashBrandForDiscount.remainingQty || 0);
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    return Math.max(0, Math.floor(qty + 1e-9));
  }, [singleCashBrandForDiscount]);

  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [paymentSummaryPaid, setPaymentSummaryPaid] = useState<number | null>(null);
  const [paymentSummaryDiscount, setPaymentSummaryDiscount] = useState<number | null>(null);
  const [paymentSummaryLoading, setPaymentSummaryLoading] = useState(false);
  const [paymentEntryCount, setPaymentEntryCount] = useState(0);
  const [discountRequests, setDiscountRequests] = useState<
    (KeyAccountSettlementDiscountRequest & {
      requester?: { full_name: string | null; email: string | null } | null;
    })[]
  >([]);
  const [discountRequestsLoading, setDiscountRequestsLoading] = useState(false);
  const [companyPendingDiscounts, setCompanyPendingDiscounts] = useState<
    (KeyAccountSettlementDiscountRequest & {
      requester?: { full_name: string | null; email: string | null } | null;
      purchase_order?: { po_number: string | null } | null;
    })[]
  >([]);
  const [actingDiscountId, setActingDiscountId] = useState<string | null>(null);
  const [rejectDiscountId, setRejectDiscountId] = useState<string | null>(null);
  const [rejectDiscountReason, setRejectDiscountReason] = useState('');
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

  const [rebateReturnLines, setRebateReturnLines] = useState<
    Array<{
      brand_name: string;
      variant_name: string;
      variant_type: string;
      disputed_quantity: number;
      warehouse_location_id: string | null;
    }>
  >([]);
  const [rebateReturnLinesLoading, setRebateReturnLinesLoading] = useState(false);
  const [rebateDetailOpen, setRebateDetailOpen] = useState(false);
  const [rebateDetailId, setRebateDetailId] = useState<string | null>(null);

  const manualRefreshUntilRef = useRef(0);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deepLinkHandledRef = useRef<string | null>(null);

  const markLocalRefresh = () => {
    manualRefreshUntilRef.current = Date.now() + 3000;
  };

  const role = user?.role;
  const openRebateDetail = (rebateId: string) => {
    setRebateDetailId(rebateId);
    setRebateDetailOpen(true);
  };

  const refreshPoRebatesForActive = async () => {
    if (!active?.id || !isDeliveredKeyAccountOrder(active)) return;
    setPoRebatesLoading(true);
    try {
      const result = await dispatch(fetchKAPoRebates(active.id)).unwrap();
      setPoRebates((result.rebates as typeof poRebates) || []);
    } catch {
      setPoRebates([]);
    } finally {
      setPoRebatesLoading(false);
    }
  };

  const isKAM = role === 'key_account_manager';
  const isDirector = role === 'sales_director';
  const isSalesHead = isKeyAccountSalesHead(role);
  const isSalesAdmin = isKeyAccountSalesAdmin(role);
  const isReadOnlyAccounting = isKeyAccountAccounting(role);

  const canDirectorApprove = (po: Row) =>
    isDirector && (po.workflow_status === 'director_pending' || po.workflow_status === 'kam_pending');
  const canOwnerApprove = (po: Row) =>
    !!user?.id && po.workflow_status === 'owner_pending' && po.kam_id === user.id;
  const canSalesAdminReview = (po: Row) => isSalesAdmin && po.workflow_status === 'admin_pending';

  /** Sales Admin may manage RFPF while the PO is still under admin review or already queued for warehouse. */
  const canManageRfpf = (po: Row) =>
    isSalesAdmin && (po.workflow_status === 'admin_pending' || po.workflow_status === 'warehouse_reserved');
  const canSaveRfpf = (po: Row) => canManageRfpf(po) && !po.rfpf_number?.trim();
  const canEditRfpf = (po: Row) =>
    canManageRfpf(po) &&
    !!po.rfpf_number?.trim() &&
    !rfpfRevisionsLoading &&
    rfpfRevisions.length < MAX_RFPF_EDITS;
  const rfpfEditCount = rfpfRevisions.length;

  const canSubmitToWarehouse = (po: Row) =>
    isSalesAdmin && po.workflow_status === 'admin_pending';

  const isCreatedByCurrentUser = (po: Row) => po.created_by === user?.id;
  const isPendingWorkflow = (po: Row) =>
    po.workflow_status === 'owner_pending' ||
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
  const discountTotalForPayments = (list: typeof payments) =>
    list.reduce((s, p) => s + Number(p.settlement_discount || 0), 0);

  const paymentPaidSoFar =
    paymentSummaryPaid !== null ? paymentSummaryPaid : paidTotalForPayments(payments);
  const paymentDiscountSoFar =
    paymentSummaryDiscount !== null
      ? paymentSummaryDiscount
      : discountTotalForPayments(payments);
  const pendingDiscountSoFar = discountRequests
    .filter((r) => r.status === 'pending')
    .reduce((s, r) => s + Number(r.settlement_discount || 0), 0);
  const paymentAppliedSoFar = paymentPaidSoFar + paymentDiscountSoFar;
  /** Room left for new cash/discount after applying pending requests (validation only). */
  const paymentReservedSoFar = paymentAppliedSoFar + pendingDiscountSoFar;
  /** Unsettled balance after cash + approved discount only (pending does not reduce this). */
  const paymentRemainingBalance =
    Math.round((Number(active?.total_amount || 0) - paymentAppliedSoFar) * 100) / 100;
  const paymentAvailableToApply =
    Math.round((Number(active?.total_amount || 0) - paymentReservedSoFar) * 100) / 100;

  const money2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

  /** Trim cash so cash + settlement discount never exceeds available remaining. */
  const trimCashForDiscount = (discount: number, currentCashRaw: string) => {
    const available = money2(Math.max(0, paymentAvailableToApply));
    const disc = money2(Math.max(0, Math.min(discount, available)));
    const maxCash = money2(Math.max(0, available - disc));
    if (currentCashRaw.trim() === '') return currentCashRaw;
    const cash = money2(parseFloat(String(currentCashRaw).replace(/,/g, '')));
    if (!Number.isFinite(cash) || cash < 0) return currentCashRaw;
    if (cash <= maxCash + 0.011) return currentCashRaw;
    return maxCash > 0 ? String(maxCash) : '';
  };

  const applySettlementDiscountValue = (raw: string) => {
    setNewPaySettlementDiscount(raw);
    if (raw.trim() === '') return;
    const n = parseFloat(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) return;
    setNewPayAmount((prev) => trimCashForDiscount(n, prev));
  };

  const recordPayCoverage = useMemo(() => {
    const available = money2(Math.max(0, paymentAvailableToApply));
    const cash = parsedNewPayCash;
    const discount = parsedNewPayDiscount;
    const combined = money2(cash + discount);
    return {
      available,
      cash,
      discount,
      combined,
      remainingAfter: money2(Math.max(0, available - combined)),
      overBy: money2(Math.max(0, combined - available)),
    };
  }, [paymentAvailableToApply, parsedNewPayCash, parsedNewPayDiscount]);

  async function loadPaymentSummary(poId: string) {
    setPaymentSummaryLoading(true);
    try {
      const result = await dispatch(fetchKAPoPaymentSummary(poId)).unwrap();
      setPaymentSummaryPaid(result.paid);
      setPaymentSummaryDiscount(result.discount);
      setPaymentEntryCount(result.entryCount);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading payment summary',
        description: e?.message || 'Failed to load payment totals',
      });
      setPaymentSummaryPaid(0);
      setPaymentSummaryDiscount(0);
      setPaymentEntryCount(0);
    } finally {
      setPaymentSummaryLoading(false);
    }
  }

  const loadBrandBalances = async (poId: string) => {
    try {
      await dispatch(fetchKAPoBrandBalances(poId)).unwrap();
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading brand balances',
        description: e?.message || 'Failed to load brand remaining balances',
      });
    }
  };

  useEffect(() => {
    if (!recordPayOpen) return;
    setNewPayCashByBrand({});
    setNewPayPerPieceDiscount('');
  }, [recordPayOpen, active?.id]);

  const loadDiscountRequests = async (poId: string) => {
    setDiscountRequestsLoading(true);
    try {
      const result = await dispatch(fetchKAPoDiscountRequests(poId)).unwrap();
      setDiscountRequests((result.requests as typeof discountRequests) || []);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading discount requests',
        description: e?.message || 'Failed to load settlement discount requests',
      });
      setDiscountRequests([]);
    } finally {
      setDiscountRequestsLoading(false);
    }
  };

  const loadCompanyPendingDiscounts = async () => {
    if (!user?.company_id || !isSalesHead) {
      setCompanyPendingDiscounts([]);
      return;
    }
    try {
      const result = await dispatch(fetchKACompanyPendingDiscounts()).unwrap();
      setCompanyPendingDiscounts((result.requests as typeof companyPendingDiscounts) || []);
    } catch {
      setCompanyPendingDiscounts([]);
    }
  };

  const canRecordRemainingPayment = (po: Row | null) => {
    if (!po || !user?.id) return false;
    if (!po.key_account_payment_mode) return false;
    const payStatus = String(po.key_account_payment_status || 'unpaid');
    // Additional / remaining payments allowed at any workflow_status while unpaid/partial.
    if (!(payStatus === 'partial' || payStatus === 'unpaid')) return false;
    const actorOk =
      po.created_by === user.id ||
      po.kam_id === user.id ||
      isSalesAdmin ||
      isSalesHead ||
      (isDirector && !!po.kam_id && directorKamIds.has(po.kam_id));
    return actorOk;
  };

  const canActOnCommission = (po: Row) =>
    isSalesAdmin && !!po.key_account_payment_mode;

  const loadCommissionPreview = async (poId: string) => {
    const req = ++commissionPreviewReqRef.current;
    setCommissionPreviewLoading(true);
    setCommissionPreviewBrands([]);
    try {
      const result = await dispatch(previewKAPoBrandBalances(poId)).unwrap();
      if (req !== commissionPreviewReqRef.current) return;
      setCommissionPreviewBrands(result.brands || []);
    } catch (e: any) {
      if (req !== commissionPreviewReqRef.current) return;
      toast({
        variant: 'destructive',
        title: 'Error loading brand balances',
        description: e?.message || 'Failed to load brand payment preview',
      });
      setCommissionPreviewBrands([]);
    } finally {
      if (req === commissionPreviewReqRef.current) setCommissionPreviewLoading(false);
    }
  };

  const openCommissionDialog = (po: Row) => {
    if (po.commissioned_at) return;
    if (isKeyAccountPoFullyPaid(po)) {
      setCommissionConfirmPo(po);
      return;
    }
    setCommissionPreviewPo(po);
    void loadCommissionPreview(po.id);
  };

  const confirmMarkCommissioned = async (po: Row | null) => {
    if (!po) return;
    setActingId(po.id);
    try {
      const result = await dispatch(markKAPoCommissioned(po.id)).unwrap();
      toast({ title: `${po.po_number} marked as commissioned` });
      setCommissionConfirmPo(null);
      setActive((prev) =>
        prev?.id === po.id
          ? {
              ...prev,
              commissioned_at: result.commissioned_at,
              commissioned_by: result.commissioned_by,
            }
          : prev
      );
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not mark as commissioned',
        description: e?.message || 'Failed to mark this purchase order as commissioned',
      });
    } finally {
      setActingId(null);
    }
  };

  const loadPayments = async (poId: string) => {
    setPaymentsLoading(true);
    try {
      const result = await dispatch(fetchKAPoPayments(poId)).unwrap();
      const rows = (result.payments as typeof payments) || [];
      setPayments(rows);
      setPaymentSummaryPaid(paidTotalForPayments(rows));
      setPaymentSummaryDiscount(discountTotalForPayments(rows));
      setPaymentEntryCount(rows.length);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading payments',
        description: e?.message || 'Failed to load payment history',
      });
      setPayments([]);
      setPaymentSummaryPaid(0);
      setPaymentSummaryDiscount(0);
      setPaymentEntryCount(0);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const fetchRows = async (showLoading = true) => {
    if (!user?.id) return;
    if (showLoading) setLoading(true);
    try {
      await dispatch(fetchKAPoList()).unwrap();
    } catch (e: any) {
      if (showLoading) {
        toast({
          variant: 'destructive',
          title: 'Error loading Key Account POs',
          description: e?.message || 'Failed to load purchase orders',
        });
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    const nextRows = (listRowsRaw as Row[]).map(normalizePoRow);
    setRows(nextRows);
    setActive((prev) => {
      if (!prev?.id) return prev;
      const updated = nextRows.find((r) => r.id === prev.id);
      if (!updated) return prev;
      return { ...updated, items: prev.items };
    });
  }, [listRowsRaw]);

  const scheduleRowsRefresh = () => {
    if (Date.now() < manualRefreshUntilRef.current) return;
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => {
      refreshDebounceRef.current = null;
      if (Date.now() < manualRefreshUntilRef.current) return;
      void fetchRows(false);
    }, 400);
  };

  useEffect(() => {
    if (!user?.id) return;

    void fetchRows();

    const poChannel = supabase
      .channel('key_account_po_list_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_orders' },
        () => {
          scheduleRowsRefresh();
        }
      )
      .subscribe();

    return () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      void poChannel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, user?.company_id]);

  useEffect(() => {
    if (!user?.company_id) return;
    dispatch(fetchKAWarehouseLocationNames());
  }, [user?.company_id, dispatch]);

  useEffect(() => {
    if (!user?.company_id || !isSalesHead) {
      setCompanyPendingDiscounts([]);
      return;
    }
    void loadCompanyPendingDiscounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id, isSalesHead]);

  useEffect(() => {
    setTabPages(createInitialTabPages());
  }, [q, orderDateRange.start, orderDateRange.end]);

  useEffect(() => {
    if (!user?.id || user.role !== 'sales_director') return;
    dispatch(fetchKADirectorKamIds());
  }, [user?.id, user?.role, dispatch]);

  useEffect(() => {
    const fromUrl = searchParams.get('search')?.trim() || searchParams.get('po')?.trim() || '';
    if (fromUrl) setQ(fromUrl);
    const t = String(searchParams.get('tab') || '').toLowerCase();
    if (t === 'pending' || t === 'rebates' || t === 'warehouse' || t === 'done' || t === 'my' || t === 'all') {
      setActiveTab(t);
    } else if (fromUrl) {
      setActiveTab('all');
    }
  }, [searchParams]);

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

  const outstandingOrders = useMemo(
    () => filtered.filter(isKeyAccountPaymentNotComplete),
    [filtered]
  );

  const paymentOutstanding = useMemo(() => {
    const unpaid = outstandingOrders.filter(
      (r) => (r.key_account_payment_status || 'unpaid') === 'unpaid'
    );
    const partial = outstandingOrders.filter((r) => r.key_account_payment_status === 'partial');
    return {
      unpaid: unpaid.length,
      partial: partial.length,
      total: outstandingOrders.length,
    };
  }, [outstandingOrders]);

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

  const fetchRfpfRevisions = async (poId: string) => {
    setRfpfRevisionsLoading(true);
    try {
      const result = await dispatch(fetchKAPoRfpfRevisions(poId)).unwrap();
      setRfpfRevisions((result.revisions as RfpfRevision[]) || []);
    } catch (e: any) {
      console.error('Error fetching RFPF revisions', e);
      setRfpfRevisions([]);
    } finally {
      setRfpfRevisionsLoading(false);
    }
  };

  const openView = async (po: Row) => {
    setActive(po);
    setRfpfDraft(po.rfpf_number || '');
    setWarehouseSubmitMode(po.rfpf_number?.trim() ? 'with_rfpf' : 'without_rfpf');
    setRfpfRevisions([]);
    setEditRfpfOpen(false);
    setEditRfpfDraft('');
    setEditRfpfReason('');
    setViewOpen(true);
    setRebateSource(null);
    setRecordPayOpen(false);
    setNewPayAmount('');
    setNewPaySettlementDiscount('');
    setNewPaySettlementReason('');
    setNewPayMethod('BANK_TRANSFER');
    setNewPayBank('BPI');
    setNewPayFile(null);
    setNewPayCashByBrand({});
    setNewPayPerPieceDiscount('');
    setPayments([]);
    setDiscountRequests([]);
    setPaymentHistoryOpen(po.key_account_payment_mode === 'split');
    setPaymentSummaryPaid(null);
    setPaymentSummaryDiscount(null);
    setPaymentEntryCount(0);
    if (po.key_account_payment_mode) {
      void loadPaymentSummary(po.id);
      void loadPayments(po.id);
      void loadDiscountRequests(po.id);
      void loadBrandBalances(po.id);
    }
    if (po.rfpf_number?.trim()) void fetchRfpfRevisions(po.id);

    try {
      const result = await dispatch(fetchKAPoItems(po.id)).unwrap();
      const normalized = ((result.items as any[]) || []).map(normalizePoItemRow);
      setActive((prev) => (prev ? { ...prev, items: normalized } : prev));
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading PO items',
        description: e?.message || 'Failed to load items',
      });
    }

    if (String(po.po_order_kind || '') === 'rebate_fulfillment' && po.source_rebate_id) {
      try {
        const result = await dispatch(fetchKAPoRebateSource(po.source_rebate_id)).unwrap();
        if (result.source) {
          setRebateSource(result.source as typeof rebateSource);
        } else {
          setRebateSource(null);
        }
      } catch {
        setRebateSource(null);
      }
      setRebateReturnLinesLoading(true);
      try {
        const linesResult = await dispatch(fetchKAPoRebateReturnLines(po.source_rebate_id)).unwrap();
        setRebateReturnLines((linesResult.lines as typeof rebateReturnLines) || []);
      } catch {
        setRebateReturnLines([]);
      } finally {
        setRebateReturnLinesLoading(false);
      }
    } else {
      setRebateSource(null);
      setRebateReturnLines([]);
      setRebateReturnLinesLoading(false);
    }

    if (isDoneWorkflow(po)) {
      setPoRebatesLoading(true);
      try {
        if (isDeliveredKeyAccountOrder(po)) {
          const result = await dispatch(fetchKAPoRebates(po.id)).unwrap();
          setPoRebates((result.rebates as typeof poRebates) || []);
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

  // Email "View PO" deep link: filter list + open matching Key Account PO.
  useEffect(() => {
    if (loading || rows.length === 0) return;
    const fromUrl = (searchParams.get('search') || searchParams.get('po') || '').trim();
    if (!fromUrl) return;
    if (deepLinkHandledRef.current === fromUrl) return;

    const needle = fromUrl.toLowerCase();
    const exact =
      rows.find((r) => String(r.po_number || '').toLowerCase() === needle) ||
      rows.find((r) => String(r.po_number || '').toLowerCase().includes(needle));

    if (!exact) return;
    deepLinkHandledRef.current = fromUrl;
    setQ(fromUrl);
    setActiveTab('all');
    void openView(exact);
  }, [loading, rows, searchParams]);

  const updateWorkflow = async (poId: string, patch: Partial<Row>): Promise<boolean> => {
    setActingId(poId);
    markLocalRefresh();
    try {
      await dispatch(patchKAPoWorkflow({ poId, patch: patch as Record<string, unknown> })).unwrap();
      await fetchRows(false);
      setViewOpen(false);
      setActive(null);
      return true;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: e?.message || 'Failed to update PO' });
      return false;
    } finally {
      setActingId(null);
    }
  };

  const openCofForPo = async (po: Row) => {
    if (!user?.id) return;
    setCofLoadingId(po.id);
    try {
      await generateAndOpenKeyAccountCofPdf({
        id: po.id,
        po_number: po.po_number,
        company_account_type: po.company_account_type || 'Key Accounts',
        po_order_kind: po.po_order_kind,
        source_rebate_id: po.source_rebate_id,
        order_date: po.order_date,
        expected_delivery_date: po.expected_delivery_date,
        created_at: po.created_at,
        subtotal: Number(po.subtotal || 0),
        tax_rate: Number(po.tax_rate || 0),
        tax_amount: Number(po.tax_amount || 0),
        discount: Number(po.discount || 0),
        total_amount: Number(po.total_amount || 0),
        status: po.status,
        notes: '',
        created_by: po.created_by || user.id,
        key_account_payment_terms: po.key_account_payment_terms,
        key_account_payment_mode: po.key_account_payment_mode,
        key_account_payment_status: po.key_account_payment_status,
        client: po.client,
        shop: po.shop,
        address: po.address,
        kam: po.kam,
        items: po.items,
      });
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'COF Error',
        description: e instanceof Error ? e.message : 'Failed to generate COF',
      });
    } finally {
      setCofLoadingId(null);
    }
  };

  const openCofForActive = async () => {
    if (!active) return;
    await openCofForPo(active);
  };

  const directorApprove = async (po?: Row | null) => {
    const target = po ?? active;
    if (!target || !user?.id) return;
    const poId = target.id;
    const ok = await updateWorkflow(poId, {
      workflow_status: 'admin_pending',
      director_approved_at: new Date().toISOString(),
      director_approved_by: user.id,
    } as any);
    if (ok) {
      void logPurchaseOrderEvent({
        purchaseOrderId: poId,
        eventType: 'director_approved',
        note: 'Approved by sales director',
        createdBy: user.id,
      });
    }
  };

  const directorReject = async (po?: Row | null) => {
    const target = po ?? active;
    if (!target || !user?.id) return;
    const poId = target.id;
    const ok = await updateWorkflow(poId, {
      workflow_status: 'rejected',
      status: 'rejected',
      director_approved_at: new Date().toISOString(),
      director_approved_by: user.id,
    } as any);
    if (ok) {
      void logPurchaseOrderEvent({
        purchaseOrderId: poId,
        eventType: 'rejected',
        note: 'Rejected by sales director',
        createdBy: user.id,
      });
    }
  };

  const notifyCreatorOfOwnerDecision = (
    po: Row,
    decision: 'approved' | 'rejected',
    nextStatus?: string
  ) => {
    if (!po.created_by || !user?.company_id || po.created_by === user.id) return;
    const actorName = user.full_name || user.email || 'Order owner';
    void sendNotification({
      userId: po.created_by,
      companyId: user.company_id,
      type: decision === 'approved' ? 'key_account_order_director_approved' : 'key_account_order_rejected',
      title: decision === 'approved' ? 'On-behalf PO approved by owner' : 'On-behalf PO rejected by owner',
      message:
        decision === 'approved'
          ? `${actorName} approved PO ${po.po_number}. Status is now ${String(nextStatus || '').replace(/_/g, ' ')}.`
          : `${actorName} rejected PO ${po.po_number}.`,
      referenceType: 'key_account_purchase_order',
      referenceId: po.id,
    });
  };

  const requestOwnerApprove = (po?: Row | null) => {
    const target = po ?? active;
    if (!target || !canOwnerApprove(target)) return;
    setOwnerApproveTarget(target);
  };

  const ownerApprove = async (po?: Row | null) => {
    const target = po ?? ownerApproveTarget ?? active;
    if (!target || !user?.id || !canOwnerApprove(target)) return;
    const poId = target.id;
    // After the order owner confirms an on-behalf PO, Sales Admin handles RFPF / warehouse submit.
    const nextStatus = 'admin_pending';
    const ok = await updateWorkflow(poId, {
      workflow_status: nextStatus,
    } as any);
    if (ok) {
      void logPurchaseOrderEvent({
        purchaseOrderId: poId,
        eventType: 'approved',
        note: 'Approved by order owner (created on behalf by Sales Admin)',
        createdBy: user.id,
      });
      notifyCreatorOfOwnerDecision(target, 'approved', nextStatus);
      setOwnerApproveTarget(null);
    }
  };

  const ownerReject = async (po?: Row | null) => {
    const target = po ?? active;
    if (!target || !user?.id || !canOwnerApprove(target)) return;
    const poId = target.id;
    const ok = await updateWorkflow(poId, {
      workflow_status: 'rejected',
      status: 'rejected',
    } as any);
    if (ok) {
      void logPurchaseOrderEvent({
        purchaseOrderId: poId,
        eventType: 'rejected',
        note: 'Rejected by order owner (created on behalf by Sales Admin)',
        createdBy: user.id,
      });
      notifyCreatorOfOwnerDecision(target, 'rejected');
    }
  };

  const salesAdminSaveRfpf = async () => {
    if (!active) return;
    if (!canSaveRfpf(active)) {
      toast({
        variant: 'destructive',
        title: 'Cannot save RFPF',
        description: active.rfpf_number?.trim()
          ? 'RFPF is already saved. Use Edit to correct it.'
          : 'RFPF can only be saved while workflow status is Admin pending or Warehouse reserved.',
      });
      return;
    }
    const rfpf = rfpfDraft.trim();
    if (!rfpf) {
      toast({ variant: 'destructive', title: 'RFPF required', description: 'Enter the RFPF number to save.' });
      return;
    }
    setActingId(active.id);
    markLocalRefresh();
    try {
      await dispatch(
        setKAPoRfpf({ poId: active.id, rfpfNumber: rfpf, reason: null })
      ).unwrap();
      await fetchRows(false);
      setActive((prev) => (prev ? { ...prev, rfpf_number: rfpf } : prev));
      toast({ title: 'RFPF saved' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e?.message || 'Failed to save RFPF' });
    } finally {
      setActingId(null);
    }
  };

  const handleOpenEditRfpf = () => {
    if (!active) return;
    if (!canEditRfpf(active)) {
      toast({
        variant: 'destructive',
        title: 'Edit limit reached',
        description: `This RFPF can only be edited up to ${MAX_RFPF_EDITS} times.`,
      });
      return;
    }
    setEditRfpfDraft(active.rfpf_number || '');
    setEditRfpfReason('');
    setEditRfpfOpen(true);
  };

  const salesAdminSubmitRfpfEdit = async () => {
    if (!active) return;
    if (!canEditRfpf(active)) {
      toast({
        variant: 'destructive',
        title: 'Edit limit reached',
        description: `This RFPF can only be edited up to ${MAX_RFPF_EDITS} times.`,
      });
      return;
    }
    const rfpf = editRfpfDraft.trim();
    const reason = editRfpfReason.trim();
    if (!rfpf) {
      toast({ variant: 'destructive', title: 'RFPF required', description: 'Enter the corrected RFPF number.' });
      return;
    }
    if (!reason) {
      toast({ variant: 'destructive', title: 'Reason required', description: 'Explain why this RFPF is being changed.' });
      return;
    }
    if (rfpf === active.rfpf_number?.trim()) {
      toast({ variant: 'destructive', title: 'No change', description: 'New RFPF must differ from the current value.' });
      return;
    }
    setSubmittingRfpfEdit(true);
    markLocalRefresh();
    try {
      await dispatch(
        setKAPoRfpf({ poId: active.id, rfpfNumber: rfpf, reason })
      ).unwrap();
      await fetchRows(false);
      await fetchRfpfRevisions(active.id);
      setActive((prev) => (prev ? { ...prev, rfpf_number: rfpf } : prev));
      setRfpfDraft(rfpf);
      setEditRfpfOpen(false);
      setEditRfpfDraft('');
      setEditRfpfReason('');
      toast({ title: 'RFPF updated' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: e?.message || 'Failed to update RFPF' });
    } finally {
      setSubmittingRfpfEdit(false);
    }
  };

  const salesAdminSubmitToWarehouse = async (po?: Row | null): Promise<boolean> => {
    const target = po ?? active;
    if (!target || !user?.id) return false;

    // Release to warehouse queue after admin review; RFPF may already be entered before this step.
    // Keep `status` as pending so the existing Warehouse inbox can approve it.
    const poId = target.id;
    const ok = await updateWorkflow(poId, {
      workflow_status: 'warehouse_reserved',
      admin_approved_at: new Date().toISOString(),
      admin_approved_by: user.id,
      custom_pricing_confirmed: true,
      status: 'pending',
    } as any);
    if (ok) {
      void logPurchaseOrderEvent({
        purchaseOrderId: poId,
        eventType: 'admin_submitted',
        note:
          warehouseSubmitMode === 'with_rfpf'
            ? 'Submitted to warehouse by sales admin (with RFPF)'
            : 'Submitted to warehouse by sales admin (without RFPF)',
        createdBy: user.id,
      });
    }
    return ok;
  };

  /** Submit from the detail dialog: optionally save RFPF first based on Sales Admin choice. */
  const salesAdminSubmitFromDialog = async () => {
    if (!active || !user?.id || !canSubmitToWarehouse(active)) return;

    const withRfpf = warehouseSubmitMode === 'with_rfpf';
    const existingRfpf = active.rfpf_number?.trim() || '';
    const draftRfpf = rfpfDraft.trim();

    if (withRfpf && !existingRfpf && !draftRfpf) {
      toast({
        variant: 'destructive',
        title: 'RFPF required',
        description: 'Enter an RFPF number, or choose Submit without RFPF.',
      });
      return;
    }

    setActingId(active.id);
    markLocalRefresh();
    try {
      if (withRfpf && !existingRfpf && draftRfpf) {
        await dispatch(
          setKAPoRfpf({ poId: active.id, rfpfNumber: draftRfpf, reason: null })
        ).unwrap();
        setActive((prev) => (prev ? { ...prev, rfpf_number: draftRfpf } : prev));
      }

      const ok = await salesAdminSubmitToWarehouse(active);
      if (!ok) return;
      toast({
        title: 'Submitted to warehouse',
        description: withRfpf
          ? 'PO queued with RFPF for warehouse fulfillment.'
          : 'PO queued without RFPF. You can still add RFPF while warehouse reserved.',
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Submit failed',
        description: e?.message || 'Failed to submit to warehouse',
      });
    } finally {
      setActingId(null);
    }
  };

  const submitRemainingPayment = async () => {
    if (!active || !user?.company_id) return;
    const remaining = paymentAvailableToApply;
    const rawAmt = parseFloat(String(newPayAmount).replace(/,/g, ''));
    const rawDiscount = parseFloat(String(newPaySettlementDiscount).replace(/,/g, ''));
    const amt = newPayAmount.trim() === '' ? 0 : Math.round(rawAmt * 100) / 100;
    const discount =
      newPaySettlementDiscount.trim() === '' ? 0 : Math.round(rawDiscount * 100) / 100;
    const reason = newPaySettlementReason.trim();

    if ((!Number.isFinite(amt) || amt < 0) && newPayAmount.trim() !== '') {
      toast({ variant: 'destructive', title: 'Amount', description: 'Enter a valid payment amount.' });
      return;
    }
    if (
      (!Number.isFinite(discount) || discount < 0) &&
      newPaySettlementDiscount.trim() !== ''
    ) {
      toast({
        variant: 'destructive',
        title: 'Settlement discount',
        description: 'Enter a valid settlement discount.',
      });
      return;
    }
    if (amt <= 0 && discount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Amount required',
        description: 'Enter a payment amount and/or settlement discount.',
      });
      return;
    }
    if (amt + discount > remaining + 0.0001) {
      toast({
        variant: 'destructive',
        title: 'Amount too high',
        description: `You can record up to ₱${remaining.toFixed(2)}${
          pendingDiscountSoFar > 0
            ? ` (₱${pendingDiscountSoFar.toFixed(2)} is reserved for a pending discount)`
            : ''
        }.`,
      });
      return;
    }
    if (discount > 0 && !reason) {
      toast({
        variant: 'destructive',
        title: 'Reason required',
        description: 'Explain why a settlement discount is applied.',
      });
      return;
    }
    if (amt > 0 && newPayMethod === 'BANK_TRANSFER' && !newPayBank) {
      toast({ variant: 'destructive', title: 'Bank required', description: 'Select a bank.' });
      return;
    }

    let allocations:
      | Array<{ brandId: string; amount: number; discount: number }>
      | undefined;
    if (openBrandSplitRows.length === 1) {
      allocations = [
        {
          brandId: openBrandSplitRows[0].brandId,
          amount: amt,
          discount,
        },
      ];
    } else if (openBrandSplitRows.length > 1) {
      const built = buildBrandPaymentAllocations({
        brands: openBrandSplitRows,
        cashByBrand: newPayCashByBrand,
        cashTotal: amt,
        discountTotal: discount,
      });
      if (built.error) {
        toast({
          variant: 'destructive',
          title: 'Brand split',
          description: built.error,
        });
        return;
      }
      allocations = built.allocations;
    }

    setSavingPayment(true);
    markLocalRefresh();
    try {
      let proofPath: string | null = null;
      if (newPayFile && amt > 0) {
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

      const needsDiscountApproval = discount > 0 && !isSalesHead;

      const payResult = await dispatch(
        recordKAPoListPayment({
          poId: active.id,
          amount: amt,
          settlementDiscount: discount,
          settlementDiscountReason: reason,
          paymentMethod: amt > 0 ? newPayMethod : 'CASH',
          bankType: amt > 0 && newPayMethod === 'BANK_TRANSFER' ? newPayBank : null,
          proofStoragePath: proofPath,
          allocations,
        })
      ).unwrap();

      toast({
        title: needsDiscountApproval
          ? amt > 0
            ? 'Payment recorded — discount pending Sales Head approval'
            : 'Settlement discount submitted for Sales Head approval'
          : discount > 0 && amt <= 0
            ? 'Settlement discount recorded'
            : 'Payment recorded',
      });
      setRecordPayOpen(false);
      setNewPayAmount('');
      setNewPaySettlementDiscount('');
      setNewPaySettlementReason('');
      setNewPayFile(null);
      setNewPayCashByBrand({});
      setNewPayPerPieceDiscount('');
      setPaymentHistoryOpen(true);
      await loadPaymentSummary(active.id);
      await loadPayments(active.id);
      await loadDiscountRequests(active.id);
      await loadBrandBalances(active.id);
      if (isSalesHead) void loadCompanyPendingDiscounts();
      if (payResult.key_account_payment_status) {
        setActive((prev) =>
          prev
            ? {
                ...prev,
                key_account_payment_status: payResult.key_account_payment_status as KeyAccountPoPaymentStatus,
              }
            : prev
        );
      }
      await fetchRows(false);
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

  const approveSettlementDiscount = async (requestId: string) => {
    setActingDiscountId(requestId);
    markLocalRefresh();
    try {
      const result = await dispatch(approveKASettlementDiscount(requestId)).unwrap();
      toast({ title: 'Settlement discount approved' });
      const poId = result.purchase_order_id || active?.id;
      if (poId) {
        await loadPaymentSummary(poId);
        await loadPayments(poId);
        await loadDiscountRequests(poId);
        await loadBrandBalances(poId);
      }
      await loadCompanyPendingDiscounts();
      await fetchRows(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Approval failed',
        description: e?.message || 'Could not approve settlement discount',
      });
    } finally {
      setActingDiscountId(null);
    }
  };

  const rejectSettlementDiscount = async () => {
    if (!rejectDiscountId) return;
    setActingDiscountId(rejectDiscountId);
    markLocalRefresh();
    try {
      const result = await dispatch(
        rejectKASettlementDiscount({
          requestId: rejectDiscountId,
          reason: rejectDiscountReason.trim() || null,
        })
      ).unwrap();
      toast({ title: 'Settlement discount rejected' });
      const poId = result.purchase_order_id || active?.id;
      if (poId) {
        await loadDiscountRequests(poId);
        await loadBrandBalances(poId);
      }
      setRejectDiscountId(null);
      setRejectDiscountReason('');
      await loadCompanyPendingDiscounts();
      await fetchRows(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Reject failed',
        description: e?.message || 'Could not reject settlement discount',
      });
    } finally {
      setActingDiscountId(null);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(PO_TABLE_FREEZE_STORAGE_KEY, frozenColumn);
    } catch {
      /* ignore */
    }
  }, [frozenColumn]);

  const freezeCol = (columnId: PoTableColumnId, className?: string, header = false) =>
    getPoTableFreezeProps(columnId, frozenColumn, { className, header });

  const toggleFrozenColumn = (columnId: Exclude<PoTableColumnId, 'actions'>) => {
    setFrozenColumn((current) => (current === columnId ? 'none' : columnId));
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
                  ? 'Create POs on behalf of Sales Head, Director, or KAM; final review and submit to warehouse.'
                  : isSalesHead
                    ? 'Create POs for admin review; Sales Admin submits to warehouse. Approve settlement discounts from KAMs and Directors.'
                    : isReadOnlyAccounting
                      ? 'View purchase orders, delivery, dispatch, and payment history.'
                      : 'Purchase Orders'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center sm:justify-end sm:ml-auto">
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
          {/* {(isSalesAdmin || isSalesHead || isDirector || isKAM) && !isReadOnlyAccounting && (
            <Button
              className="w-full sm:w-auto shrink-0"
              onClick={() => navigate('/key-accounts/create-order')}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Purchase Order
            </Button>
          )} */}
        </div>
      </div>

      {isSalesHead && companyPendingDiscounts.length > 0 ? (
        <Card className="border-amber-200/90 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Pending settlement discounts
              <Badge variant="secondary">{companyPendingDiscounts.length}</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              KAM / Director / Admin discount requests waiting for your approval.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {companyPendingDiscounts.map((req) => {
              const poNumber =
                (req.purchase_order as { po_number?: string | null } | null)?.po_number || 'PO';
              const requesterName =
                req.requester?.full_name || req.requester?.email || 'Unknown requester';
              return (
                <div
                  key={req.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border bg-background p-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-medium tabular-nums">
                      {poNumber} · ₱{Number(req.settlement_discount).toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {requesterName} · {new Date(req.created_at).toLocaleString()}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{req.settlement_discount_reason}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actingDiscountId === req.id}
                      onClick={() => {
                        setRejectDiscountId(req.id);
                        setRejectDiscountReason('');
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={actingDiscountId === req.id}
                      onClick={() => void approveSettlementDiscount(req.id)}
                    >
                      {actingDiscountId === req.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Approve'
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
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
        <Card
          className="border-amber-200/80 dark:border-amber-900/50 cursor-pointer transition-colors hover:bg-amber-50/60 dark:hover:bg-amber-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
          role="button"
          tabIndex={0}
          onClick={() => setOutstandingDialogOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOutstandingDialogOpen(true);
            }
          }}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-red-500 ring-2 ring-red-500/25"
                aria-hidden
              />
              Unpaid / Partial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
              {paymentOutstanding.total}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {paymentOutstanding.unpaid} unpaid · {paymentOutstanding.partial} partial
            </p>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-1">
              Click to view balances
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
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
                <div className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {FREEZEABLE_COLUMNS.map((column) => (
                        <PoFreezeTableHead
                          key={column.id}
                          columnId={column.id}
                          frozenColumn={frozenColumn}
                          onToggle={toggleFrozenColumn}
                          className={
                            column.id === 'balance' || column.id === 'total' ? 'text-right' : undefined
                          }
                        />
                      ))}
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                          No purchase orders found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedRows.map((po: Row) => (
                        <TableRow key={po.id} className="group">
                        <TableCell {...freezeCol('po', 'font-mono font-medium')}>
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
                            ) : String(po.po_order_kind || '') === 'consignment' ? (
                              <Badge variant="outline" className="text-xs font-normal border-amber-300 text-amber-800 bg-amber-50">
                                Consignment
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
                          <TableCell {...freezeCol('created', 'whitespace-nowrap text-sm text-muted-foreground')}>
                            {po.created_at
                              ? format(new Date(po.created_at), 'MMM d, yyyy h:mm a')
                              : '—'}
                          </TableCell>
                          <TableCell {...freezeCol('owner', 'min-w-[10rem]')}>
                            <div className="text-sm font-medium text-foreground">
                              {po.kam?.full_name?.trim() || po.kam?.email?.trim() || '—'}
                            </div>
                          </TableCell>
                          <TableCell {...freezeCol('client')}>{po.client?.client_name || '—'}</TableCell>
                          <TableCell {...freezeCol('shop')}>{po.shop?.shop_name || '—'}</TableCell>
                          <TableCell {...freezeCol('status')}>
                            <Badge className={keyAccountWorkflowBadgeClass(po.workflow_status)}>
                              {keyAccountWorkflowLabel(po.workflow_status)}
                            </Badge>
                          </TableCell>
                          <TableCell {...freezeCol('payment')}>
                            {po.key_account_payment_mode ? (
                              <Badge className={paymentStatusBadgeClass(po.key_account_payment_status || 'unpaid')}>
                                {String(po.key_account_payment_status || 'unpaid').replace(/_/g, ' ')}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell {...freezeCol('commissioned')}>
                            {po.commissioned_at ? (
                              <Badge className="bg-green-500 text-white">Commissioned</Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell {...freezeCol('dr', 'font-medium')}>{po.dr_number || '—'}</TableCell>
                          <TableCell {...freezeCol('rfpf', 'font-medium')}>{po.rfpf_number || '—'}</TableCell>
                          <TableCell {...freezeCol('balance', 'text-right font-semibold tabular-nums')}>
                            {po.key_account_payment_mode && po.remaining_balance != null
                              ? `₱${Number(po.remaining_balance).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : <span className="text-muted-foreground font-normal">—</span>}
                          </TableCell>
                          <TableCell {...freezeCol('total', 'text-right font-semibold')}>₱{Number(po.total_amount || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {!isReadOnlyAccounting && canOwnerApprove(po) ? (
                                <Button
                                  size="sm"
                                  className="h-8"
                                  disabled={actingId === po.id}
                                  onClick={() => requestOwnerApprove(po)}
                                >
                                  {actingId === po.id ? (
                                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4 mr-1.5" />
                                  )}
                                  Approve
                                </Button>
                              ) : !isReadOnlyAccounting && canDirectorApprove(po) ? (
                                <Button
                                  size="sm"
                                  className="h-8"
                                  disabled={actingId === po.id}
                                  onClick={() => void directorApprove(po)}
                                >
                                  {actingId === po.id ? (
                                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4 mr-1.5" />
                                  )}
                                  Approve
                                </Button>
                              ) : !isReadOnlyAccounting && canSubmitToWarehouse(po) ? (
                                <Button
                                  size="sm"
                                  className="h-8"
                                  onClick={() => void openView(po)}
                                >
                                  <Send className="h-4 w-4 mr-1.5" />
                                  Review
                                </Button>
                              ) : null}
                              {/* Rebate row action — uncomment and replace `: null}` above with this branch to restore:
                              ) : !isReadOnlyAccounting &&
                                isDeliveredKeyAccountOrder(po) &&
                                !isRebateDerivedPurchaseOrder(po) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  onClick={() =>
                                    navigate(`/key-accounts/rebates/new?poId=${po.id}`)
                                  }
                                >
                                  <RotateCcw className="h-4 w-4 mr-1.5" />
                                  Rebate
                                </Button>
                              ) : null}
                              */}

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    aria-label={`More actions for ${po.po_number}`}
                                    disabled={actingId === po.id || cofLoadingId === po.id}
                                  >
                                    {actingId === po.id || cofLoadingId === po.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <MoreVertical className="h-4 w-4" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  {(canOwnerApprove(po) || canDirectorApprove(po)) &&
                                    !isReadOnlyAccounting && (
                                      <>
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onSelect={() =>
                                            void (canOwnerApprove(po)
                                              ? ownerReject(po)
                                              : directorReject(po))
                                          }
                                        >
                                          <X className="mr-2 h-4 w-4" />
                                          Reject
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                      </>
                                    )}
                                  {canEditKeyAccountPo(po, user) && (
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        navigate(`/key-accounts/purchase-orders/${po.id}/edit`)
                                      }
                                    >
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Edit
                                    </DropdownMenuItem>
                                  )}
                                  {po.company_account_type === 'Key Accounts' && (
                                    <DropdownMenuItem
                                      disabled={cofLoadingId === po.id}
                                      onSelect={() => void openCofForPo(po)}
                                    >
                                      <FileText className="mr-2 h-4 w-4" />
                                      COF
                                    </DropdownMenuItem>
                                  )}
                                  {canActOnCommission(po) && (
                                    <DropdownMenuItem
                                      disabled={!!po.commissioned_at}
                                      onSelect={() => openCommissionDialog(po)}
                                    >
                                      <BadgeCheck className="mr-2 h-4 w-4" />
                                      {po.commissioned_at ? 'Commissioned' : 'Mark as commissioned'}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onSelect={() => setHistoryOrder(po)}>
                                    <History className="mr-2 h-4 w-4" />
                                    History
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => void openView(po)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
                      ) : String(active.po_order_kind || '') === 'consignment' ? (
                        <Badge variant="outline" className="border-amber-300 text-amber-800 bg-amber-50">
                          Consignment
                        </Badge>
                      ) : null}
                    </div>
                    {rebateSource ? (
                      <>
                        <div className="text-xs text-muted-foreground">Source PO</div>
                        <div className="text-lg font-bold font-mono break-all flex flex-wrap items-center gap-2">
                          <span>{rebateSource.source_po_number}</span>
                          <Badge variant="outline">{rebateSource.rebate_number}</Badge>
                          {active.source_rebate_id ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1"
                              onClick={() => openRebateDetail(active.source_rebate_id!)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View rebate
                            </Button>
                          ) : null}
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
                    {active.commissioned_at ? (
                      <Badge className="bg-emerald-600 text-white">
                        <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                        Commissioned
                      </Badge>
                    ) : null}
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

                {active.workflow_status === 'owner_pending' && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                    Waiting for order owner
                    {active.kam?.full_name ? ` (${active.kam.full_name})` : ''} to approve this
                    Sales Admin–created PO before it continues the approval workflow.
                  </div>
                )}

                {isDoneWorkflow(active) && (
                  <Card className="border-dashed">
                    <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Rebates
                      </CardTitle>
                      {/* {isDeliveredKeyAccountOrder(active) &&
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
                      )} */}
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
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1"
                                    onClick={() => openRebateDetail(r.id)}
                                  >
                                    <Eye className="h-4 w-4" />
                                    View
                                  </Button>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Order date</Label>
                    <div className="font-medium">{new Date(active.order_date).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Expected</Label>
                    <div className="font-medium">
                      {active.expected_delivery_date
                        ? new Date(active.expected_delivery_date).toLocaleDateString()
                        : '—'}
                    </div>
                  </div>
                  {isKeyAccountOnBehalfPo(active) ? (
                    <div>
                      <Label className="text-xs text-muted-foreground">On behalf of</Label>
                      <div className="font-medium">{active.kam?.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{active.kam?.email || ''}</div>
                    </div>
                  ) : null}
                  <div>
                    <Label className="text-xs text-muted-foreground">Created by</Label>
                    <div className="font-medium">
                      {active.created_by_user?.full_name ||
                        (active.created_by === active.kam_id ? active.kam?.full_name : null) ||
                        '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {active.created_by_user?.email ||
                        (active.created_by === active.kam_id ? active.kam?.email : '') ||
                        ''}
                    </div>
                    {isKeyAccountOnBehalfPo(active) ? (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Created on behalf of order owner
                      </div>
                    ) : null}
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
                        {active.commissioned_at ? (
                          <Badge className="bg-emerald-600 text-white">Commissioned</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Not commissioned
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {active.commissioned_at ? (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
                          Marked commissioned {formatDateTimeManila(active.commissioned_at)} 
                        </div>
                      ) : null}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                        <div>
                          <Label className="text-xs text-muted-foreground">Terms</Label>
                          <p className="font-medium whitespace-pre-wrap">
                            {active.key_account_payment_terms || '—'}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Terms source</Label>
                          <div className="mt-0.5">
                            {active.key_account_payment_terms_source ? (
                              <Badge variant="outline" className="capitalize">
                                {active.key_account_payment_terms_source === 'client'
                                  ? 'Client profile'
                                  : active.key_account_payment_terms_source === 'company'
                                    ? 'Company'
                                    : 'Custom'}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Term created by</Label>
                          <div className="font-medium">
                            {active.key_account_payment_terms_source === 'client'
                              ? 'Client profile'
                              : active.payment_terms_creator?.full_name?.trim() ||
                                active.payment_terms_creator?.email ||
                                '—'}
                          </div>
                          {active.key_account_payment_terms_source !== 'client' &&
                          active.payment_terms_creator?.email &&
                          active.payment_terms_creator?.full_name?.trim() ? (
                            <div className="text-xs text-muted-foreground">
                              {active.payment_terms_creator.email}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-2">
                        <Label className="text-xs text-muted-foreground">Notify KAM</Label>
                        <div className="font-medium">
                          {active.key_account_notification_option &&
                          active.key_account_notification_option !== 'none' &&
                          active.key_account_notification_date ? (
                            <>
                              {formatISODateManila(active.key_account_notification_date)}{' '}
                              <span className="text-muted-foreground text-xs">
                                ({notificationOptionLabel(active.key_account_notification_option)})
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                        {active.key_account_notification_sent_at ? (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Sent {formatDateTimeManila(active.key_account_notification_sent_at)} (Asia/Manila)
                          </div>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
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
                          <span className="text-muted-foreground">Settlement discount</span>
                          <div className="font-semibold">
                            {paymentSummaryLoading
                              ? '…'
                              : `₱${(paymentSummaryDiscount ?? 0).toFixed(2)}`}
                          </div>
                        </div>
                        {pendingDiscountSoFar > 0 ? (
                          <div>
                            <span className="text-muted-foreground">Pending discount approval</span>
                            <div className="font-semibold text-amber-700 dark:text-amber-400">
                              ₱{pendingDiscountSoFar.toFixed(2)}
                            </div>
                          </div>
                        ) : null}
                        <div>
                          <span className="text-muted-foreground">Remaining</span>
                          <div className="font-semibold">
                            ₱
                            {paymentSummaryLoading
                              ? '…'
                              : Math.max(0, paymentRemainingBalance).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {(brandBalancesStatus === 'loading' || brandBalances.length > 0) && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Brand remaining</Label>
                          {brandBalancesStatus === 'loading' && brandBalances.length === 0 ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading brand balances…
                            </div>
                          ) : (
                            <div className="rounded-md border overflow-x-auto">
                              <Table className="text-xs">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Brand</TableHead>
                                    <TableHead className="text-right">Billed</TableHead>
                                    <TableHead className="text-right">Paid</TableHead>
                                    <TableHead className="text-right">Discount</TableHead>
                                    <TableHead className="text-right">Remaining</TableHead>
                                    <TableHead>Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {brandBalances.map((row) => (
                                    <TableRow key={row.brandId}>
                                      <TableCell className="font-medium whitespace-nowrap">
                                        {row.brandName}
                                        {row.pendingDiscount > 0 ? (
                                          <div className="text-[10px] font-normal text-amber-700 dark:text-amber-400">
                                            ₱{row.pendingDiscount.toFixed(2)} pending discount
                                          </div>
                                        ) : null}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        ₱{row.billed.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        ₱{row.paid.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        ₱{row.discount.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-right font-semibold tabular-nums">
                                        ₱{row.remaining.toFixed(2)}
                                      </TableCell>
                                      <TableCell>
                                        <Badge className={brandBalanceStatusClass(row.status)}>
                                          {row.status}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                          {unallocatedPaid > 0.001 || unallocatedDiscount > 0.001 ? (
                            <p className="text-[11px] text-muted-foreground">
                              Legacy unallocated on this PO: cash ₱{unallocatedPaid.toFixed(2)}
                              {unallocatedDiscount > 0.001
                                ? ` · discount ₱${unallocatedDiscount.toFixed(2)}`
                                : ''}
                              . New payments should be assigned to a brand.
                            </p>
                          ) : null}
                        </div>
                      )}

                      {canRecordRemainingPayment(active) && !isReadOnlyAccounting && (
                        <Button type="button" variant="default" size="sm" onClick={() => setRecordPayOpen(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          {String(active.key_account_payment_status || 'unpaid') === 'unpaid'
                            ? 'Record payment'
                            : 'Record remaining payment'}
                        </Button>
                      )}

                      {(discountRequestsLoading || discountRequests.length > 0) && (
                        <div className="space-y-2 rounded-md border border-amber-200/80 bg-amber-50/30 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                          <div className="text-sm font-medium">Settlement discount requests</div>
                          {discountRequestsLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading…
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {discountRequests.map((req) => (
                                <div key={req.id} className="rounded-md border bg-background p-3 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2 justify-between">
                                    <div className="font-semibold tabular-nums">
                                      ₱{Number(req.settlement_discount).toFixed(2)}
                                    </div>
                                    <Badge
                                      variant={
                                        req.status === 'pending'
                                          ? 'secondary'
                                          : req.status === 'approved'
                                            ? 'default'
                                            : 'destructive'
                                      }
                                    >
                                      {req.status === 'pending'
                                        ? 'Pending Sales Head'
                                        : req.status === 'approved'
                                          ? 'Approved'
                                          : 'Rejected'}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {(req.requester?.full_name || req.requester?.email || 'Requester') +
                                      ' · ' +
                                      new Date(req.created_at).toLocaleString()}
                                  </p>
                                  <p className="text-sm whitespace-pre-wrap">{req.settlement_discount_reason}</p>
                                  {req.status === 'rejected' && req.rejection_reason ? (
                                    <p className="text-xs text-destructive whitespace-pre-wrap">
                                      Rejected: {req.rejection_reason}
                                    </p>
                                  ) : null}
                                  {isSalesHead && req.status === 'pending' && !isReadOnlyAccounting ? (
                                    <div className="flex gap-2 pt-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={actingDiscountId === req.id}
                                        onClick={() => {
                                          setRejectDiscountId(req.id);
                                          setRejectDiscountReason('');
                                        }}
                                      >
                                        Reject
                                      </Button>
                                      <Button
                                        size="sm"
                                        disabled={actingDiscountId === req.id}
                                        onClick={() => void approveSettlementDiscount(req.id)}
                                      >
                                        {actingDiscountId === req.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          'Approve'
                                        )}
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
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
                            <div className="space-y-3">
                              {payments.map((p) => (
                                <div key={p.id} className="rounded-md border p-3 space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                    <div>
                                      <span className="text-muted-foreground">Date</span>
                                      <div className="font-medium">
                                        {new Date(p.created_at).toLocaleString()}
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Cash amount</span>
                                      <div className="font-semibold tabular-nums">
                                        ₱{Number(p.amount).toFixed(2)}
                                      </div>
                                    </div>
                                    {Number(p.settlement_discount || 0) > 0 ? (
                                      <div className="sm:col-span-2">
                                        <span className="text-muted-foreground">Settlement discount</span>
                                        <div className="font-semibold tabular-nums text-slate-700">
                                          ₱{Number(p.settlement_discount || 0).toFixed(2)}
                                        </div>
                                        {p.settlement_discount_reason ? (
                                          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                                            {p.settlement_discount_reason}
                                          </p>
                                        ) : null}
                                      </div>
                                    ) : null}
                                    {formatPaymentAllocationSummary(
                                      (p as { allocations?: Parameters<typeof formatPaymentAllocationSummary>[0] })
                                        .allocations
                                    ).length > 0 ? (
                                      <div className="sm:col-span-2">
                                        <span className="text-muted-foreground">Applied to</span>
                                        <div className="mt-1 space-y-1">
                                          {formatPaymentAllocationSummary(
                                            (p as { allocations?: Parameters<typeof formatPaymentAllocationSummary>[0] })
                                              .allocations
                                          ).map((row) => (
                                            <div key={row.brand} className="text-sm">
                                              <span className="font-medium">{row.brand}</span>
                                              {row.cash > 0 ? ` · cash ₱${row.cash.toFixed(2)}` : ''}
                                              {row.discount > 0
                                                ? ` · discount ₱${row.discount.toFixed(2)}`
                                                : ''}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                    <div>
                                      <span className="text-muted-foreground">Method</span>
                                      <div className="font-medium">
                                        {Number(p.amount) > 0
                                          ? `${p.payment_method}${p.bank_type ? ` · ${p.bank_type}` : ''}`
                                          : 'Settlement only'}
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Recorded by</span>
                                      <div className="font-medium">
                                        {(p as any).recorder?.full_name || '—'}
                                      </div>
                                    </div>
                                  </div>
                                  {p.proof_storage_path ? (
                                    <KeyAccountPaymentProofStoredPreview
                                      storagePath={p.proof_storage_path}
                                      compact
                                      label="Payment proof"
                                      showViewFull
                                    />
                                  ) : (
                                    <p className="text-xs text-muted-foreground">No proof attached.</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            Payment proofs are shown inline using a short-lived signed URL.
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
                    purchaseOrder={active as any}
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

                {String(active.po_order_kind || '') === 'rebate_fulfillment' && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Expected return items (disputed lines)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Replacement fulfillment deducts the replacement items. Disputed items only go back to inventory
                        once the warehouse physically receives them (not automatic).
                      </p>
                      {rebateReturnLinesLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading return items…
                        </div>
                      ) : rebateReturnLines.length === 0 ? (
                        <div className="text-sm text-muted-foreground">—</div>
                      ) : (
                        <div className="w-full overflow-x-auto rounded-md border">
                          <Table className="min-w-[720px]">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="whitespace-nowrap">Brand</TableHead>
                                <TableHead className="whitespace-nowrap">Variant</TableHead>
                                <TableHead className="whitespace-nowrap">Warehouse</TableHead>
                                <TableHead className="whitespace-nowrap">Type</TableHead>
                                <TableHead className="text-right whitespace-nowrap">Qty</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rebateReturnLines.map((l, idx) => (
                                <TableRow key={`${l.variant_name}-${idx}`}>
                                  <TableCell className="font-medium whitespace-nowrap">{l.brand_name}</TableCell>
                                  <TableCell className="whitespace-nowrap">{l.variant_name}</TableCell>
                                  <TableCell className="text-sm whitespace-nowrap">
                                    {l.warehouse_location_id
                                      ? linkedWarehouseNamesById[l.warehouse_location_id] || '—'
                                      : '—'}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">{String(l.variant_type || '—').toUpperCase()}</TableCell>
                                  <TableCell className="text-right whitespace-nowrap font-semibold">
                                    {l.disputed_quantity}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <RebateReplacementPricingSummary order={active} rebate={rebateSource} />

                {isSalesAdmin && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Sales Admin actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {canSalesAdminReview(active) ? (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Submit action</Label>
                            <RadioGroup
                              value={warehouseSubmitMode}
                              onValueChange={(value) =>
                                setWarehouseSubmitMode(value as 'without_rfpf' | 'with_rfpf')
                              }
                              className="gap-3"
                            >
                              <div className="flex items-start gap-2 rounded-md border p-3">
                                <RadioGroupItem
                                  value="without_rfpf"
                                  id="submit-without-rfpf"
                                  className="mt-0.5"
                                />
                                <div className="space-y-0.5">
                                  <Label
                                    htmlFor="submit-without-rfpf"
                                    className="font-medium cursor-pointer"
                                  >
                                    Submit without RFPF
                                  </Label>
                                  <p className="text-xs text-muted-foreground">
                                    Queue for warehouse now. RFPF can be added later while status is
                                    Warehouse reserved.
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-start gap-2 rounded-md border p-3">
                                <RadioGroupItem
                                  value="with_rfpf"
                                  id="submit-with-rfpf"
                                  className="mt-0.5"
                                />
                                <div className="space-y-0.5">
                                  <Label
                                    htmlFor="submit-with-rfpf"
                                    className="font-medium cursor-pointer"
                                  >
                                    Submit with RFPF
                                  </Label>
                                  <p className="text-xs text-muted-foreground">
                                    Save RFPF (if needed) and submit to warehouse in one step.
                                  </p>
                                </div>
                              </div>
                            </RadioGroup>
                          </div>

                          {warehouseSubmitMode === 'with_rfpf' ? (
                            active.rfpf_number?.trim() ? (
                              <div className="rounded-md border px-3 py-2">
                                <p className="text-xs text-muted-foreground">RFPF Number</p>
                                <p className="font-mono font-semibold">
                                  {active.rfpf_number.toUpperCase()}
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <Label htmlFor="submit-rfpf-input">RFPF Number *</Label>
                                <Input
                                  id="submit-rfpf-input"
                                  value={rfpfDraft}
                                  onChange={(e) => setRfpfDraft(e.target.value)}
                                  placeholder="Enter RFPF..."
                                />
                              </div>
                            )
                          ) : null}

                          <Button
                            onClick={() => void salesAdminSubmitFromDialog()}
                            disabled={
                              actingId === active.id ||
                              (warehouseSubmitMode === 'with_rfpf' &&
                                !active.rfpf_number?.trim() &&
                                !rfpfDraft.trim())
                            }
                          >
                            {actingId === active.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4 mr-2" />
                            )}
                            {warehouseSubmitMode === 'with_rfpf'
                              ? 'Submit with RFPF'
                              : 'Submit without RFPF'}
                          </Button>
                        </div>
                      ) : null}

                      {!canSalesAdminReview(active) && canSaveRfpf(active) ? (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label>RFPF Number</Label>
                            <Input
                              value={rfpfDraft}
                              onChange={(e) => setRfpfDraft(e.target.value)}
                              placeholder="Enter RFPF..."
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => void salesAdminSaveRfpf()}
                              disabled={actingId === active.id}
                            >
                              {actingId === active.id ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : null}
                              Save RFPF
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            RFPF can still be saved while this PO is Warehouse reserved.
                          </p>
                        </div>
                      ) : null}

                      {canManageRfpf(active) && active.rfpf_number?.trim() ? (
                        <div className="space-y-3">
                          <div className="rounded-md border overflow-hidden">
                            <div className="bg-muted/30 px-3 py-1.5 flex items-center justify-between text-muted-foreground font-semibold text-xs">
                              <span>
                                RFPF Number
                                {rfpfEditCount > 0 ? ' (corrected)' : ''}
                              </span>
                              {rfpfRevisionsLoading ? null : canEditRfpf(active) ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={handleOpenEditRfpf}
                                >
                                  <Pencil className="h-3 w-3 mr-1" />
                                  Edit ({rfpfEditCount}/{MAX_RFPF_EDITS})
                                </Button>
                              ) : rfpfEditCount >= MAX_RFPF_EDITS ? (
                                <span className="font-normal text-muted-foreground text-xs">
                                  Max edits reached ({MAX_RFPF_EDITS}/{MAX_RFPF_EDITS})
                                </span>
                              ) : null}
                            </div>
                            <div className="px-3 py-2">
                              <div className="text-lg font-bold font-mono">
                                {active.rfpf_number.toUpperCase()}
                              </div>
                            </div>
                          </div>
                          {rfpfRevisionsLoading ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Loading edit history…
                            </div>
                          ) : rfpfRevisions.length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground">
                                Edit history
                              </p>
                              <div className="rounded-md border divide-y">
                                {rfpfRevisions.map((revision) => (
                                  <RfpfRevisionEntry key={revision.id} revision={revision} />
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t px-4 py-4 sm:px-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {active && canEditKeyAccountPo(active, user) && (
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                onClick={() => {
                  setViewOpen(false);
                  navigate(`/key-accounts/purchase-orders/${active.id}/edit`);
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
            {active && (
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                onClick={() => setHistoryOrder(active)}
              >
                <History className="h-4 w-4 mr-2" />
                History
              </Button>
            )}
            {active && active.company_account_type === 'Key Accounts' && (
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                onClick={() => void openCofForActive()}
                disabled={cofLoadingId === active.id}
              >
                {cofLoadingId === active.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                COF
              </Button>
            )}
            {/* {active &&
              isDeliveredKeyAccountOrder(active) &&
              !isRebateDerivedPurchaseOrder(active) &&
              !isReadOnlyAccounting && (
              // <Button
              //   className="w-full sm:w-auto"
              //   onClick={() => {
              //     setViewOpen(false);
              //     navigate(`/key-accounts/rebates/new?poId=${active.id}`);
              //   }}
              // >
              //   <RotateCcw className="h-4 w-4 mr-2" />
              //   Create rebate
              // </Button>
            )} */}
            {active && canOwnerApprove(active) && !isReadOnlyAccounting && (
              <>
                <Button
                  className="w-full sm:w-auto"
                  variant="outline"
                  onClick={() => void ownerReject()}
                  disabled={actingId === active.id}
                >
                  {actingId === active.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <X className="h-4 w-4 mr-2" />}
                  Reject
                </Button>
                <Button className="w-full sm:w-auto" onClick={() => requestOwnerApprove()} disabled={actingId === active.id}>
                  {actingId === active.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  Approve as owner
                </Button>
              </>
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
            {active && canActOnCommission(active) && !active.commissioned_at ? (
              <Button
                className="w-full sm:w-auto"
                variant="secondary"
                disabled={actingId === active.id}
                onClick={() => openCommissionDialog(active)}
              >
                <BadgeCheck className="h-4 w-4 mr-2" />
                Mark as commissioned
              </Button>
            ) : null}
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!ownerApproveTarget}
        onOpenChange={(open) => {
          if (!open) setOwnerApproveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve on-behalf PO?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this on-behalf PO? It cannot be edited after
              approval. Please review the PO first.
              {ownerApproveTarget?.po_number ? (
                <>
                  {' '}
                  ({ownerApproveTarget.po_number})
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <AlertDialogCancel disabled={actingId === ownerApproveTarget?.id}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              disabled={!ownerApproveTarget || actingId === ownerApproveTarget?.id}
              onClick={() => {
                const po = ownerApproveTarget;
                setOwnerApproveTarget(null);
                if (po) void openView(po);
              }}
            >
              <Eye className="h-4 w-4 mr-2" />
              Review
            </Button>
            <AlertDialogAction
              disabled={actingId === ownerApproveTarget?.id}
              onClick={(e) => {
                e.preventDefault();
                void ownerApprove(ownerApproveTarget);
              }}
            >
              {actingId === ownerApproveTarget?.id ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Approving…
                </>
              ) : (
                'Yes, approve'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

          <Dialog
            open={recordPayOpen}
            onOpenChange={(open) => {
              setRecordPayOpen(open);
              if (!open) {
                setNewPayFile(null);
                setNewPaySettlementDiscount('');
                setNewPaySettlementReason('');
                setNewPayCashByBrand({});
                setNewPayPerPieceDiscount('');
              }
            }}
          >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                  ₱{Math.max(0, paymentRemainingBalance).toFixed(2)}
                </span>
                {pendingDiscountSoFar > 0 ? (
                  <span className="block text-xs mt-1 text-amber-700 dark:text-amber-400">
                    ₱{pendingDiscountSoFar.toFixed(2)} pending Sales Head approval (not deducted
                    yet). Available to record now: ₱
                    {Math.max(0, paymentAvailableToApply).toFixed(2)}.
                  </span>
                ) : null}
              </p>
              <div className="space-y-2">
                <Label>Cash amount (₱)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newPayAmount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw.trim() === '') {
                      setNewPayAmount('');
                      return;
                    }
                    const n = parseFloat(String(raw).replace(/,/g, ''));
                    if (!Number.isFinite(n) || n < 0) {
                      setNewPayAmount(raw);
                      return;
                    }
                    const maxCash = money2(
                      Math.max(0, paymentAvailableToApply - parsedNewPayDiscount)
                    );
                    if (n - maxCash > 0.0001) {
                      setNewPayAmount(maxCash > 0 ? String(maxCash) : '');
                      return;
                    }
                    setNewPayAmount(raw);
                  }}
                  placeholder="Cash collected (optional if discount only)"
                />
                <p className="text-[11px] text-muted-foreground">
                  Cash + settlement discount cannot exceed remaining. If you add a discount, cash is
                  reduced automatically (e.g. remaining ₱300 with ₱30 discount → cash max ₱270).
                </p>
                {openBrandSplitRows.length === 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto px-0 text-xs"
                    onClick={() => {
                      const remainingForBrand = Math.min(
                        openBrandSplitRows[0].remaining,
                        paymentAvailableToApply
                      );
                      const cash = Math.max(
                        0,
                        Math.round((remainingForBrand - parsedNewPayDiscount) * 100) / 100
                      );
                      setNewPayAmount(cash > 0 ? String(cash) : '');
                    }}
                  >
                    Fill remaining cash for {openBrandSplitRows[0].brandName}
                  </Button>
                ) : null}
              </div>
              {openBrandSplitRows.length > 0 ? (
                <KeyAccountBrandPaymentSplit
                  brands={openBrandSplitRows}
                  cashTotal={parsedNewPayCash}
                  cashByBrand={newPayCashByBrand}
                  onCashByBrandChange={setNewPayCashByBrand}
                  required={openBrandSplitRows.length > 1}
                />
              ) : null}
              {singleCashBrandForDiscount && unpaidWholePcsForDiscount > 0 ? (
                <div className="space-y-2">
                  <Label>Discount per piece (₱)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={newPayPerPieceDiscount}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewPayPerPieceDiscount(value);
                      const perPiece = parseFloat(String(value).replace(/,/g, ''));
                      if (!Number.isFinite(perPiece) || perPiece < 0) return;
                      const computed =
                        Math.round(perPiece * unpaidWholePcsForDiscount * 100) / 100;
                      const capped = Math.min(
                        computed,
                        singleCashBrandForDiscount.remaining,
                        paymentAvailableToApply
                      );
                      applySettlementDiscountValue(capped > 0 ? String(capped) : '');
                    }}
                    placeholder="e.g. 5.00 to drop 230 → 225"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Uses {unpaidWholePcsForDiscount} whole unpaid pc
                    {unpaidWholePcsForDiscount === 1 ? '' : 's'} on{' '}
                    {singleCashBrandForDiscount.brandName} (leftover pesos under 1 pc are not included).
                    Fills settlement discount below and trims cash if needed. Original billed unit
                    price is not changed.
                  </p>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Settlement discount (₱)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newPaySettlementDiscount}
                  onChange={(e) => applySettlementDiscountValue(e.target.value)}
                  placeholder="Write-off / commercial concession"
                />
                <p className="text-[11px] text-muted-foreground">
                  {isSalesHead
                    ? 'Applied immediately (auto-approved). Not counted as cash. On multi-brand splits it uses leftover room after cash, in brand order.'
                    : 'Needs Sales Head approval before it reduces the PO balance. Cash is recorded immediately. If rejected or left pending, only the cash counts toward paid.'}
                </p>
              </div>
              {(recordPayCoverage.cash > 0 || recordPayCoverage.discount > 0) && (
                <p
                  className={`text-xs tabular-nums rounded-md border px-3 py-2 ${
                    recordPayCoverage.overBy > 0.011
                      ? 'border-destructive/40 text-destructive'
                      : 'bg-muted/40 text-muted-foreground'
                  }`}
                >
                  Covering ₱{recordPayCoverage.combined.toFixed(2)} of ₱
                  {recordPayCoverage.available.toFixed(2)} available
                  {recordPayCoverage.discount > 0
                    ? ` (cash ₱${recordPayCoverage.cash.toFixed(2)} + discount ₱${recordPayCoverage.discount.toFixed(2)})`
                    : ` (cash ₱${recordPayCoverage.cash.toFixed(2)})`}
                  {recordPayCoverage.overBy > 0.011
                    ? ` · over by ₱${recordPayCoverage.overBy.toFixed(2)}`
                    : recordPayCoverage.remainingAfter > 0.011
                      ? ` · ₱${recordPayCoverage.remainingAfter.toFixed(2)} still open after this`
                      : ' · closes available balance'}
                </p>
              )}
              {Number(newPaySettlementDiscount || 0) > 0 || newPaySettlementDiscount.trim() !== '' ? (
                <div className="space-y-2">
                  <Label>Settlement discount reason *</Label>
                  <Textarea
                    value={newPaySettlementReason}
                    onChange={(e) => setNewPaySettlementReason(e.target.value)}
                    placeholder="e.g. Product market value dropped after 1 month"
                    rows={3}
                  />
                </div>
              ) : null}
              {Number(newPayAmount) > 0 ? (
                <>
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
                  <KeyAccountPaymentProofUploadField
                    file={newPayFile}
                    onFileChange={setNewPayFile}
                    inputId="record-po-payment-proof"
                    maxImageHeightClass="max-h-[220px]"
                    iframeHeightClass="h-[220px]"
                  />
                </>
              ) : null}
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
                  ) : Number(newPaySettlementDiscount || 0) > 0 && !isSalesHead ? (
                    'Submit for approval'
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editRfpfOpen}
        onOpenChange={(open) => {
          setEditRfpfOpen(open);
          if (!open) {
            setEditRfpfDraft('');
            setEditRfpfReason('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit RFPF Number</DialogTitle>
            <DialogDescription>
              Correct the RFPF number. The previous value will be kept in edit history.
              {' '}Each PO can be edited up to {MAX_RFPF_EDITS} times.
            </DialogDescription>
          </DialogHeader>

          {active && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground">
                Edits used: {rfpfEditCount} of {MAX_RFPF_EDITS}
              </p>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Current RFPF</p>
                <p className="font-mono font-semibold">{active.rfpf_number?.toUpperCase() || '—'}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rfpf-number">
                  New RFPF number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-rfpf-number"
                  value={editRfpfDraft}
                  onChange={(e) => setEditRfpfDraft(e.target.value)}
                  placeholder="Enter corrected RFPF…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rfpf-reason">
                  Reason for change <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="edit-rfpf-reason"
                  rows={3}
                  placeholder="Explain why this RFPF is being changed…"
                  value={editRfpfReason}
                  onChange={(e) => setEditRfpfReason(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditRfpfOpen(false)}
              disabled={submittingRfpfEdit}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void salesAdminSubmitRfpfEdit()}
              disabled={submittingRfpfEdit || !editRfpfDraft.trim() || !editRfpfReason.trim()}
            >
              {submittingRfpfEdit ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!rejectDiscountId}
        onOpenChange={(open) => {
          if (!open) {
            setRejectDiscountId(null);
            setRejectDiscountReason('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject settlement discount</DialogTitle>
            <DialogDescription>
              Optionally include a reason. The reserved discount amount will be released.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason (optional)</Label>
            <Textarea
              value={rejectDiscountReason}
              onChange={(e) => setRejectDiscountReason(e.target.value)}
              placeholder="e.g. Discount too high without client confirmation"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectDiscountId(null);
                setRejectDiscountReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!!actingDiscountId}
              onClick={() => void rejectSettlementDiscount()}
            >
              {actingDiscountId ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rejecting…
                </>
              ) : (
                'Reject discount'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!commissionPreviewPo}
        onOpenChange={(open) => {
          if (!open) {
            commissionPreviewReqRef.current += 1;
            setCommissionPreviewPo(null);
            setCommissionPreviewBrands([]);
            setCommissionPreviewLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cannot mark as commissioned</DialogTitle>
            <DialogDescription>
              {commissionPreviewPo?.po_number || 'This PO'} is not fully paid.
            </DialogDescription>
          </DialogHeader>
          {commissionPreviewLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading brands…
            </div>
          ) : (
            <div className="space-y-4">
              {(() => {
                const unpaidBrands = commissionPreviewBrands.filter((row) => row.status !== 'paid');
                const paidBrands = commissionPreviewBrands.filter((row) => row.status === 'paid');
                return (
                  <>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Not paid
                      </p>
                      {unpaidBrands.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No unpaid brands.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {unpaidBrands.map((row) => (
                            <li
                              key={row.brandId}
                              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                            >
                              <span className="text-sm font-medium truncate">{row.brandName}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs tabular-nums text-muted-foreground">
                                  ₱{row.remaining.toFixed(2)} left
                                </span>
                                <Badge className={brandBalanceStatusClass(row.status)}>{row.status}</Badge>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Already paid
                      </p>
                      {paidBrands.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No paid brands yet.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {paidBrands.map((row) => (
                            <li
                              key={row.brandId}
                              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                            >
                              <span className="text-sm font-medium truncate">{row.brandName}</span>
                              <Badge className={brandBalanceStatusClass(row.status)}>{row.status}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCommissionPreviewPo(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!commissionConfirmPo}
        onOpenChange={(open) => {
          if (!open && actingId !== commissionConfirmPo?.id) setCommissionConfirmPo(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as commissioned?</AlertDialogTitle>
            <AlertDialogDescription>
              {commissionConfirmPo?.po_number || 'This PO'} is fully paid
              {commissionConfirmPo?.client?.client_name
                ? ` (${commissionConfirmPo.client.client_name})`
                : ''}
              . Mark it as commissioned?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actingId === commissionConfirmPo?.id}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={actingId === commissionConfirmPo?.id}
              onClick={(e) => {
                e.preventDefault();
                void confirmMarkCommissioned(commissionConfirmPo);
              }}
            >
              {actingId === commissionConfirmPo?.id ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Marking…
                </>
              ) : (
                'Mark as commissioned'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KeyAccountOutstandingPaymentsDialog
        open={outstandingDialogOpen}
        onOpenChange={setOutstandingDialogOpen}
        orders={outstandingOrders}
      />

      <KeyAccountRebateDetailDialog
        open={rebateDetailOpen}
        onOpenChange={(open) => {
          setRebateDetailOpen(open);
          if (!open) setRebateDetailId(null);
        }}
        rebateId={rebateDetailOpen ? rebateDetailId : null}
        onRebateUpdated={() => void refreshPoRebatesForActive()}
      />

      <PurchaseOrderHistoryDialog
        purchaseOrderId={historyOrder?.id ?? null}
        poNumber={historyOrder?.po_number}
        purchaseOrder={(historyOrder as unknown as PurchaseOrder) ?? null}
        presentation="key_account"
        open={!!historyOrder}
        onOpenChange={(open) => {
          if (!open) setHistoryOrder(null);
        }}
      />
    </div>
  );
}

