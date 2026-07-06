import { useState, useEffect, useMemo } from 'react';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Plus, Search, Eye, X, Trash2, Check, Package, Loader2, ChevronLeft, ChevronRight, FileText, Receipt, MapPin, Store, Filter } from 'lucide-react';
import { KeyAccountShopCorView } from '@/features/key-accounts/components/KeyAccountShopCorView';
import { useToast } from '@/hooks/use-toast';
import { usePurchaseOrders } from './hooks';
import { CreatePurchaseOrderDialog } from './components/CreatePurchaseOrderDialog';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { useWarehouseLocationMembership } from '@/features/inventory/useWarehouseLocationMembership';
import { generateAndOpenCofPdf } from './cof/generateCofPdf';
import {
  generateAndOpenKeyAccountCofPdf,
  orderToKeyAccountPoForCof,
} from '@/features/key-accounts/cof/generateKeyAccountCofPdf';
import { generateAndOpenDrPdf } from './dr/generateDrPdf';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
  import { Textarea } from '@/components/ui/textarea';
import { PurchaseOrderDeliveryDetailsPanel, purchaseOrderDeliveryDetailsEnabled } from './components/PurchaseOrderDeliveryDetailsPanel';
import { keyAccountWorkflowStatusAfterLocationDispatch } from '@/features/key-accounts/keyAccountDispatchWorkflow';
import { PurchaseOrderItemsByWarehouse } from './components/PurchaseOrderItemsByWarehouse';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  createInitialTableSortCycle,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import {
  DEFAULT_PO_SORT_DIRECTION,
  DEFAULT_PO_SORT_KEY,
  sortPurchaseOrders,
  type PurchaseOrderSortKey,
} from './utils/purchaseOrderSorting';
import {
  PO_STATUS_FILTER_OPTIONS,
  PO_STATUS_FILTER_LABELS,
  purchaseOrderMatchesStatusFilter,
  type PurchaseOrderStatusFilter,
} from './utils/purchaseOrderFilters';
import { KeyAccountPoWarehouseProgress } from '@/features/key-accounts/components/KeyAccountPoWarehouseProgress';
import { RebateReplacementPricingSummary, RebateReceiveReturnsDialog } from '@/features/key-accounts/rebates';
import {
  filterRebateReturnLinesForWarehouseUser,
} from '@/features/key-accounts/rebates/keyAccountRebateShared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Key Account dispatch: separate private buckets (see supabase migration key_account_delivery_storage_buckets). */
const KA_DELIVERY_RIDER_PHOTOS_BUCKET = 'ka-delivery-rider-photos';
const KA_DELIVERY_WAREHOUSE_SIGNATURES_BUCKET = 'ka-delivery-warehouse-signatures';

type PoWarehouseSource = { id: string; name: string };

function poItemWarehouseLabel(item: any): string | null {
  const raw = Array.isArray(item?.warehouse_location) ? item.warehouse_location[0] : item?.warehouse_location;
  if (raw?.name) return raw.is_main ? `${raw.name} (Main)` : raw.name;
  const raw2 = Array.isArray(item?.warehouse_locations) ? item.warehouse_locations[0] : item?.warehouse_locations;
  if (raw2?.name) return raw2.is_main ? `${raw2.name} (Main)` : raw2.name;
  return null;
}

function resolveWarehouseLocationName(
  loc: { name: string } | { name: string }[] | null | undefined
): string | null {
  if (!loc) return null;
  const row = Array.isArray(loc) ? loc[0] : loc;
  return row?.name?.trim() || null;
}

type PoViewRequestorInfo = {
  company: { id: string; company_name: string } | null;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
  } | null;
};

function formatPoRequestorAddress(
  profile: PoViewRequestorInfo['profile'] | null | undefined
): string {
  if (!profile) return 'N/A';
  const line = [profile.address, profile.city, profile.country].filter(Boolean).join(', ');
  return line || 'N/A';
}

function formatPoHeaderWarehouse(order: any): string | null {
  const loc = Array.isArray(order?.warehouse_locations) ? order.warehouse_locations[0] : order?.warehouse_location;
  if (!loc?.name) return null;
  return loc.is_main ? `${loc.name} (Main)` : loc.name;
}

/** Source hub locations for a transfer PO (header and/or line items). */
function getPoSourceWarehouses(order: any): PoWarehouseSource[] {
  const items = (order?.items || []) as any[];
  const seen = new Map<string, string>();
  for (const it of items) {
    const locId = String(it.warehouse_location_id || '');
    if (!locId || seen.has(locId)) continue;
    seen.set(locId, poItemWarehouseLabel(it) || `Warehouse ${locId.slice(0, 8)}…`);
  }
  if (seen.size > 0) {
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }
  const headerId = String(order?.warehouse_location_id || order?.warehouse_location?.id || '');
  const headerName = formatPoHeaderWarehouse(order);
  if (headerId && headerName) {
    return [{ id: headerId, name: headerName }];
  }
  return [];
}

function formatPoRequestedWarehouseSummary(order: any): string {
  const sources = getPoSourceWarehouses(order);
  if (sources.length > 1) return sources.map((s) => s.name).join(', ');
  if (sources.length === 1) return sources[0].name;
  return formatPoHeaderWarehouse(order) ?? '—';
}

