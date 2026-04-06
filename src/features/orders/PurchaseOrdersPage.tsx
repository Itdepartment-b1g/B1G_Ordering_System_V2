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

  // View Dialog States
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [orderToView, setOrderToView] = useState<any>(null);

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
          .single();
        if (error) throw error;
        setCompanyInfo(data);
      } catch (error) {
        console.error('Error fetching company info:', error);
      }
    };
    fetchCompanyInfo();
  }, [user?.company_id]);

  const [viewBuyerCompanyName, setViewBuyerCompanyName] = useState<string | null>(null);







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
        .single();
      if (!cancelled && !error) setViewBuyerCompanyName(data?.company_name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderToView?.company_id, orderToView?.id, user?.role, user?.company_id]);

  const canApproveOrder = (order: { status: string; fulfillment_type?: string }) =>
    order.status === 'pending' &&
    (order.fulfillment_type !== 'warehouse_transfer' || user?.role === 'warehouse');

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
      typeLabel.includes(q)
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
                  <Badge variant={order.status === 'approved' ? 'default' : order.status === 'pending' ? 'secondary' : 'destructive'}>
                    {order.status}
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
                      {order.fulfillment_type === 'warehouse_transfer' ? 'Approve transfer' : 'Approve'}
                    </Button>
                  )}
                  {order.status === 'pending' && (
                    <Button variant="destructive" size="sm" onClick={() => handleOpenRejectDialog(order)} disabled={rejectingOrderId === order.id}>
                      <X className="h-4 w-4 mr-1" /> Reject
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
                        </div>
                      </TableCell>
                      <TableCell>{new Date(order.order_date).toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(order.expected_delivery_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">{order.items.length}</TableCell>
                      <TableCell className="text-right font-semibold">
                        ₱{order.total_amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            order.status === 'approved'
                              ? 'default'
                              : order.status === 'pending'
                              ? 'secondary'
                              : 'destructive'
                          }
                        >
                          {order.status}
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
                                ? 'Approve transfer'
                                : 'Approve & Add to Inventory'}
                            </Button>
                          )}
                          {order.status === 'pending' && (
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
                              Reject
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Purchase Order</AlertDialogTitle>
            <AlertDialogDescription>
              {orderToApprove && (
                <div className="space-y-4 py-4">
                  <p>Are you sure you want to approve <strong>{orderToApprove.po_number}</strong>?</p>
                  <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                    <p className="font-semibold text-sm">
                      {orderToApprove.fulfillment_type === 'warehouse_transfer'
                        ? 'Stock will move from the warehouse hub to the requesting company:'
                        : 'This will add the following items to your Main Inventory:'}
                    </p>
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
                                item.variant_type === 'flavor' ? 'bg-blue-100 text-blue-700' :
                                  item.variant_type === 'battery' ? 'bg-green-100 text-green-700' :
                                    'bg-purple-100 text-purple-700'
                              }
                            >
                              {String(item.variant_type).toUpperCase()}
                            </Badge>
                          </div>
                          <span className="font-semibold">
                            {orderToApprove.fulfillment_type === 'warehouse_transfer'
                              ? `${item.quantity} units`
                              : `+${item.quantity} units`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {orderToApprove.fulfillment_type === 'warehouse_transfer'
                      ? 'Hub inventory must cover these quantities. This cannot be undone.'
                      : 'The quantities will be added to existing stock or new items will be created if they don\'t exist.'}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveOrder}>
              <Check className="h-4 w-4 mr-2" />
              {orderToApprove?.fulfillment_type === 'warehouse_transfer'
                ? 'Approve transfer'
                : 'Approve & Add to Inventory'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Order Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Purchase Order</AlertDialogTitle>
            <AlertDialogDescription>
              {orderToReject && (
                <div className="space-y-4 py-2">
                  <p>Are you sure you want to reject <strong>{orderToReject.po_number}</strong>?</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRejectOrder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <X className="h-4 w-4 mr-2" /> Reject
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
                  <Badge
                    variant={
                      orderToView.status === 'approved' ? 'default' :
                        orderToView.status === 'pending' ? 'secondary' :
                          'destructive'
                    }
                  >
                    {orderToView.status.toUpperCase()}
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
                        <span className="font-semibold">Supplier</span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 text-sm pt-4">
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
                      variant={
                        orderToView.status === 'approved' ? 'default' :
                          orderToView.status === 'pending' ? 'secondary' :
                            'destructive'
                      }
                      className="text-base px-4 py-2"
                    >
                      {orderToView.status.toUpperCase()}
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
                      <h4 className="font-semibold text-lg">Seller Information</h4>
                      <div className="bg-muted p-4 rounded-lg space-y-1">
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
                                  {item.variant_type.toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">₱{item.unit_price.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-semibold">₱{item.total_price.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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

