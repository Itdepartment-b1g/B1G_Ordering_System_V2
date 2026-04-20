import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Plus, Search, Eye, X, Trash2, Check, Package, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePurchaseOrders } from './hooks';
import { CreatePurchaseOrderDialog } from './components/CreatePurchaseOrderDialog';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { useWarehouseLocationMembership } from '@/features/inventory/useWarehouseLocationMembership';
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

  // Track fulfillment status for current user's warehouse location
  const [myLocationStatuses, setMyLocationStatuses] = useState<Record<string, string>>({});

  // View Dialog States
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [orderToView, setOrderToView] = useState<any>(null);
  const [transferLocationStatuses, setTransferLocationStatuses] = useState<Array<{ location_id: string; location_name: string; status: string }>>([]);

  // Company info for view dialog
  const [companyInfo, setCompanyInfo] = useState<{ company_name: string } | null>(null);

  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch company info for view dialog
  useEffect(() => {
    const fetchCompanyInfo = async () => {
      if (!user?.company_id) return;
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('company_name')
          .eq('id', user.company_id)
          .maybeSingle();
        if (error) throw error;
        setCompanyInfo(data);
      } catch (error) {
        console.error('Error fetching company info:', error);
      }
    };
    fetchCompanyInfo();
  }, [user?.company_id]);

  const [viewBuyerCompanyName, setViewBuyerCompanyName] = useState<string | null>(null);

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
    if (!orderToView?.company_id) {
      setViewBuyerCompanyName(null);
      return;
    }
    const buyerId =
      user?.role === 'warehouse' ? orderToView.company_id : user?.company_id;
    if (!buyerId) {
      setViewBuyerCompanyName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('company_name')
        .eq('id', buyerId)
        .maybeSingle();
      if (!cancelled && !error) setViewBuyerCompanyName(data?.company_name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderToView?.company_id, orderToView?.id, user?.role, user?.company_id]);

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

  const canFulfillOrder = (order: { id: string; status: string; fulfillment_type?: string }) =>
    canFulfillAsSubWarehouse &&
    order.fulfillment_type === 'warehouse_transfer' &&
    (order.status === 'approved_for_fulfillment' || order.status === 'partially_fulfilled') &&
    myLocationStatuses[order.id] !== 'fulfilled';

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

  const handleOpenFulfillDialog = (order: any) => {
    setOrderToFulfill(order);
    setFulfillLocationId(membership.locationId ?? null);
    setFulfillLocationName(null);
    setFulfillDialogOpen(true);
  };

  const handleOpenFulfillDialogForLocation = (order: any, locationId: string, locationName?: string | null) => {
    setOrderToFulfill(order);
    setFulfillLocationId(locationId);
    setFulfillLocationName(locationName ?? null);
    setFulfillDialogOpen(true);
  };

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
      await fetchPurchaseOrders();
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

  const filteredOrders = purchaseOrders.filter((order) => {
    const q = searchQuery.toLowerCase();
    const typeLabel = order.fulfillment_type === 'warehouse_transfer' ? 'internal warehouse' : 'supplier';
    return (
      order.po_number.toLowerCase().includes(q) ||
      (order.supplier?.company_name || '').toLowerCase().includes(q) ||
      typeLabel.includes(q) ||
      (order.fulfillment_type === 'warehouse_transfer' && (order.warehouse_location?.name || '').toLowerCase().includes(q))
    );
  });

  // Pagination: 10 purchase orders per page
  const PO_PER_PAGE = 10;
  const [poPage, setPoPage] = useState(1);
  const totalPoPages = Math.max(1, Math.ceil(filteredOrders.length / PO_PER_PAGE));
  const paginatedOrders = filteredOrders.slice(
    (poPage - 1) * PO_PER_PAGE,
    poPage * PO_PER_PAGE
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
            refreshData={fetchPurchaseOrders}
          />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Total Orders</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{purchaseOrders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Pending</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {purchaseOrders.filter(o => o.status === 'pending').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Approved</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold ">
              {purchaseOrders.filter(o => o.status === 'approved').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Total Value</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₱{purchaseOrders.filter(o => o.status === 'approved').reduce((sum, o) => sum + o.total_amount, 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
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
                    <div className="font-mono font-semibold">{order.po_number}</div>
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
                        Requested: {order.warehouse_location?.name ?? '—'}
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
                      <Check className="h-4 w-4 mr-1" />
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
                      <X className="h-4 w-4 mr-1" /> {order.created_by === user?.id ? 'Cancel' : 'Reject'}
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
                  <TableHead>PO Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Expected Delivery</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead>Status</TableHead>
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
                      <TableCell className="font-mono font-medium">{order.po_number}</TableCell>
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
                              Requested: <span className="font-medium text-foreground/80">{order.warehouse_location?.name ?? '—'}</span>
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
                              ) : (
                                <Check className="h-4 w-4 mr-1" />
                              )}
                              {order.fulfillment_type === 'warehouse_transfer'
                                ? 'Approve PO'
                                : 'Approve & Add to Inventory'}
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
                              ) : (
                                <X className="h-4 w-4 mr-1" />
                              )}
                              {order.created_by === user?.id ? 'Cancel' : 'Reject'}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleViewOrder(order)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination controls */}
            {filteredOrders.length > PO_PER_PAGE && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-xs text-muted-foreground">
                  Showing{' '}
                  <span className="font-medium">
                    {(poPage - 1) * PO_PER_PAGE + 1}-
                    {Math.min(poPage * PO_PER_PAGE, filteredOrders.length)}
                  </span>{' '}
                  of <span className="font-medium">{filteredOrders.length}</span> purchase orders
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPoPage((p) => Math.max(1, p - 1))}
                    disabled={poPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Prev
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {poPage} of {totalPoPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPoPage((p) => Math.min(totalPoPages, p + 1))}
                    disabled={poPage === totalPoPages}
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
                        <span className="font-semibold">Buyer (Our Company)</span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 text-sm pt-4">
                          <div>
                            <p className="font-medium">{(viewBuyerCompanyName ?? companyInfo?.company_name) || 'N/A'}</p>
                            <p className="text-muted-foreground text-xs">{user?.address || 'N/A'}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-muted-foreground">Contact</p>
                              <p>{user?.full_name || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Phone</p>
                              <p>{user?.phone || 'N/A'}</p>
                            </div>
                          </div>
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
                          {orderToView.fulfillment_type === 'warehouse_transfer' && (
                            <div className="rounded-md border bg-muted/40 p-3">
                              <Label className="text-muted-foreground text-xs">Requested warehouse / sub-warehouse</Label>
                              <p className="font-medium">{orderToView.warehouse_location?.name ?? '—'}</p>
                            </div>
                          )}
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
                        </div>
                      </AccordionContent>
                    </AccordionItem>

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
                        <p className="font-medium">{(viewBuyerCompanyName ?? companyInfo?.company_name) || 'N/A'}</p>
                        <p className="text-sm text-muted-foreground">{user?.address || 'N/A'}</p>
                        <p className="text-sm">Contact: {user?.full_name || 'N/A'}</p>
                        <p className="text-sm">Phone: {user?.phone || 'N/A'}</p>
                        <p className="text-sm">Email: {user?.email || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-lg">
                        {orderToView.fulfillment_type === 'warehouse_transfer' ? 'Warehouse Information' : 'Seller Information'}
                      </h4>
                      <div className="bg-muted p-4 rounded-lg space-y-1">
                        {orderToView.fulfillment_type === 'warehouse_transfer' && (
                          <div className="pb-2 border-b">
                            <p className="text-xs text-muted-foreground">Requested warehouse / sub-warehouse</p>
                            <p className="font-medium">{orderToView.warehouse_location?.name ?? '—'}</p>
                          </div>
                        )}
                        {orderToView.fulfillment_type === 'warehouse_transfer' && transferLocationStatuses.length > 0 && (
                          <div className="pt-3 mt-2 border-t space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">Fulfillment progress (by location)</p>
                            <div className="space-y-1">
                              {transferLocationStatuses.map((s) => (
                                <div key={s.location_id} className="flex items-center justify-between gap-2 text-sm">
                                  <span className="font-medium">{s.location_name}</span>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant={
                                        s.status === 'fulfilled'
                                          ? 'default'
                                          : s.status === 'ready'
                                            ? 'secondary'
                                            : s.status === 'partial'
                                              ? 'secondary'
                                              : 'outline'
                                      }
                                    >
                                      {s.status.toUpperCase()}
                                    </Badge>
                                    {orderToView.status &&
                                      (orderToView.status === 'approved_for_fulfillment' || orderToView.status === 'partially_fulfilled') &&
                                      s.status !== 'fulfilled' &&
                                      shouldShowFulfillButtonInViewForLocation(s.location_id) && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleOpenFulfillDialogForLocation(orderToView, s.location_id, s.location_name)}
                                          disabled={
                                            fulfillingOrderId === orderToView.id ||
                                            !canFulfillFromViewForLocation(s.location_id, s.status)
                                          }
                                        >
                                          {fulfillingOrderId === orderToView.id ? (
                                            <>
                                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                              Fulfilling...
                                            </>
                                          ) : (
                                            <>
                                              <Package className="h-4 w-4 mr-1" />
                                              Fulfill
                                            </>
                                          )}
                                        </Button>
                                      )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <p className="font-medium">{orderToView.supplier.company_name}</p>
                        <p className="text-sm text-muted-foreground">{orderToView.supplier.address}</p>
                        <p className="text-sm">Contact: {orderToView.supplier.contact_person}</p>
                        <p className="text-sm">Phone: {orderToView.supplier.phone}</p>
                        <p className="text-sm">Email: {orderToView.supplier.email}</p>
                      </div>
                    </div>
                  </div>

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
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