function RequestedWarehouseSources({
  order,
  fallbackStatuses = [],
}: {
  order: any;
  fallbackStatuses?: Array<{ location_id: string; location_name: string }>;
}) {
  let sources = getPoSourceWarehouses(order);
  if (sources.length === 0 && fallbackStatuses.length > 0) {
    sources = fallbackStatuses.map((s) => ({ id: s.location_id, name: s.location_name }));
  }

  if (sources.length === 0) {
    return <p className="font-medium">—</p>;
  }
  if (sources.length === 1) {
    return <p className="font-medium">{sources[0].name}</p>;
  }
  return (
    <ul className="space-y-1 text-sm font-medium">
      {sources.map((s) => (
        <li key={s.id}>{s.name}</li>
      ))}
    </ul>
  );
}

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const {
    purchaseOrders,
    suppliers,
    linkedWarehouseCompanyId,
    loading,
    createPurchaseOrder,
    approvePurchaseOrder,
    rejectPurchaseOrder,
    fetchPurchaseOrders,
  } = usePurchaseOrders();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatusFilter>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'all',
  });
  const [poPage, setPoPage] = useState(1);
  const [sortState, setSortState] =
    useState<TableSortCycleState<PurchaseOrderSortKey>>(createInitialTableSortCycle);
  // Form states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [orderToApprove, setOrderToApprove] = useState<any>(null);
  const [orderToReject, setOrderToReject] = useState<any>(null);
  const [approvingOrderId, setApprovingOrderId] = useState<string | null>(null);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [fulfillDialogOpen, setFulfillDialogOpen] = useState(false);
  const [orderToFulfill, setOrderToFulfill] = useState<any>(null);
  const [fulfillLocationId, setFulfillLocationId] = useState<string | null>(null);
  const [fulfillLocationName, setFulfillLocationName] = useState<string | null>(null);
  const [fulfillingOrderId, setFulfillingOrderId] = useState<string | null>(null);

  // Warehouse view tabs (supplier POs will be removed later; keep tabs by account type)
  const [poTab, setPoTab] = useState<'all' | 'key_accounts' | 'standard_accounts'>('all');

  // Dispatch capture for warehouse transfer fulfill (Key + Standard accounts)
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchPo, setDispatchPo] = useState<any>(null);
  const [riderName, setRiderName] = useState('');
  const [riderPlate, setRiderPlate] = useState('');
  const [riderPhotoFile, setRiderPhotoFile] = useState<File | null>(null);
  const [warehouseSignatureDataUrl, setWarehouseSignatureDataUrl] = useState<string | null>(null);
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [showWarehouseSignatureModal, setShowWarehouseSignatureModal] = useState(false);
  const [savingDispatch, setSavingDispatch] = useState(false);

  const [fulfillRebateReturnLines, setFulfillRebateReturnLines] = useState<
    Array<{
      brand_name: string;
      variant_name: string;
      variant_type: string;
      disputed_quantity: number;
      warehouse_location_id: string | null;
      warehouse_location_name: string;
    }>
  >([]);
  const [loadingFulfillRebateReturnLines, setLoadingFulfillRebateReturnLines] = useState(false);

  // Track fulfillment status for current user's warehouse location
  const [myLocationStatuses, setMyLocationStatuses] = useState<Record<string, string>>({});
  const [myLocationDrByPo, setMyLocationDrByPo] = useState<
    Record<string, { dr_number: string; warehouse_location_id: string; warehouse_name: string }>
  >({});

  // View Dialog States
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [orderToView, setOrderToView] = useState<any>(null);
  const [transferLocationStatuses, setTransferLocationStatuses] = useState<Array<{ location_id: string; location_name: string; status: string }>>([]);

  const [isMobile, setIsMobile] = useState(false);
  const [viewRequestorInfo, setViewRequestorInfo] = useState<PoViewRequestorInfo | null>(null);
  const [loadingViewRequestor, setLoadingViewRequestor] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({ userId: user?.id, isWarehouse });
  const canFulfillAsSubWarehouse =
    isWarehouse &&
    membership.status === 'sub' &&
    !!membership.locationId;
  const canFulfillAsMainWarehouse =
    isWarehouse &&
    membership.status === 'main' &&
    !!membership.locationId;

  const canFulfillFromViewForLocation = (locationId: string, locationStatus: string) => {
    if (!isWarehouse) return false;
    if (!membership.locationId) return false;
    if (String(locationId) !== String(membership.locationId)) return false;
    if (locationStatus === 'fulfilled') return false;
    return locationStatus === 'ready' || locationStatus === 'partial';
  };

  const shouldShowFulfillButtonInViewForLocation = (locationId: string) => {
    if (!isWarehouse) return false;
    if (!membership.locationId) return false;
    // Only allow fulfilling your own location from the View modal.
    return String(locationId) === String(membership.locationId) && (canFulfillAsMainWarehouse || canFulfillAsSubWarehouse);
  };

  const [approveStockByLocVar, setApproveStockByLocVar] = useState<Record<string, number>>({});
  const [approveLocationNames, setApproveLocationNames] = useState<Record<string, string>>({});
  const [loadingApproveStock, setLoadingApproveStock] = useState(false);
  const locVarKey = (locId: string, variantId: string) => `${locId}::${variantId}`;
  const shortId = (id: string) => (id && id.length > 10 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);

  const openCofForOrder = async (order: any) => {
    try {
      if (order.company_account_type === 'Key Accounts') {
        await generateAndOpenKeyAccountCofPdf(orderToKeyAccountPoForCof(order));
        return;
      }
      await generateAndOpenCofPdf(order);
    } catch (e: any) {
      toast({
        title: 'COF Error',
        description: e?.message || 'Failed to generate COF',
        variant: 'destructive',
      });
    }
  };

  const resolveWarehouseNameForLocation = (order: any, locationId: string): string => {
    const fromApprove = approveLocationNames[locationId];
    if (fromApprove) return fromApprove;
    const items = (order?.items || []) as any[];
    for (const it of items) {
      if (String(it.warehouse_location_id) !== String(locationId)) continue;
      const label = poItemWarehouseLabel(it);
      if (label) return label;
    }
    const headerLoc = Array.isArray(order?.warehouse_locations)
      ? order.warehouse_locations[0]
      : order?.warehouse_location;
    if (headerLoc?.id && String(headerLoc.id) === String(locationId) && headerLoc.name) {
      return headerLoc.is_main ? `${headerLoc.name} (Main)` : headerLoc.name;
    }
    return `Warehouse ${shortId(locationId)}`;
  };

  const canPrintDrForOrder = (order: { id: string }) => !!myLocationDrByPo[order.id]?.dr_number;

  const openDrForOrder = async (order: any) => {
    const drMeta = myLocationDrByPo[order.id];
    if (!drMeta?.dr_number) return;
    try {
      await generateAndOpenDrPdf(order, {
        drNumber: drMeta.dr_number,
        warehouseLocationId: drMeta.warehouse_location_id,
        warehouseLocationName: drMeta.warehouse_name,
      });
    } catch (e: any) {
      toast({
        title: 'DR Error',
        description: e?.message || 'Failed to generate delivery receipt',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'fulfilled':
        return 'bg-green-600 text-white hover:bg-green-700';
      case 'approved':
      case 'approved_for_fulfillment':
        return 'bg-blue-600 text-white hover:bg-blue-700';
      case 'partially_fulfilled':
        return 'bg-amber-500 text-white hover:bg-amber-600';
      case 'pending':
        return 'bg-gray-500 text-white hover:bg-gray-600';
      case 'rejected':
        return 'bg-red-600 text-white hover:bg-red-700';
      default:
        return 'bg-gray-500 text-white hover:bg-gray-600';
    }
  };

  const getStatusDisplayText = (status: string) => {
    // Subwarehouse sees different text for pending POs
    if (status === 'pending' && canFulfillAsSubWarehouse) {
      return 'Waiting for Main';
    }
    return status.replace(/_/g, ' ');
  };

  const itemLocLabel = (item: any) => {
    const raw = Array.isArray(item?.warehouse_location) ? item.warehouse_location[0] : item?.warehouse_location;
    if (raw?.name) return `${raw.name}${raw.is_main ? ' (Main)' : ''}`;
    const raw2 = Array.isArray(item?.warehouse_locations) ? item.warehouse_locations[0] : item?.warehouse_locations;
    if (raw2?.name) return `${raw2.name}${raw2.is_main ? ' (Main)' : ''}`;
    return null;
  };
  const resolveLocationLabel = (locId: string, locItems: any[]) => {
    const fromMap = approveLocationNames[locId];
    if (fromMap) return fromMap;
    const fromItem = locItems.map(itemLocLabel).find(Boolean) as string | undefined;
    if (fromItem) return fromItem;
    if (locId && locId !== 'unknown') return `Warehouse ${shortId(locId)}`;
    return 'Warehouse';
  };


  // Fetch my location fulfillment statuses for warehouse transfer POs
  useEffect(() => {
    if (!isWarehouse || !membership.locationId || purchaseOrders.length === 0) {
      setMyLocationStatuses({});
      return;
    }

    const transferPoIds = purchaseOrders
      .filter(o => o.fulfillment_type === 'warehouse_transfer')
      .map(o => o.id);

    if (transferPoIds.length === 0) {
      setMyLocationStatuses({});
      return;
    }

    let cancelled = false;
    supabase
      .from('warehouse_transfer_location_status')
      .select('purchase_order_id, status')
      .in('purchase_order_id', transferPoIds)
      .eq('warehouse_location_id', membership.locationId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[PO List] Failed to load location statuses', error);
          setMyLocationStatuses({});
          return;
        }
        const statusMap: Record<string, string> = {};
        (data || []).forEach((row: any) => {
          statusMap[row.purchase_order_id] = row.status;
        });
        setMyLocationStatuses(statusMap);
      });

    return () => {
      cancelled = true;
    };
  }, [purchaseOrders, membership.locationId, isWarehouse]);

  // DR numbers issued by this warehouse user's location (for Print DR button visibility).
  useEffect(() => {
    if (!isWarehouse || !membership.locationId || purchaseOrders.length === 0) {
      setMyLocationDrByPo({});
      return;
    }

    const transferPoIds = purchaseOrders
      .filter((o) => o.fulfillment_type === 'warehouse_transfer')
      .map((o) => o.id);

    if (transferPoIds.length === 0) {
      setMyLocationDrByPo({});
      return;
    }

    let cancelled = false;
    supabase
      .from('purchase_order_deliveries')
      .select(
        'purchase_order_id, dr_number, warehouse_location_id, warehouse_locations:warehouse_location_id(name)'
      )
      .in('purchase_order_id', transferPoIds)
      .eq('warehouse_location_id', membership.locationId)
      .not('dr_number', 'is', null)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[PO List] Failed to load DR numbers', error);
          setMyLocationDrByPo({});
          return;
        }
        const drMap: Record<
          string,
          { dr_number: string; warehouse_location_id: string; warehouse_name: string }
        > = {};
        for (const row of (data || []) as any[]) {
          const poId = String(row.purchase_order_id || '');
          const drNumber = String(row.dr_number || '').trim();
          const locId = String(row.warehouse_location_id || '');
          if (!poId || !drNumber || !locId) continue;
          const locName =
            resolveWarehouseLocationName(row.warehouse_locations) || `Warehouse ${shortId(locId)}`;
          drMap[poId] = {
            dr_number: drNumber,
            warehouse_location_id: locId,
            warehouse_name: locName,
          };
        }
        setMyLocationDrByPo(drMap);
      });

    return () => {
      cancelled = true;
    };
  }, [purchaseOrders, membership.locationId, isWarehouse]);

  // Approve modal: preload stock availability (warehouse_transfer only).
  useEffect(() => {
    if (!approveDialogOpen || !orderToApprove || orderToApprove.fulfillment_type !== 'warehouse_transfer') {
      setApproveStockByLocVar({});
      setApproveLocationNames({});
      setLoadingApproveStock(false);
      return;
    }
    if (!user?.company_id) return;

    const items = (orderToApprove.items || []) as any[];
    const locationIds = Array.from(
      new Set(
        items
          .map((i) => String(i.warehouse_location_id || orderToApprove.warehouse_location_id || ''))
          .filter(Boolean)
      )
    );
    const variantIds = Array.from(new Set(items.map((i) => String(i.variant_id || '')).filter(Boolean)));
    if (locationIds.length === 0 || variantIds.length === 0) {
      setApproveStockByLocVar({});
      setApproveLocationNames({});
      return;
    }

    let cancelled = false;
    setLoadingApproveStock(true);
    (async () => {
      const [{ data: locRows, error: locErr }, { data: invRows, error: invErr }, { data: mainInvRows, error: mainInvErr }] =
        await Promise.all([
        supabase
          .from('warehouse_locations')
          .select('id,name,is_main')
          .eq('company_id', user.company_id)
          .in('id', locationIds),
        supabase
          .from('warehouse_location_inventory')
          .select('location_id,variant_id,stock')
          .eq('company_id', user.company_id)
          .in('location_id', locationIds)
          .in('variant_id', variantIds),
        // Main Warehouse "location" stock lives in main_inventory (available = stock - allocated_stock).
        supabase
          .from('main_inventory')
          .select('variant_id,stock,allocated_stock')
          .eq('company_id', user.company_id)
          .in('variant_id', variantIds),
      ]);
      if (cancelled) return;
      if (locErr) throw locErr;
      if (invErr) throw invErr;
      if (mainInvErr) throw mainInvErr;

      const nameMap: Record<string, string> = {};
      const mainLocIds: string[] = [];
      for (const r of (locRows as any[]) || []) {
        const id = String(r.id);
        nameMap[id] = `${r.name}${r.is_main ? ' (Main)' : ''}`;
        if (r.is_main) mainLocIds.push(id);
      }
      setApproveLocationNames(nameMap);

      const stockMap: Record<string, number> = {};
      for (const r of (invRows as any[]) || []) {
        stockMap[locVarKey(String(r.location_id), String(r.variant_id))] = Number(r.stock || 0);
      }

      // Fill in "available" for main locations from main_inventory.
      for (const r of (mainInvRows as any[]) || []) {
        const variantId = String(r.variant_id);
        const available = Math.max(0, Number(r.stock || 0) - Number(r.allocated_stock || 0));
        for (const mainLocId of mainLocIds) {
          stockMap[locVarKey(mainLocId, variantId)] = available;
        }
      }
      setApproveStockByLocVar(stockMap);
    })()
      .catch((e) => {
        console.warn('[Approve Preview] Failed to load stock', e);
        setApproveStockByLocVar({});
        setApproveLocationNames({});
      })
      .finally(() => {
        if (!cancelled) setLoadingApproveStock(false);
      });

    return () => {
      cancelled = true;
    };
  }, [approveDialogOpen, orderToApprove?.id, orderToApprove?.fulfillment_type, user?.company_id]);






  useEffect(() => {
    if (!viewDialogOpen || !orderToView?.id) {
      setViewRequestorInfo(null);
      setLoadingViewRequestor(false);
      return;
    }
    if (orderToView.key_account_client_id) {
      setViewRequestorInfo(null);
      setLoadingViewRequestor(false);
      return;
    }

    let cancelled = false;
    setLoadingViewRequestor(true);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('get_po_requestor_info', {
          p_po_id: orderToView.id,
        });
        if (cancelled) return;
        if (error) {
          console.warn('[PO View] get_po_requestor_info error:', error);
          setViewRequestorInfo(null);
          return;
        }
        const obj = (data || {}) as Partial<PoViewRequestorInfo>;
        setViewRequestorInfo({
          company: obj.company ?? null,
          profile: obj.profile ?? null,
        });
      } catch (e) {
        if (!cancelled) {
          console.warn('[PO View] get_po_requestor_info exception:', e);
          setViewRequestorInfo(null);
        }
      } finally {
        if (!cancelled) setLoadingViewRequestor(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewDialogOpen, orderToView?.id, orderToView?.key_account_client_id]);

  // For warehouse_transfer POs: load per-location fulfillment statuses for progress view.
  useEffect(() => {
    if (!viewDialogOpen || !orderToView?.id) {
      setTransferLocationStatuses([]);
      return;
    }
    if (orderToView.fulfillment_type !== 'warehouse_transfer') {
      setTransferLocationStatuses([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('warehouse_transfer_location_status')
        .select(
          `
          warehouse_location_id,
          status,
          warehouse_locations:warehouse_location_id (
            name
          )
        `
        )
        .eq('purchase_order_id', orderToView.id)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn('[PO View] Failed to load transfer location statuses', error);
        setTransferLocationStatuses([]);
        return;
      }
      const rows = (data as any[]) || [];
      setTransferLocationStatuses(
        rows.map((r) => ({
          location_id: r.warehouse_location_id,
          location_name: (Array.isArray(r.warehouse_locations) ? r.warehouse_locations[0]?.name : r.warehouse_locations?.name) || '—',
          status: String(r.status || 'pending'),
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [viewDialogOpen, orderToView?.id, orderToView?.fulfillment_type]);

  const canApproveOrder = (order: { status: string; fulfillment_type?: string }) =>
    order.status === 'pending' &&
    (order.fulfillment_type !== 'warehouse_transfer' || canFulfillAsMainWarehouse);

  const canFulfillOrder = (order: { id: string; status: string; fulfillment_type?: string; warehouse_location_id?: string; items?: any[] }) => {
    if (!(canFulfillAsSubWarehouse || canFulfillAsMainWarehouse)) return false;
    if (order.fulfillment_type !== 'warehouse_transfer') return false;
    if (!(order.status === 'approved_for_fulfillment' || order.status === 'partially_fulfilled')) return false;
    if (myLocationStatuses[order.id] === 'fulfilled') return false;

    // Check if user's warehouse is a source for this PO
    // For single-warehouse: check warehouse_location_id
    // For multi-warehouse: check if any item has user's warehouse
    const userLocationId = membership.locationId;
    if (!userLocationId) return false;

    // If PO has a header warehouse_location_id, user must match it
    if (order.warehouse_location_id) {
      return String(order.warehouse_location_id) === String(userLocationId);
    }

    // For multi-warehouse POs, check if any item's warehouse matches user's warehouse
    const items = order.items || [];
    return items.some(item =>
      String(item.warehouse_location_id) === String(userLocationId)
    );
  };

  const handleApproveOrder = async () => {
    if (!orderToApprove) return;

    setApprovingOrderId(orderToApprove.id);

    const result = await approvePurchaseOrder(orderToApprove.id);

    setApprovingOrderId(null);

    if (result.success) {
      setApproveDialogOpen(false);
      setOrderToApprove(null);
    } else {
      toast({
        title: 'Error',
        description: result.error || 'Failed to approve purchase order',
        variant: 'destructive',
      });
    }
  };

  const handleViewOrder = (order: any) => {
    setOrderToView(order);
    setViewDialogOpen(true);
  };

  const handleOpenApproveDialog = (order: any) => {
    setOrderToApprove(order);
    setApproveDialogOpen(true);
  };

  const handleOpenRejectDialog = (order: any) => {
    setOrderToReject(order);
    setRejectDialogOpen(true);
  };

  const openDispatchCaptureForFulfill = (order: any) => {
    setDispatchPo(order);
    setRiderName('');
    setRiderPlate('');
    setRiderPhotoFile(null);
    setWarehouseSignatureDataUrl(null);
    setDispatchNotes('');
    setDispatchOpen(true);
  };

  const handleOpenFulfillDialog = (order: any) => {
    setOrderToFulfill(order);
    setFulfillLocationId(membership.locationId ?? null);
    setFulfillLocationName(null);
    if (order?.fulfillment_type === 'warehouse_transfer') {
      openDispatchCaptureForFulfill(order);
      return;
    }
    setFulfillDialogOpen(true);
  };

  const handleOpenFulfillDialogForLocation = (order: any, locationId: string, locationName?: string | null) => {
    setOrderToFulfill(order);
    setFulfillLocationId(locationId);
    setFulfillLocationName(locationName ?? null);
    if (order?.fulfillment_type === 'warehouse_transfer') {
      openDispatchCaptureForFulfill(order);
      return;
    }
    setFulfillDialogOpen(true);
  };

  useEffect(() => {
    if ((!fulfillDialogOpen && !dispatchOpen) || !orderToFulfill?.id) return;
    if (String(orderToFulfill.po_order_kind || '') !== 'rebate_fulfillment' || !orderToFulfill.source_rebate_id) {
      setFulfillRebateReturnLines([]);
      return;
    }

    let cancelled = false;
    setLoadingFulfillRebateReturnLines(true);
    void (async () => {
      try {
        const { data: linesData, error: linesErr } = await supabase
          .from('key_account_po_rebate_lines')
          .select(
            `
            disputed_quantity,
            purchase_order_item:purchase_order_items (
              warehouse_location_id
            ),
            variant:variants (
              name,
              variant_type,
              brand:brands ( name )
            )
          `
          )
          .eq('rebate_id', orderToFulfill.source_rebate_id);
        if (linesErr) throw linesErr;
        if (cancelled) return;

        const raw = (linesData || []) as any[];
        const locationIds = [
          ...new Set(
            raw
              .map((r) => r?.purchase_order_item?.warehouse_location_id ?? null)
              .filter((x) => !!x)
          ),
        ] as string[];

        const hubCompanyId =
          (orderToFulfill.warehouse_company_id as string | null | undefined) ?? user?.company_id ?? null;
        let locNameById: Record<string, string> = {};
        if (hubCompanyId && locationIds.length > 0) {
          const { data: locRows } = await supabase
            .from('warehouse_locations')
            .select('id,name')
            .eq('company_id', hubCompanyId)
            .in('id', locationIds);
          locNameById = Object.fromEntries(((locRows as any[]) || []).map((r) => [r.id, r.name]));
        }

        const mapped = raw.map((r) => {
          const whId = r?.purchase_order_item?.warehouse_location_id ?? null;
          return {
            brand_name: r?.variant?.brand?.name ?? '—',
            variant_name: r?.variant?.name ?? '—',
            variant_type: r?.variant?.variant_type ?? '—',
            disputed_quantity: Number(r?.disputed_quantity) || 0,
            warehouse_location_id: whId,
            warehouse_location_name: whId ? locNameById[whId] || '—' : '—',
          };
        });

        setFulfillRebateReturnLines(mapped);
      } catch {
        if (!cancelled) setFulfillRebateReturnLines([]);
      } finally {
        if (!cancelled) setLoadingFulfillRebateReturnLines(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    fulfillDialogOpen,
    dispatchOpen,
    orderToFulfill?.id,
    orderToFulfill?.po_order_kind,
    orderToFulfill?.source_rebate_id,
    orderToFulfill?.warehouse_company_id,
    user?.company_id,
  ]);

  const handleFulfillOrder = async () => {
    const locId = fulfillLocationId ?? membership.locationId;
    if (!orderToFulfill || !locId) return;
    setFulfillingOrderId(orderToFulfill.id);
    try {
      const { data, error } = await supabase.rpc('fulfill_po_location', {
        p_po_id: orderToFulfill.id,
        p_location_id: locId,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Fulfillment failed');

      toast({
        title: 'Fulfilled',
        description: `${data.po_number} fulfilled for your warehouse location.`,
      });
      // Update local status so Fulfill button hides immediately
      if (orderToFulfill?.id) {
        setMyLocationStatuses(prev => ({ ...prev, [orderToFulfill.id]: 'fulfilled' }));
      }
      setFulfillDialogOpen(false);

      setOrderToFulfill(null);
      setFulfillLocationId(null);
      setFulfillLocationName(null);
      void fetchPurchaseOrders(false, true);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to fulfill', variant: 'destructive' });
    } finally {
      setFulfillingOrderId(null);
    }
  };

  const handleRejectOrder = async () => {
    if (!orderToReject) return;
    setRejectingOrderId(orderToReject.id);
    const result = await rejectPurchaseOrder(orderToReject.id);
    setRejectingOrderId(null);
    if (result.success) {
      setRejectDialogOpen(false);
      setOrderToReject(null);
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to reject purchase order', variant: 'destructive' });
    }
  };

  const { toast } = useToast();

  const orderDateRange = useMemo(() => {
    return getDateRangeFromPreset(
      dateRangeFilter.preset,
      dateRangeFilter.customStart,
      dateRangeFilter.customEnd
    );
  }, [dateRangeFilter]);

  /** Warehouse: account tab + date range (cards and table share this scope). */
  const scopedOrders = useMemo(() => {
    if (!isWarehouse) return purchaseOrders;
    return purchaseOrders.filter((order) => {
      const acct = String(order.company_account_type || 'Standard Accounts');
      if (poTab === 'key_accounts' && acct !== 'Key Accounts') return false;
      if (poTab === 'standard_accounts' && acct === 'Key Accounts') return false;
      return isDateInRange(new Date(order.order_date), orderDateRange.start, orderDateRange.end);
    });
  }, [purchaseOrders, isWarehouse, poTab, orderDateRange.end, orderDateRange.start]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return scopedOrders.filter((order) => {
      if (!purchaseOrderMatchesStatusFilter(order, statusFilter)) return false;
      const typeLabel = order.fulfillment_type === 'warehouse_transfer' ? 'internal warehouse' : 'supplier';
      return (
        order.po_number.toLowerCase().includes(q) ||
        (order.supplier?.company_name || '').toLowerCase().includes(q) ||
        typeLabel.includes(q) ||
        (order.fulfillment_type === 'warehouse_transfer' &&
          formatPoRequestedWarehouseSummary(order).toLowerCase().includes(q))
      );
    });
  }, [scopedOrders, searchQuery, statusFilter]);

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () => resolveTableSortDirection(sortState, DEFAULT_PO_SORT_KEY, DEFAULT_PO_SORT_DIRECTION),
    [sortState]
  );

  const sortedOrders = useMemo(
    () => sortPurchaseOrders(filteredOrders, resolvedSortKey, resolvedSortDirection),
    [filteredOrders, resolvedSortKey, resolvedSortDirection]
  );

  const summaryOrders = isWarehouse ? scopedOrders : purchaseOrders;

  const handleSort = (key: PurchaseOrderSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  useEffect(() => {
    setPoPage(1);
  }, [searchQuery, poTab, orderDateRange.start, orderDateRange.end, sortState, statusFilter]);

  // Pagination: 10 purchase orders per page
  const PO_PER_PAGE = 10;
  const totalPoPages = Math.max(1, Math.ceil(sortedOrders.length / PO_PER_PAGE));
  const currentPoPage = Math.min(Math.max(1, poPage), totalPoPages);
  const paginatedOrders = sortedOrders.slice(
    (currentPoPage - 1) * PO_PER_PAGE,
    currentPoPage * PO_PER_PAGE
  );

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Purchase Orders</h1>
          <p className="text-muted-foreground">
            {user?.role === 'warehouse'
              ? 'Pending internal transfers from your assigned client companies'
              : 'Create and manage your purchase orders'}
          </p>
        </div>
        {user?.role !== 'warehouse' && (
          <Button className="w-full md:w-auto" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create PO
          </Button>
        )}
        {user?.role !== 'warehouse' && (
          <CreatePurchaseOrderDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            suppliers={suppliers}
            linkedWarehouseCompanyId={linkedWarehouseCompanyId}
            user={user}
            onCreateOrder={createPurchaseOrder}
          />
        )}
      </div>

      {user?.role === 'warehouse' && (
        <Tabs value={poTab} onValueChange={(v) => setPoTab(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="key_accounts">Key Accounts</TabsTrigger>
            <TabsTrigger value="standard_accounts">Standard</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Total Orders</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryOrders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Pending</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryOrders.filter((o) => o.status === 'pending').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Fulfilled</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold ">
              {summaryOrders.filter((o) => o.status === 'fulfilled').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Total Value</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₱
              {summaryOrders
                .filter((o) => o.status === 'fulfilled')
                .reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
                .toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as PurchaseOrderStatusFilter)}
            >
              <SelectTrigger className="h-10 w-full sm:w-[220px] gap-2">
                <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {PO_STATUS_FILTER_OPTIONS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {PO_STATUS_FILTER_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isWarehouse && (
              <DateRangeFilterPopover
                value={dateRangeFilter}
                onChange={setDateRangeFilter}
                triggerClassName="w-full sm:w-[220px] justify-between h-10 shrink-0"
                align="end"
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {paginatedOrders.map((order) => (
              <div key={order.id} className="rounded-lg border bg-background p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">PO Number</div>
                    <div className="font-mono font-semibold flex items-center gap-2 flex-wrap">
                      {order.po_number}
                      {order.po_order_kind === 'rebate_fulfillment' && (
                        <Badge variant="secondary" className="text-xs font-normal">
                          Rebate replacement
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Badge variant="default" className={getStatusBadgeClass(order.status)}>
                    {getStatusDisplayText(order.status)}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Type</div>
                    <Badge variant="outline" className="mt-0.5">
                      {order.fulfillment_type === 'warehouse_transfer' ? 'Internal' : 'Supplier'}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Seller / source</div>
                    <div className="truncate">{order.supplier?.company_name ?? '—'}</div>
                    {order.fulfillment_type === 'warehouse_transfer' && (
                      <div className="text-xs text-muted-foreground truncate">
                        Requested: {formatPoRequestedWarehouseSummary(order)}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Order Date</div>
                    <div>{new Date(order.order_date).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Expected</div>
                    <div>{new Date(order.expected_delivery_date).toLocaleDateString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Items</div>
                    <div>{order.items.length}</div>
                  </div>
                  <div aria-hidden />
                  <div className="col-span-2 flex justify-between border-t pt-2 font-medium">
                    <span>Amount</span>
                    <span>₱{order.total_amount.toLocaleString()}</span>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  {canApproveOrder(order) && (
                    <Button variant="default" size="sm" onClick={() => handleOpenApproveDialog(order)} disabled={approvingOrderId === order.id}>
                      {order.fulfillment_type === 'warehouse_transfer' ? 'Approve PO' : 'Approve'}
                    </Button>
                  )}
                  {canFulfillOrder(order) && (
                    <Button variant="default" size="sm" onClick={() => handleOpenFulfillDialog(order)} disabled={fulfillingOrderId === order.id}>
                      <Package className="h-4 w-4 mr-1" />
                      Fulfill
                    </Button>
                  )}
                  {canApproveOrder(order) && (
                    <Button variant="destructive" size="sm" onClick={() => handleOpenRejectDialog(order)} disabled={rejectingOrderId === order.id}>
                      {order.created_by === user?.id ? 'Cancel' : 'Reject'}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => void openCofForOrder(order)} title="View / Print COF">
                    <FileText className="h-4 w-4 mr-1" />
                    COF
                  </Button>
                  {canPrintDrForOrder(order) && (
                    <Button variant="outline" size="sm" onClick={() => void openDrForOrder(order)} title="Print delivery receipt for your warehouse">
                      <Receipt className="h-4 w-4 mr-1" />
                      DR
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleViewOrder(order)}>
                    <Eye className="h-4 w-4 mr-1" /> View
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="PO Number"
                    sortKey="poNumber"
                    sortDirection={getTableSortDisplayDirection(sortState, 'poNumber')}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Type"
                    sortKey="type"
                    sortDirection={getTableSortDisplayDirection(sortState, 'type')}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Seller"
                    sortKey="seller"
                    sortDirection={getTableSortDisplayDirection(sortState, 'seller')}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Date"
                    sortKey="orderDate"
                    sortDirection={getTableSortDisplayDirection(sortState, 'orderDate')}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Expected Delivery"
                    sortKey="expectedDeliveryDate"
                    sortDirection={getTableSortDisplayDirection(sortState, 'expectedDeliveryDate')}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Items"
                    sortKey="itemCount"
                    sortDirection={getTableSortDisplayDirection(sortState, 'itemCount')}
                    onSort={handleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="Total Amount"
                    sortKey="totalAmount"
                    sortDirection={getTableSortDisplayDirection(sortState, 'totalAmount')}
                    onSort={handleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="Status"
                    sortKey="status"
                    sortDirection={getTableSortDisplayDirection(sortState, 'status')}
                    onSort={handleSort}
                  />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">
                      No purchase orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          {order.po_number}
                          {order.po_order_kind === 'rebate_fulfillment' && (
                            <Badge variant="secondary" className="text-xs font-normal">
                              Rebate
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {order.fulfillment_type === 'warehouse_transfer' ? 'Internal' : 'Supplier'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{order.supplier?.company_name ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">{order.supplier?.contact_person ?? ''}</p>
                          {order.fulfillment_type === 'warehouse_transfer' && (
                            <p className="text-xs text-muted-foreground">
                              Requested: <span className="font-medium text-foreground/80">{formatPoRequestedWarehouseSummary(order)}</span>
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{new Date(order.order_date).toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(order.expected_delivery_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">{order.items.length}</TableCell>
                      <TableCell className="text-right font-semibold">
                        ₱{order.total_amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className={getStatusBadgeClass(order.status)}>
                          {getStatusDisplayText(order.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canApproveOrder(order) && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleOpenApproveDialog(order)}
                              disabled={approvingOrderId === order.id}
                            >
                              {approvingOrderId === order.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : null}
                              {order.fulfillment_type === 'warehouse_transfer'
                                ? 'Approve PO'
                                : 'Approve'}
                            </Button>
                          )}
                          {canFulfillOrder(order) && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleOpenFulfillDialog(order)}
                              disabled={fulfillingOrderId === order.id}
                            >
                              {fulfillingOrderId === order.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Package className="h-4 w-4 mr-1" />
                              )}
                              Fulfill
                            </Button>
                          )}
                          {canApproveOrder(order) && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleOpenRejectDialog(order)}
                              disabled={rejectingOrderId === order.id}
                            >
                              {rejectingOrderId === order.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : null}
                              {order.created_by === user?.id ? 'Cancel' : 'Reject'}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleViewOrder(order)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => void openCofForOrder(order)} title="View / Print COF">
                            <FileText className="h-4 w-4" />
                          </Button>
                          {canPrintDrForOrder(order) && (
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => void openDrForOrder(order)}
                              title="Print delivery receipt for your warehouse"
                            >
                              <Receipt className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination controls */}
            {sortedOrders.length > PO_PER_PAGE && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-xs text-muted-foreground">
                  Showing{' '}
                  <span className="font-medium">
                    {(currentPoPage - 1) * PO_PER_PAGE + 1}-
                    {Math.min(currentPoPage * PO_PER_PAGE, filteredOrders.length)}
                  </span>{' '}
                  of <span className="font-medium">{filteredOrders.length}</span> purchase orders
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPoPage((p) => Math.max(1, p - 1))}
                    disabled={currentPoPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Prev
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {currentPoPage} of {totalPoPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPoPage((p) => Math.min(totalPoPages, p + 1))}
                    disabled={currentPoPage === totalPoPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Approve Order Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] sm:w-full sm:max-w-2xl h-[85vh] max-h-[85vh] p-0 flex flex-col">
          <div className="p-6 pb-3">
            <AlertDialogHeader>
              <AlertDialogTitle>Approve Purchase Order</AlertDialogTitle>
              <AlertDialogDescription>
                {orderToApprove
                  ? `Are you sure you want to approve ${orderToApprove.po_number}?`
                  : 'Select a purchase order to approve.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>

          <ScrollArea type="always" scrollHideDelay={0} className="flex-1 min-h-0 px-6">
            {orderToApprove && (
              <div className="space-y-4 pb-4">
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <p className="font-semibold text-sm">
                  {orderToApprove.fulfillment_type === 'warehouse_transfer'
                    ? 'Stock will move from the warehouse sub-warehouse to the requesting company:'
                    : 'This will add the following items to your Main Inventory:'}
                </p>
                {orderToApprove.fulfillment_type !== 'warehouse_transfer' ? (
                  <div className="space-y-2">
                    {orderToApprove.items.map((item: any, index: number) => (
                      <div key={index} className="flex items-center justify-between text-sm bg-background p-2 rounded">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{item.brand_name}</span>
                          <span className="text-muted-foreground">-</span>
                          <span>{item.variant_name}</span>
                          <Badge
                            variant="secondary"
                            className={
                              item.variant_type === 'flavor'
                                ? 'bg-blue-100 text-blue-700'
                                : item.variant_type === 'battery'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-purple-100 text-purple-700'
                            }
                          >
                            {String(item.variant_type).toUpperCase()}
                          </Badge>
                        </div>
                        <span className="font-semibold">{`+${item.quantity} units`}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {loadingApproveStock && (
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Checking stock per warehouse...
                      </div>
                    )}
                    {(() => {
                      const items = (orderToApprove.items || []) as any[];
                      const byLoc: Record<string, any[]> = {};
                      for (const it of items) {
                        const locId = String(it.warehouse_location_id || orderToApprove.warehouse_location_id || '');
                        if (!locId) continue;
                        (byLoc[locId] ||= []).push(it);
                      }
                      const locIds = Object.keys(byLoc);
                      const sortedLocIds = locIds.sort((a, b) => (approveLocationNames[a] || a).localeCompare(approveLocationNames[b] || b));

                      return (
                        <Accordion type="multiple" className="w-full">
                          {sortedLocIds.map((locId) => {
                            const locItems = byLoc[locId] || [];
                            // group by brand
                            const byBrand: Record<string, any[]> = {};
                            for (const it of locItems) (byBrand[String(it.brand_name || 'Unknown')] ||= []).push(it);
                            const brandNames = Object.keys(byBrand).sort((a, b) => a.localeCompare(b));

                            // shortage check
                            let shortageCount = 0;
                            for (const it of locItems) {
                              const variantId = String(it.variant_id || '');
                              const req = Number(it.quantity || 0);
                              const avail = approveStockByLocVar[locVarKey(locId, variantId)] ?? 0;
                              if (variantId && req > avail) shortageCount += 1;
                            }

                            return (
                              <AccordionItem key={locId} value={locId} className="border rounded-md px-3 bg-background">
                                <AccordionTrigger className="hover:no-underline">
                                  <div className="flex items-center justify-between w-full pr-3">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-sm">
                                        {resolveLocationLabel(locId, locItems)}
                                      </span>
                                      <Badge variant="secondary" className="text-xs">
                                        {locItems.length} items
                                      </Badge>
                                      {shortageCount > 0 && (
                                        <Badge variant="destructive" className="text-xs">
                                          {shortageCount} shortage
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="space-y-3 pt-2 pb-1">
                                    {brandNames.map((brand) => {
                                      const brandItems = (byBrand[brand] || []).slice().sort((a, b) => {
                                        const ta = String(a.variant_type || '');
                                        const tb = String(b.variant_type || '');
                                        if (ta !== tb) return ta.localeCompare(tb);
                                        return String(a.variant_name || '').localeCompare(String(b.variant_name || ''));
                                      });
                                      return (
                                        <div key={brand} className="border rounded-md">
                                          <div className="px-3 py-2 bg-muted/40 flex items-center justify-between">
                                            <span className="font-semibold text-sm">{brand}</span>
                                            <span className="text-xs text-muted-foreground">
                                              {brandItems.reduce((sum, x) => sum + Number(x.quantity || 0), 0)} total units
                                            </span>
                                          </div>
                                          <div className="divide-y">
                                            {brandItems.map((it: any, idx: number) => {
                                              const variantId = String(it.variant_id || '');
                                              const req = Number(it.quantity || 0);
                                              const avail = approveStockByLocVar[locVarKey(locId, variantId)] ?? 0;
                                              const short = variantId && req > avail;
                                              return (
                                                <div
                                                  key={`${variantId || it.variant_name || idx}`}
                                                  className={`px-3 py-2 text-sm flex items-center justify-between ${short ? 'bg-red-50/60' : ''}`}
                                                >
                                                  <div className="flex items-center gap-2 min-w-0">
                                                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                                                    <span className="truncate">{it.variant_name}</span>
                                                    <Badge
                                                      variant="secondary"
                                                      className={
                                                        it.variant_type === 'flavor'
                                                          ? 'bg-blue-100 text-blue-700'
                                                          : it.variant_type === 'battery'
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-purple-100 text-purple-700'
                                                      }
                                                    >
                                                      {String(it.variant_type).toUpperCase()}
                                                    </Badge>
                                                  </div>
                                                  <div className="flex items-center gap-3 shrink-0">
                                                    <span className="font-semibold">{req} req</span>
                                                    <span className={`text-xs ${short ? 'text-red-700 font-semibold' : 'text-muted-foreground'}`}>
                                                      {avail} avail
                                                    </span>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      );
                    })()}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {orderToApprove.fulfillment_type === 'warehouse_transfer'
                  ? 'Sub-warehouse inventory must cover these quantities. This cannot be undone.'
                  : "The quantities will be added to existing stock or new items will be created if they don't exist."}
              </p>
              </div>
            )}
          </ScrollArea>

          <div className="p-6 pt-3 border-t">
            <AlertDialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
              <AlertDialogAction className="w-full sm:w-auto" onClick={handleApproveOrder}>
                <Check className="h-4 w-4 mr-2" />
                {orderToApprove?.fulfillment_type === 'warehouse_transfer'
                  ? 'Approve PO'
                  : 'Approve & Add to Inventory'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Order Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {orderToReject?.created_by === user?.id ? 'Cancel Purchase Order' : 'Reject Purchase Order'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {orderToReject
                ? `Are you sure you want to ${orderToReject.created_by === user?.id ? 'cancel' : 'reject'} ${orderToReject.po_number}?`
                : 'Select a purchase order to reject.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleRejectOrder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <X className="h-4 w-4 mr-2" /> {orderToReject?.created_by === user?.id ? 'Cancel' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fulfill Location Dialog (sub-warehouse) */}
      <AlertDialog open={fulfillDialogOpen} onOpenChange={setFulfillDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fulfill Warehouse Transfer</AlertDialogTitle>
            <AlertDialogDescription>
              {orderToFulfill
                ? `Confirm fulfillment for ${orderToFulfill.po_number}. This will deduct stock from ${
                    fulfillLocationName ? fulfillLocationName : 'the selected warehouse location'
                  } and move it to the requesting company.`
                : 'Select a purchase order to fulfill.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {orderToFulfill?.po_order_kind === 'rebate_fulfillment' && (
            <div className="space-y-2 pt-2">
              <div className="text-sm font-medium">Expected return items (disputed lines)</div>
              <div className="text-xs text-muted-foreground">
                This fulfillment deducts replacement stock. Returned/disputed items are not automatically added back to
                inventory until they are physically received.
              </div>
              {loadingFulfillRebateReturnLines ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading return items…
                </div>
              ) : fulfillRebateReturnLines.length === 0 ? (
                <div className="text-sm text-muted-foreground">—</div>
              ) : (
                <div className="max-h-56 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Brand</TableHead>
                        <TableHead>Variant</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>From warehouse</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fulfillRebateReturnLines.map((l, idx) => (
                        <TableRow key={`${l.variant_name}-${idx}`}>
                          <TableCell className="font-medium">{l.brand_name}</TableCell>
                          <TableCell>{l.variant_name}</TableCell>
                          <TableCell>{String(l.variant_type).toUpperCase()}</TableCell>
                          <TableCell className="text-muted-foreground">{l.warehouse_location_name}</TableCell>
                          <TableCell className="text-right font-semibold">{l.disputed_quantity}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFulfillOrder}
              disabled={!orderToFulfill || !(fulfillLocationId ?? membership.locationId) || fulfillingOrderId === orderToFulfill?.id}
            >
              {fulfillingOrderId === orderToFulfill?.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Package className="h-4 w-4 mr-2" />}
              Fulfill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dispatch / Delivery Dialog (warehouse transfer fulfill) */}
      <Dialog open={dispatchOpen} onOpenChange={setDispatchOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0 space-y-1">
            <DialogTitle>Dispatch / Delivery</DialogTitle>
            <DialogDescription>
              {dispatchPo?.po_number ? `PO: ${dispatchPo.po_number}` : 'Complete delivery details below.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-4">
            {dispatchPo?.po_order_kind === 'rebate_fulfillment' && (
              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <div className="text-sm font-medium">Expected return items (disputed lines)</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Replacement stock is deducted on delivery. Disputed items are restocked only after physical receive.
                </p>
                {loadingFulfillRebateReturnLines ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading return items…
                  </div>
                ) : fulfillRebateReturnLines.length === 0 ? (
                  <div className="text-sm text-muted-foreground">—</div>
                ) : (
                  <div className="max-h-28 overflow-auto rounded-md border bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs">Brand</TableHead>
                          <TableHead className="h-8 text-xs">Variant</TableHead>
                          <TableHead className="h-8 text-xs text-right">Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fulfillRebateReturnLines.map((l, idx) => (
                          <TableRow key={`${l.variant_name}-${idx}`}>
                            <TableCell className="py-2 text-xs font-medium">{l.brand_name}</TableCell>
                            <TableCell className="py-2 text-xs">{l.variant_name}</TableCell>
                            <TableCell className="py-2 text-xs text-right font-semibold">{l.disputed_quantity}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Rider name</Label>
                <Input value={riderName} onChange={(e) => setRiderName(e.target.value)} placeholder="e.g. Juan Dela Cruz" />
              </div>
              <div className="space-y-2">
                <Label>Plate number</Label>
                <Input value={riderPlate} onChange={(e) => setRiderPlate(e.target.value)} placeholder="e.g. ABC-1234" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Rider photo</Label>
              <Input type="file" accept="image/*" onChange={(e) => setRiderPhotoFile(e.target.files?.[0] ?? null)} />
            </div>

            <div className="space-y-2">
              <Label>Warehouse e-signature</Label>
              {warehouseSignatureDataUrl ? (
                <div className="border rounded-md p-3 bg-muted/30 space-y-2">
                  <img src={warehouseSignatureDataUrl} alt="Warehouse signature" className="max-h-20 mx-auto" />
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setShowWarehouseSignatureModal(true)}>
                      Change signature
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border rounded-md p-3 bg-muted/30 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">Draw warehouse signature before delivering.</p>
                  <Button type="button" size="sm" onClick={() => setShowWarehouseSignatureModal(true)}>
                    Add signature
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={dispatchNotes}
                onChange={(e) => setDispatchNotes(e.target.value)}
                placeholder="Delivery instructions, gate pass, etc."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
              <Button
                variant="outline"
                onClick={() => setDispatchOpen(false)}
                disabled={savingDispatch || fulfillingOrderId === orderToFulfill?.id}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const locId = fulfillLocationId ?? membership.locationId;
                  if (!dispatchPo?.id || !dispatchPo?.company_id || !locId) return;
                  if (!riderName.trim() || !riderPlate.trim() || !riderPhotoFile || !warehouseSignatureDataUrl) {
                    toast({ title: 'Missing info', description: 'Rider name, plate number, rider photo, and warehouse signature are required.', variant: 'destructive' });
                    return;
                  }

                  const warehouseCompanyId =
                    (dispatchPo.warehouse_company_id as string | null | undefined) ?? user?.company_id ?? null;
                  if (!warehouseCompanyId) {
                    toast({
                      title: 'Missing warehouse',
                      description: 'Could not resolve warehouse company for uploads and DR number.',
                      variant: 'destructive',
                    });
                    return;
                  }

                  const storageBasePath = `${warehouseCompanyId}/po/${dispatchPo.id}`;

                  setSavingDispatch(true);
                  try {
                    // 1) Fulfill first (deduct stock / move to requesting company)
                    setFulfillingOrderId(dispatchPo.id);
                    const { data: fulfillData, error: fulfillErr } = await supabase.rpc('fulfill_po_location', {
                      p_po_id: dispatchPo.id,
                      p_location_id: locId,
                    });
                    if (fulfillErr) throw fulfillErr;
                    if (!fulfillData?.success) throw new Error(fulfillData?.error || 'Fulfillment failed');

                    const fileExt = riderPhotoFile.name.split('.').pop() || 'jpg';
                    const uploadTs = Date.now();
                    const filePath = `${storageBasePath}/${uploadTs}_rider.${fileExt}`;

                    const base64Data = warehouseSignatureDataUrl.split(',')[1];
                    if (!base64Data) throw new Error('Invalid warehouse signature data');
                    const binaryString = atob(base64Data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                      bytes[i] = binaryString.charCodeAt(i);
                    }
                    const signatureBlob = new Blob([bytes], { type: 'image/png' });
                    const signaturePath = `${storageBasePath}/${uploadTs}_warehouse-signature.png`;

                    const [{ error: uploadError }, { error: sigUploadError }] = await Promise.all([
                      supabase.storage
                        .from(KA_DELIVERY_RIDER_PHOTOS_BUCKET)
                        .upload(filePath, riderPhotoFile, {
                          upsert: false,
                          contentType: riderPhotoFile.type || 'image/jpeg',
                        }),
                      supabase.storage
                        .from(KA_DELIVERY_WAREHOUSE_SIGNATURES_BUCKET)
                        .upload(signaturePath, signatureBlob, {
                          contentType: 'image/png',
                          upsert: false,
                        }),
                    ]);
                    if (uploadError) throw uploadError;
                    if (sigUploadError) throw sigUploadError;

                    const [{ data: urlData, error: urlErr }, { data: sigUrlData, error: sigUrlErr }] =
                      await Promise.all([
                        supabase.storage
                          .from(KA_DELIVERY_RIDER_PHOTOS_BUCKET)
                          .createSignedUrl(filePath, 60 * 60 * 24 * 365),
                        supabase.storage
                          .from(KA_DELIVERY_WAREHOUSE_SIGNATURES_BUCKET)
                          .createSignedUrl(signaturePath, 60 * 60 * 24 * 365),
                      ]);
                    if (urlErr) throw urlErr;
                    if (sigUrlErr) throw sigUrlErr;
                    const riderPhotoUrl = urlData?.signedUrl;
                    const warehouseSignatureUrl = sigUrlData?.signedUrl;
                    if (!riderPhotoUrl) throw new Error('Failed to create signed URL');
                    if (!warehouseSignatureUrl) throw new Error('Failed to create signature URL');

                    // 2) Create DR number (WH + first letter of warehouse_locations.name, e.g. Bacoor → WHB)
                    const { data: drNumber, error: drErr } = await supabase.rpc('generate_dr_number', {
                      p_warehouse_location_id: locId,
                    });
                    if (drErr) throw drErr;
                    if (!drNumber) throw new Error('Failed to generate DR number');

                    if (!user?.id) {
                      throw new Error('Not signed in; cannot record dispatch (created_by required).');
                    }

                    // 3) Save dispatch (RLS requires created_by = auth.uid())
                    const { error: insErr } = await supabase.from('purchase_order_deliveries').insert({
                      purchase_order_id: dispatchPo.id,
                      company_id: dispatchPo.company_id,
                      warehouse_location_id: locId,
                      rider_name: riderName.trim(),
                      rider_plate_number: riderPlate.trim(),
                      rider_photo_url: riderPhotoUrl,
                      warehouse_signature_url: warehouseSignatureUrl,
                      warehouse_signature_path: signaturePath,
                      dr_number: drNumber,
                      status: 'dispatched',
                      notes: dispatchNotes.trim() || null,
                      created_by: user.id,
                    } as any);
                    if (insErr) throw insErr;

                    // 4) Key Account workflow: partial vs full delivery (multi-warehouse)
                    const { data: locStatusRows, error: locStatusErr } = await supabase
                      .from('warehouse_transfer_location_status')
                      .select('status')
                      .eq('purchase_order_id', dispatchPo.id);
                    if (locStatusErr) throw locStatusErr;

                    const workflowStatus = keyAccountWorkflowStatusAfterLocationDispatch(
                      locStatusRows || []
                    );
                    const poUpdate: { workflow_status: string; dr_number?: string } = {
                      workflow_status: workflowStatus,
                    };

                    if (workflowStatus === 'delivered') {
                      const { data: deliveryRows, error: drListErr } = await supabase
                        .from('purchase_order_deliveries')
                        .select('dr_number')
                        .eq('purchase_order_id', dispatchPo.id)
                        .not('dr_number', 'is', null);
                      if (drListErr) throw drListErr;
                      const drList = (deliveryRows || [])
                        .map((r: { dr_number?: string | null }) => r.dr_number)
                        .filter(Boolean) as string[];
                      if (drList.length > 0) {
                        poUpdate.dr_number = drList.join(', ');
                      }
                    }

                    const { error: poUpdErr } = await supabase
                      .from('purchase_orders')
                      .update(poUpdate)
                      .eq('id', dispatchPo.id);
                    if (poUpdErr) throw poUpdErr;

                    toast({
                      title: workflowStatus === 'delivered' ? 'Delivered' : 'Partial delivery',
                      description:
                        workflowStatus === 'delivered'
                          ? `All warehouses dispatched. DR: ${poUpdate.dr_number || drNumber}`
                          : `Dispatch saved for this warehouse. DR: ${drNumber}. Other warehouse(s) still pending.`,
                    });

                    const whName =
                      fulfillLocationName?.trim() ||
                      approveLocationNames[locId] ||
                      resolveWarehouseNameForLocation(dispatchPo, locId);

                    const pdfPo = dispatchPo;
                    const pdfDrNumber = drNumber;
                    const pdfLocId = locId;
                    const pdfWhName = whName;

                    setMyLocationDrByPo((prev) => ({
                      ...prev,
                      [dispatchPo.id]: {
                        dr_number: drNumber,
                        warehouse_location_id: locId,
                        warehouse_name: whName,
                      },
                    }));

                    // Update local status so Fulfill button hides immediately
                    setMyLocationStatuses((prev) => ({ ...prev, [dispatchPo.id]: 'fulfilled' }));
                    setDispatchOpen(false);
                    setDispatchPo(null);
                    setWarehouseSignatureDataUrl(null);
                    setDispatchNotes('');
                    setOrderToFulfill(null);
                    setFulfillLocationId(null);
                    setFulfillLocationName(null);
                    void fetchPurchaseOrders(false, true);

                    void generateAndOpenDrPdf(pdfPo, {
                      drNumber: pdfDrNumber,
                      warehouseLocationId: pdfLocId,
                      warehouseLocationName: pdfWhName,
                    }).catch((drPdfErr: any) => {
                      console.warn('[DR] auto-open after dispatch failed', drPdfErr);
                      toast({
                        title: 'DR opened with issues',
                        description: drPdfErr?.message || 'Delivery saved but DR preview could not open.',
                        variant: 'destructive',
                      });
                    });
                  } catch (e: any) {
                    toast({ title: 'Error', description: e.message || 'Failed to save dispatch info', variant: 'destructive' });
                  } finally {
                    setSavingDispatch(false);
                    setFulfillingOrderId(null);
                  }
                }}
                disabled={
                  savingDispatch ||
                  fulfillingOrderId === dispatchPo?.id ||
                  !warehouseSignatureDataUrl ||
                  !warehouseSignatureDataUrl.trim()
                }
              >
                {savingDispatch || fulfillingOrderId === dispatchPo?.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Deliver
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warehouse Signature Capture */}
      <Dialog open={showWarehouseSignatureModal} onOpenChange={setShowWarehouseSignatureModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Warehouse Signature</DialogTitle>
          </DialogHeader>
          <SignatureCanvas
            title="Draw the warehouse signature in the area below"
            description="This signature confirms the warehouse personnel who fulfilled and dispatched this PO."
            onSave={(sigDataUrl) => {
              setWarehouseSignatureDataUrl(sigDataUrl);
              setShowWarehouseSignatureModal(false);
            }}
            onCancel={() => setShowWarehouseSignatureModal(false)}
          />
        </DialogContent>
      </Dialog>

      {/* View Purchase Order - Mobile: Sheet, Desktop: Dialog */}
      {isMobile ? (
        <Sheet open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <SheetContent side="bottom" className="h-[95vh] p-0">
            <SheetHeader className="px-4 pt-4 pb-2 border-b">
              <div className="flex items-center justify-between">
                <SheetTitle>PO Details</SheetTitle>
                {orderToView && (
                  <Badge variant="default" className={getStatusBadgeClass(orderToView.status)}>
                    {getStatusDisplayText(orderToView.status)}
                  </Badge>
                )}
              </div>
            </SheetHeader>
            <ScrollArea className="h-[calc(95vh-80px)]">
              {orderToView && (
                <div className="p-4">
                  {orderToView.key_account_client_id ? (
                    <KeyAccountPOView order={orderToView} />
                  ) : (
                  <Accordion type="multiple" defaultValue={["info", "buyer", "seller", "items", "pricing"]} className="space-y-2">
                    {/* PO Info Section */}
                    <AccordionItem value="info" className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          <span className="font-semibold">{orderToView.po_number}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid grid-cols-2 gap-4 pt-4 text-sm">
                          <div>
                            <Label className="text-muted-foreground text-xs">Order Date</Label>
                            <p className="font-medium">{new Date(orderToView.order_date).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <Label className="text-muted-foreground text-xs">Expected Delivery</Label>
                            <p className="font-medium">{new Date(orderToView.expected_delivery_date).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Buyer Info Section */}
                    <AccordionItem value="buyer" className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <span className="font-semibold">Buyer information</span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 text-sm pt-4">
                          {loadingViewRequestor ? (
                            <p className="text-muted-foreground text-xs flex items-center gap-2">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Loading buyer details…
                            </p>
                          ) : (
                            <>
                              <div>
                                <p className="font-medium">
                                  {viewRequestorInfo?.company?.company_name || 'N/A'}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  {formatPoRequestorAddress(viewRequestorInfo?.profile)}
                                </p>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <p className="text-muted-foreground">Placed by</p>
                                  <p>{viewRequestorInfo?.profile?.full_name || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Phone</p>
                                  <p>{viewRequestorInfo?.profile?.phone || 'N/A'}</p>
                                </div>
                                <div className="col-span-2">
                                  <p className="text-muted-foreground">Email</p>
                                  <p>{viewRequestorInfo?.profile?.email || 'N/A'}</p>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Seller Info Section */}
                    <AccordionItem value="seller" className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <span className="font-semibold">
                          {orderToView.fulfillment_type === 'warehouse_transfer' ? 'Warehouse' : 'Supplier'}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 text-sm pt-4">
                          {orderToView.fulfillment_type === 'warehouse_transfer' ? (
                            <div className="rounded-md border bg-muted/40 p-3">
                              <Label className="text-muted-foreground text-xs">Requested warehouse / sub-warehouse</Label>
                              <div className="mt-1">
                                <RequestedWarehouseSources
                                  order={orderToView}
                                  fallbackStatuses={transferLocationStatuses}
                                />
                              </div>
                            </div>
                          ) : (
                            <>
                              <div>
                                <p className="font-medium">{orderToView.supplier.company_name}</p>
                                <p className="text-muted-foreground text-xs">{orderToView.supplier.address}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <p className="text-muted-foreground">Contact</p>
                                  <p>{orderToView.supplier.contact_person}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Phone</p>
                                  <p>{orderToView.supplier.phone}</p>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {orderToView.fulfillment_type === 'warehouse_transfer' && (
                      <KeyAccountPoWarehouseProgress
                        purchaseOrderId={orderToView.id}
                        workflowStatus={orderToView.workflow_status}
                        fulfillmentType={orderToView.fulfillment_type}
                      />
                    )}

                    {purchaseOrderDeliveryDetailsEnabled(orderToView) && (
                      <PurchaseOrderDeliveryDetailsPanel
                        purchaseOrderId={orderToView.id}
                        enabled
                        purchaseOrder={orderToView}
                        filterWarehouseLocationId={isWarehouse ? membership.locationId : null}
                        warehouseNamesById={Object.fromEntries(
                          transferLocationStatuses.map((s) => [s.location_id, s.location_name])
                        )}
                      />
                    )}

                    {/* Items Section */}
                    <AccordionItem value="items" className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Items</span>
                          <Badge variant="secondary">{orderToView.items.length}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-4">
                          {orderToView.items.map((item: any) => (
                            <div key={item.id} className="bg-muted/50 p-3 rounded-lg space-y-2">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{item.brand_name}</p>
                                  <p className="text-xs text-muted-foreground">{item.variant_name}</p>
                                </div>
                                <Badge
                                  variant="secondary"
                                  className={`text-[10px] ${item.variant_type === 'flavor' ? 'bg-blue-100 text-blue-700' :
                                    item.variant_type === 'battery' ? 'bg-green-100 text-green-700' :
                                      'bg-purple-100 text-purple-700'
                                    }`}
                                >
                                  {item.variant_type.toUpperCase()}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <p className="text-muted-foreground">Qty</p>
                                  <p className="font-medium">{item.quantity}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Unit</p>
                                  <p className="font-medium">₱{item.unit_price.toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-muted-foreground">Total</p>
                                  <p className="font-semibold">₱{item.total_price.toLocaleString()}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Pricing Section */}
                    <AccordionItem value="pricing" className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-4">
                          <span className="font-semibold">Pricing</span>
                          <span className="font-bold">₱{orderToView.total_amount.toLocaleString()}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-4 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="font-medium">₱{orderToView.subtotal.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tax ({orderToView.tax_rate}%)</span>
                            <span className="font-medium">₱{orderToView.tax_amount.toLocaleString()}</span>
                          </div>
                          {orderToView.discount > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Discount</span>
                              <span className="font-medium text-green-600">- ₱{orderToView.discount.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="flex justify-between border-t pt-2 text-base">
                            <span className="font-semibold">Total</span>
                            <span className="font-bold">₱{orderToView.total_amount.toLocaleString()}</span>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Notes Section */}
                    {orderToView.notes && (
                      <div className="border rounded-lg p-4">
                        <Label className="font-semibold text-sm">Notes</Label>
                        <p className="text-sm text-muted-foreground mt-2">{orderToView.notes}</p>
                      </div>
                    )}
                  </Accordion>
                  )}
                </div>
              )}
            </ScrollArea>
          </SheetContent>
        </Sheet>
      ) : (
        // Desktop: Dialog
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Purchase Order Details</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
              {orderToView && (
                <div className="space-y-6 py-4">
                  {/* Key Account PO View */}
                  {orderToView.key_account_client_id ? (
                    <KeyAccountPOView order={orderToView} />
                  ) : (
                    <>
                  {/* Regular PO View */}
                  {/* PO Number and Status */}
                  <div className="flex justify-between items-center pb-4 border-b">
                    <div>
                      <h3 className="text-2xl font-bold">{orderToView.po_number}</h3>
                      <p className="text-sm text-muted-foreground">Purchase Order</p>
                    </div>
                    <Badge
                      variant="default"
                      className={`text-base px-4 py-2 ${getStatusBadgeClass(orderToView.status)}`}
                    >
                      {getStatusDisplayText(orderToView.status)}
                    </Badge>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Order Date</Label>
                      <p className="font-medium">{new Date(orderToView.order_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Expected Delivery</Label>
                      <p className="font-medium">{new Date(orderToView.expected_delivery_date).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {/* Buyer and Seller Info */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-lg">Buyer Information</h4>
                      <div className="bg-muted p-4 rounded-lg space-y-1">
                        {loadingViewRequestor ? (
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading buyer details…
                          </p>
                        ) : (
                          <>
                            <p className="font-medium">
                              {viewRequestorInfo?.company?.company_name || 'N/A'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatPoRequestorAddress(viewRequestorInfo?.profile)}
                            </p>
                            <p className="text-sm">
                              Placed by: {viewRequestorInfo?.profile?.full_name || 'N/A'}
                            </p>
                            <p className="text-sm">
                              Phone: {viewRequestorInfo?.profile?.phone || 'N/A'}
                            </p>
                            <p className="text-sm">
                              Email: {viewRequestorInfo?.profile?.email || 'N/A'}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-lg">
                        {orderToView.fulfillment_type === 'warehouse_transfer' ? 'Warehouse Information' : 'Seller Information'}
                      </h4>
                      <div className="bg-muted p-4 rounded-lg space-y-1">
                        {orderToView.fulfillment_type === 'warehouse_transfer' ? (
                          <>
                            <div className="pb-2 border-b">
                              <p className="text-xs text-muted-foreground">Fulfillment type</p>
                              <p className="font-medium">Internal warehouse transfer</p>
                            </div>
                            <div className="pb-2 border-b">
                              <p className="text-xs text-muted-foreground">Requested warehouse / sub-warehouse</p>
                              <div className="mt-0.5">
                                <RequestedWarehouseSources
                                  order={orderToView}
                                  fallbackStatuses={transferLocationStatuses}
                                />
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="font-medium">{orderToView.supplier.company_name}</p>
                            <p className="text-sm text-muted-foreground">{orderToView.supplier.address}</p>
                            <p className="text-sm">Contact: {orderToView.supplier.contact_person}</p>
                            <p className="text-sm">Phone: {orderToView.supplier.phone}</p>
                            <p className="text-sm">Email: {orderToView.supplier.email}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {orderToView.fulfillment_type === 'warehouse_transfer' && (
                    <KeyAccountPoWarehouseProgress
                      purchaseOrderId={orderToView.id}
                      workflowStatus={orderToView.workflow_status}
                      fulfillmentType={orderToView.fulfillment_type}
                    />
                  )}

                  {purchaseOrderDeliveryDetailsEnabled(orderToView) && (
                    <PurchaseOrderDeliveryDetailsPanel
                      purchaseOrderId={orderToView.id}
                      enabled
                      purchaseOrder={orderToView}
                      filterWarehouseLocationId={isWarehouse ? membership.locationId : null}
                      warehouseNamesById={Object.fromEntries(
                        transferLocationStatuses.map((s) => [s.location_id, s.location_name])
                      )}
                    />
                  )}

                  {/* Items Desktop */}
                  <div className="space-y-2">
                    <h4 className="font-semibold text-lg">Items</h4>
                    <div className="border rounded-lg">
                      {orderToView.fulfillment_type === 'warehouse_transfer' ? (
                        <div className="p-3">
                          {(() => {
                            const items = (orderToView.items || []) as any[];
                            const byLoc: Record<string, any[]> = {};
                            for (const it of items) {
                              const locId = String(it.warehouse_location_id || orderToView.warehouse_location_id || '');
                              (byLoc[locId || 'unknown'] ||= []).push(it);
                            }
                            const locIds = Object.keys(byLoc);
                            const nameOf = (locId: string) => {
                              if (locId === 'unknown') return 'Warehouse';
                              const fromStatus = transferLocationStatuses.find((s: any) => String(s.location_id) === locId)?.location_name;
                              if (fromStatus) return fromStatus;
                              const locItems = byLoc[locId] || [];
                              return resolveLocationLabel(locId, locItems);
                            };
                            const sorted = locIds.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

                            return (
                              <Accordion type="multiple" className="w-full">
                                {sorted.map((locId) => {
                                  const locItems = byLoc[locId] || [];
                                  const byBrand: Record<string, any[]> = {};
                                  for (const it of locItems) (byBrand[String(it.brand_name || 'Unknown')] ||= []).push(it);
                                  const brandNames = Object.keys(byBrand).sort((a, b) => a.localeCompare(b));

                                  return (
                                    <AccordionItem key={locId} value={`view-${locId}`} className="border rounded-md px-3">
                                      <AccordionTrigger className="hover:no-underline">
                                        <div className="flex items-center justify-between w-full pr-3">
                                          <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm">{nameOf(locId)}</span>
                                            <Badge variant="secondary" className="text-xs">
                                              {locItems.length} items
                                            </Badge>
                                          </div>
                                        </div>
                                      </AccordionTrigger>
                                      <AccordionContent>
                                        <div className="space-y-3 pt-2 pb-1">
                                          {brandNames.map((brand) => {
                                            const brandItems = (byBrand[brand] || []).slice().sort((a, b) => {
                                              const ta = String(a.variant_type || '');
                                              const tb = String(b.variant_type || '');
                                              if (ta !== tb) return ta.localeCompare(tb);
                                              return String(a.variant_name || '').localeCompare(String(b.variant_name || ''));
                                            });
                                            return (
                                              <div key={brand} className="border rounded-md overflow-hidden">
                                                <div className="px-3 py-2 bg-muted/40 flex items-center justify-between">
                                                  <span className="font-semibold text-sm">{brand}</span>
                                                  <span className="text-xs text-muted-foreground">
                                                    {brandItems.reduce((sum, x) => sum + Number(x.quantity || 0), 0)} units
                                                  </span>
                                                </div>
                                                <Table>
                                                  <TableHeader>
                                                    <TableRow>
                                                      <TableHead>Variant</TableHead>
                                                      <TableHead>Type</TableHead>
                                                      <TableHead className="text-right">Qty</TableHead>
                                                      <TableHead className="text-right">Unit</TableHead>
                                                      <TableHead className="text-right">Total</TableHead>
                                                    </TableRow>
                                                  </TableHeader>
                                                  <TableBody>
                                                    {brandItems.map((item: any) => (
                                                      <TableRow key={item.id}>
                                                        <TableCell className="font-medium">{item.variant_name}</TableCell>
                                                        <TableCell>
                                                          <Badge
                                                            variant="secondary"
                                                            className={
                                                              item.variant_type === 'flavor' ? 'bg-blue-100 text-blue-700' :
                                                                item.variant_type === 'battery' ? 'bg-green-100 text-green-700' :
                                                                  'bg-purple-100 text-purple-700'
                                                            }
                                                          >
                                                            {String(item.variant_type).toUpperCase()}
                                                          </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">{item.quantity}</TableCell>
                                                        <TableCell className="text-right">₱{Number(item.unit_price || 0).toFixed(2)}</TableCell>
                                                        <TableCell className="text-right font-semibold">₱{Number(item.total_price || 0).toFixed(2)}</TableCell>
                                                      </TableRow>
                                                    ))}
                                                  </TableBody>
                                                </Table>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </AccordionContent>
                                    </AccordionItem>
                                  );
                                })}
                              </Accordion>
                            );
                          })()}
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Brand</TableHead>
                              <TableHead>Item</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead className="text-right">Quantity</TableHead>
                              <TableHead className="text-right">Unit Price</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {orderToView.items.map((item: any) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.brand_name}</TableCell>
                                <TableCell>{item.variant_name}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant="secondary"
                                    className={
                                      item.variant_type === 'flavor' ? 'bg-blue-100 text-blue-700' :
                                        item.variant_type === 'battery' ? 'bg-green-100 text-green-700' :
                                          'bg-purple-100 text-purple-700'
                                    }
                                  >
                                    {String(item.variant_type).toUpperCase()}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">{item.quantity}</TableCell>
                                <TableCell className="text-right">₱{Number(item.unit_price || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right font-semibold">₱{Number(item.total_price || 0).toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </div>



                  {/* Pricing Summary */}
                  <div className="space-y-2 border-t pt-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span className="font-medium">₱{orderToView.subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax ({orderToView.tax_rate}%):</span>
                      <span className="font-medium">₱{orderToView.tax_amount.toLocaleString()}</span>
                    </div>
                    {orderToView.discount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Discount:</span>
                        <span className="font-medium text-green-600">- ₱{orderToView.discount.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold border-t pt-2">
                      <span>Total Amount:</span>
                      <span>₱{orderToView.total_amount.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Notes */}
                  {orderToView.notes && (
                    <div className="space-y-2">
                      <Label className="font-semibold">Notes</Label>
                      <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">{orderToView.notes}</p>
                    </div>
                  )}
                    </>
                  )}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Key Account PO View Component - Used for POs created by key accounts
interface KeyAccountPOViewProps {
  order: any;
}

function KeyAccountPOView({ order }: KeyAccountPOViewProps) {
  const { user } = useAuth();
  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({ userId: user?.id, isWarehouse });
  const [warehouseLocationMeta, setWarehouseLocationMeta] = useState<
    Record<string, { name: string; is_main: boolean }>
  >({});

  // Local state for fetched data (in case RLS blocks the join)
  const [kaData, setKaData] = useState<{
    client: any;
    shop: any;
    address: any;
    kam: any;
  }>({ client: null, shop: null, address: null, kam: null });
  const [loading, setLoading] = useState(false);
  const [rebatePricing, setRebatePricing] = useState<{
    disputed_total: number;
    replacement_total: number;
  } | null>(null);
  const [rebateSource, setRebateSource] = useState<{
    rebate_number: string;
    source_po_number: string;
  } | null>(null);

  const [rebateReturnLines, setRebateReturnLines] = useState<
    Array<{
      brand_name: string;
      variant_name: string;
      variant_type: string;
      disputed_quantity: number;
      warehouse_location_id: string | null;
      warehouse_location_name: string;
    }>
  >([]);
  const [loadingRebateReturnLines, setLoadingRebateReturnLines] = useState(false);
  const [receiveReturnsOpen, setReceiveReturnsOpen] = useState(false);
  const [returnsAlreadyReceived, setReturnsAlreadyReceived] = useState(false);

  useEffect(() => {
    if (order.po_order_kind !== 'rebate_fulfillment' || !order.source_rebate_id) {
      setRebatePricing(null);
      setRebateSource(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('key_account_po_rebates')
        .select(
          'rebate_number, disputed_total, replacement_total, source_po:purchase_orders!key_account_po_rebates_purchase_order_id_fkey(po_number)'
        )
        .eq('id', order.source_rebate_id)
        .maybeSingle();
      if (cancelled || !data) return;
      setRebatePricing({
        disputed_total: Number(data.disputed_total) || 0,
        replacement_total: Number(data.replacement_total) || 0,
      });
      const src = (data as { source_po?: { po_number: string } | { po_number: string }[] }).source_po;
      const poNum = Array.isArray(src) ? src?.[0]?.po_number : src?.po_number;
      if (poNum) {
        setRebateSource({
          rebate_number: String(data.rebate_number || ''),
          source_po_number: poNum,
        });
      } else {
        setRebateSource(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id, order.po_order_kind, order.source_rebate_id]);

  // Fetch Key Account details if not present in order (RLS workaround)
  useEffect(() => {
    const fetchKeyAccountDetails = async () => {
      // If we already have all data, don't fetch
      if (order.client && order.shop && order.address && order.kam) return;
      
      // If no key account IDs, nothing to fetch
      if (!order.key_account_client_id && !order.kam_id) return;

      setLoading(true);
      try {
        const [clientRes, shopRes, addressRes, kamRes] = await Promise.all([
          order.key_account_client_id 
            ? supabase.from('key_account_clients').select('client_name').eq('id', order.key_account_client_id).single()
            : Promise.resolve({ data: null }),
          order.key_account_shop_id
            ? supabase
                .from('key_account_shops')
                .select('shop_name, cor_pdf_path')
                .eq('id', order.key_account_shop_id)
                .single()
            : Promise.resolve({ data: null }),
          order.key_account_address_id
            ? supabase.from('key_account_delivery_addresses')
                .select('address_label,full_address,city,province,zip_code,contact_name,contact_phone,is_default')
                .eq('id', order.key_account_address_id)
                .single()
            : Promise.resolve({ data: null }),
          order.kam_id
            ? supabase.from('profiles').select('full_name,email').eq('id', order.kam_id).single()
            : Promise.resolve({ data: null }),
        ]);

        setKaData({
          client: clientRes.data,
          shop: shopRes.data,
          address: addressRes.data,
          kam: kamRes.data,
        });

        console.log('Fetched Key Account details:', {
          client: clientRes.data,
          shop: shopRes.data,
          address: addressRes.data,
          kam: kamRes.data,
        });
      } catch (err) {
        console.error('Error fetching Key Account details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchKeyAccountDetails();
  }, [order]);

  useEffect(() => {
    const hubCompanyId = order.warehouse_company_id || user?.company_id;
    if (!hubCompanyId) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('id,name,is_main')
        .eq('company_id', hubCompanyId)
        .order('is_main', { ascending: false })
        .order('name');
      if (cancelled || error) return;
      const meta: Record<string, { name: string; is_main: boolean }> = {};
      for (const row of data || []) {
        if (row?.id && row?.name) {
          meta[row.id] = { name: row.name, is_main: !!row.is_main };
        }
      }
      setWarehouseLocationMeta(meta);
    })();

    return () => {
      cancelled = true;
    };
  }, [order.warehouse_company_id, user?.company_id]);

  const warehouseNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [id, m] of Object.entries(warehouseLocationMeta)) {
      map[id] = m.name;
    }
    return map;
  }, [warehouseLocationMeta]);

  const warehouseLocationIsMainById = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const [id, m] of Object.entries(warehouseLocationMeta)) {
      map[id] = m.is_main;
    }
    return map;
  }, [warehouseLocationMeta]);

  const receivableRebateReturnLines = useMemo(
    () =>
      filterRebateReturnLinesForWarehouseUser(
        rebateReturnLines,
        membership,
        warehouseLocationIsMainById
      ),
    [rebateReturnLines, membership, warehouseLocationIsMainById]
  );

  const canReceiveRebateReturns =
    isWarehouse &&
    !returnsAlreadyReceived &&
    receivableRebateReturnLines.length > 0;

  useEffect(() => {
    if (order.po_order_kind !== 'rebate_fulfillment' || !order.source_rebate_id) {
      setRebateReturnLines([]);
      setReturnsAlreadyReceived(false);
      return;
    }
    let cancelled = false;
    setLoadingRebateReturnLines(true);
    void (async () => {
      try {
        const { data: receipt } = await supabase
          .from('key_account_po_rebate_return_receipts')
          .select('id')
          .eq('rebate_id', order.source_rebate_id)
          .maybeSingle();
        if (!cancelled) setReturnsAlreadyReceived(!!receipt?.id);

        const { data: linesData, error: linesErr } = await supabase
          .from('key_account_po_rebate_lines')
          .select(
            `
            disputed_quantity,
            purchase_order_item:purchase_order_items (
              warehouse_location_id
            ),
            variant:variants (
              name,
              variant_type,
              brand:brands ( name )
            )
          `
          )
          .eq('rebate_id', order.source_rebate_id);
        if (linesErr) throw linesErr;
        if (cancelled) return;

        const raw = (linesData || []) as any[];
        const mapped = raw.map((r) => {
          const whId = r?.purchase_order_item?.warehouse_location_id ?? null;
          return {
            brand_name: r?.variant?.brand?.name ?? '—',
            variant_name: r?.variant?.name ?? '—',
            variant_type: r?.variant?.variant_type ?? '—',
            disputed_quantity: Number(r?.disputed_quantity) || 0,
            warehouse_location_id: whId,
            warehouse_location_name: whId ? warehouseNamesById[whId] || '—' : '—',
          };
        });
        setRebateReturnLines(mapped);
      } catch {
        if (!cancelled) setRebateReturnLines([]);
      } finally {
        if (!cancelled) setLoadingRebateReturnLines(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.po_order_kind, order.source_rebate_id, warehouseNamesById]);

  // Use order data if available, otherwise use fetched data
  const client = order.client || kaData.client;
  const shop = order.shop || kaData.shop;
  const address = order.address || kaData.address;
  const kam = order.kam || kaData.kam;



  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'delivered':
      case 'fulfilled':
        return 'bg-green-600 text-white';
      case 'approved':
      case 'warehouse_reserved':
        return 'bg-blue-600 text-white';
      case 'admin_pending':
      case 'director_pending':
      case 'kam_pending':
        return 'bg-amber-500 text-white';
      case 'rejected':
        return 'bg-red-600 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  };

  const workflowLabel = (ws: string) => String(ws || '').replace(/_/g, ' ');

  return (
    <div className="space-y-5">
      {/* PO Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap border-b pb-4">
        <div>
          <div className="text-xs text-muted-foreground">PO Number</div>
          <div className="text-2xl font-bold font-mono flex items-center gap-2 flex-wrap">
            {order.po_number}
            {order.po_order_kind === 'rebate_fulfillment' && (
              <Badge variant="secondary">Rebate replacement</Badge>
            )}
          </div>
          {rebateSource ? (
            <>
              <div className="text-xs text-muted-foreground mt-2">Source PO</div>
              <div className="text-lg font-bold font-mono break-all flex flex-wrap items-center gap-2">
                <span>{rebateSource.source_po_number}</span>
                {rebateSource.rebate_number ? (
                  <Badge variant="outline">{rebateSource.rebate_number}</Badge>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="text-xs text-muted-foreground">RFPF Number</div>
          <div className="text-lg font-bold font-mono">{order.rfpf_number?.toUpperCase() || '—'}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {client?.client_name || '—'} · {shop?.shop_name || '—'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusBadgeClass(order.workflow_status || order.status)}>
            {workflowLabel(order.workflow_status || order.status)}
          </Badge>
          {order.dr_number && <Badge variant="secondary">DR: {order.dr_number}</Badge>}
        </div>
      </div>

      {/* Order Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Order date</Label>
          <div className="font-medium">{new Date(order.order_date).toLocaleDateString()}</div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Expected</Label>
          <div className="font-medium">
            {order.expected_delivery_date ? new Date(order.expected_delivery_date).toLocaleDateString() : '—'}
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Created By</Label>
          <div className="font-medium">{kam?.full_name || order.created_by_user?.full_name || '—'}</div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="h-4 w-4" />
            Shop
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm font-medium">{shop?.shop_name || '—'}</p>
          <div>
            <Label className="text-xs text-muted-foreground">COR (Certificate of Registration)</Label>
            <div className="mt-1.5">
              <KeyAccountShopCorView corPdfPath={shop?.cor_pdf_path} />
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
            {loading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {address ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Side - Address */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {address?.address_label}
                    </span>
                    {address?.is_default && (
                      <Badge variant="secondary" className="text-xs">Default</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">
                    {address?.full_address}
                  </p>
                  <p className="text-sm text-muted-foreground font-medium">
                    {address?.city}, {address?.province} {address?.zip_code}
                  </p>
                </div>

                {/* Right Side - Contact Info */}
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Contact Name</p>
                    <p className="text-sm font-medium">
                      {address?.contact_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Contact Phone</p>
                    <p className="text-sm font-medium">
                      {address?.contact_phone}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No delivery address specified.</p>
          )}
        </CardContent>
      </Card>

      <PurchaseOrderDeliveryDetailsPanel
        purchaseOrderId={order.id}
        enabled={purchaseOrderDeliveryDetailsEnabled(order)}
        purchaseOrder={order}
        filterWarehouseLocationId={isWarehouse ? membership.locationId : null}
        warehouseNamesById={warehouseNamesById}
      />

      {/* Items — grouped by source warehouse (same as Standard tab PO modal) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent>
          <PurchaseOrderItemsByWarehouse
            items={(order.items || []).map((item: any) => ({
              id: item.id,
              brand_name: item.brand_name || item.variants?.brands?.name,
              variant_name: item.variant_name || item.variants?.name,
              variant_type: item.variant_type || item.variants?.variant_type,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total_price: item.total_price,
              warehouse_location_id: item.warehouse_location_id,
            }))}
            headerWarehouseLocationId={order.warehouse_location_id}
            locationNamesById={warehouseNamesById}
            locationMetaById={warehouseLocationMeta}
          />
        </CardContent>
      </Card>

      {order.po_order_kind === 'rebate_fulfillment' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expected return items (disputed lines)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Rebate replacement fulfillment deducts the replacement items above. Disputed items only go back to
              inventory once the warehouse physically receives them (not automatic).
            </p>
            {loadingRebateReturnLines ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rebateReturnLines.length === 0 ? (
              <div className="text-sm text-muted-foreground">—</div>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>From warehouse</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rebateReturnLines.map((l, idx) => (
                      <TableRow key={`${l.variant_name}-${idx}`}>
                        <TableCell className="font-medium">{l.brand_name}</TableCell>
                        <TableCell>{l.variant_name}</TableCell>
                        <TableCell>{String(l.variant_type).toUpperCase()}</TableCell>
                        <TableCell className="text-muted-foreground">{l.warehouse_location_name}</TableCell>
                        <TableCell className="text-right font-semibold">{l.disputed_quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {canReceiveRebateReturns && (
              <div className="flex justify-end pt-1">
                <Button
                  variant="secondary"
                  disabled={loadingRebateReturnLines}
                  onClick={() => setReceiveReturnsOpen(true)}
                >
                  Receive returns
                </Button>
              </div>
            )}
            {isWarehouse &&
              !returnsAlreadyReceived &&
              !loadingRebateReturnLines &&
              rebateReturnLines.length > 0 &&
              receivableRebateReturnLines.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Returns for this rebate must be received by the assigned sub-warehouse or main warehouse
                  user for each line&apos;s ship-from location.
                </p>
              )}
            {returnsAlreadyReceived && (
              <p className="text-sm text-muted-foreground">Returns already received for this rebate.</p>
            )}
          </CardContent>
        </Card>
      )}

      {order.po_order_kind === 'rebate_fulfillment' && order.source_rebate_id && (
        <RebateReceiveReturnsDialog
          open={receiveReturnsOpen}
          onOpenChange={setReceiveReturnsOpen}
          fulfillmentPoId={order.id}
          sourceRebateId={order.source_rebate_id}
          warehouseNamesById={warehouseNamesById}
          warehouseLocationIsMainById={warehouseLocationIsMainById}
          warehouseMembership={membership}
          hubCompanyId={order.warehouse_company_id || user?.company_id}
          onSuccess={() => setReturnsAlreadyReceived(true)}
        />
      )}

      {/* Pricing Summary */}
      <RebateReplacementPricingSummary order={order} rebate={rebatePricing} />

      {/* Notes */}
      {order.notes && (
        <div className="space-y-2">
          <Label className="font-semibold">Notes</Label>
          <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">{order.notes}</p>
        </div>
      )}
    </div>
  );
}

