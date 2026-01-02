import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Eye, X, Trash2, Check, Package, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePurchaseOrders } from './hooks';
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

interface BrandVariant {
  id: string;
  name: string;
  variant_type: 'flavor' | 'battery' | 'posm';
  brand_id: string;
  brand_name: string;
}

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const { purchaseOrders, suppliers, loading, createPurchaseOrder, approvePurchaseOrder, rejectPurchaseOrder } = usePurchaseOrders();
  const [searchQuery, setSearchQuery] = useState('');
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

  const { toast } = useToast();

  // Company information for buyer section
  const [companyInfo, setCompanyInfo] = useState<any>(null);

  // Available brands and variants for selection
  const [availableVariants, setAvailableVariants] = useState<BrandVariant[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [variantTypes, setVariantTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingVariantTypes, setLoadingVariantTypes] = useState(false);

  // For New Item (create brand/variants) flow
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [newItemTab, setNewItemTab] = useState<'existing' | 'new'>('existing');
  const [newBrandName, setNewBrandName] = useState('');
  const [existingBrandId, setExistingBrandId] = useState('');

  // For existing items selection (Add Existing tab)
  const [selectedBrandForExisting, setSelectedBrandForExisting] = useState('');
  const [filteredVariantsForBrand, setFilteredVariantsForBrand] = useState<BrandVariant[]>([]);

  const [flavorInput, setFlavorInput] = useState({ name: '', quantity: 0, unit_price: 0 });
  const [batteryInput, setBatteryInput] = useState({ name: '', quantity: 0, unit_price: 0 });
  const [posmInput, setPosmInput] = useState({ name: '', quantity: 0, unit_price: 0 });
  const [newItemsDraft, setNewItemsDraft] = useState<Array<{
    type: 'flavor' | 'battery' | 'posm';
    name: string;
    quantity: number;
    unit_price: number;
  }>>([]);

  // Form states
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

  // Form states for adding items
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [itemQuantity, setItemQuantity] = useState(0);
  const [itemPrice, setItemPrice] = useState(0);

  // Auto-set price to 0 for POSM variants
  useEffect(() => {
    if (selectedVariantId) {
      const selectedVariant = availableVariants.find(v => v.id === selectedVariantId);
      if (selectedVariant?.variant_type === 'posm') {
        setItemPrice(0);
      }
    }
  }, [selectedVariantId, availableVariants]);

  // Lists to be added
  const [itemsToAdd, setItemsToAdd] = useState<Array<{
    variant_id: string; // may be empty for new items; will be resolved on submit
    brand_name: string;
    variant_name: string;
    variant_type: 'flavor' | 'battery' | 'posm';
    quantity: number;
    unit_price: number;
    total: number;
  }>>([]);

  const [taxRate, setTaxRate] = useState(0); // 0% Tax
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [creatingOrder, setCreatingOrder] = useState(false);

  // Fetch company information for buyer section using user's company_id
  useEffect(() => {
    const fetchCompanyInfo = async () => {
      if (!user?.company_id) {
        console.warn('[PurchaseOrdersPage] No company_id found for user:', user);
        return;
      }

      console.log('[PurchaseOrdersPage] Fetching company info for company_id:', user.company_id);

      try {
        const { data, error } = await supabase
          .from('companies')
          .select('company_name, company_email')
          .eq('id', user.company_id)
          .single();

        if (error) {
          console.error('[PurchaseOrdersPage] Error fetching company:', error);
          throw error;
        }

        console.log('[PurchaseOrdersPage] Company info loaded successfully:', data);
        setCompanyInfo(data);
      } catch (error: any) {
        console.error('[PurchaseOrdersPage] Failed to fetch company info:', error);
        toast({
          title: 'Warning',
          description: `Could not load company information: ${error.message || 'Unknown error'}`,
          variant: 'default'
        });
      }
    };

    if (user?.company_id) {
      fetchCompanyInfo();
    }
  }, [user?.company_id]);

  // Auto-select default supplier: B1G Corporation when dialog opens
  useEffect(() => {
    if (!createDialogOpen) return;
    const defaultSupplier = suppliers.find(s => s.company_name === 'B1G Corporation');
    if (defaultSupplier) {
      setSelectedSupplierId(defaultSupplier.id);
    } else if (!selectedSupplierId && suppliers[0]) {
      // Fallback: first supplier
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [createDialogOpen, suppliers]);

  // Fetch available variants for selection
  useEffect(() => {
    const fetchVariants = async () => {
      setLoadingVariants(true);
      try {
        const { data, error } = await supabase
          .from('variants')
          .select(`
            id,
            name,
            variant_type,
            brands (
              id,
              name
            )
          `)
          .order('name');

        if (error) throw error;

        const formattedVariants: BrandVariant[] = (data || []).map((v: any) => ({
          id: v.id,
          name: v.name,
          variant_type: v.variant_type.toLowerCase() as 'flavor' | 'battery' | 'posm',
          brand_id: v.brands?.id || '',
          brand_name: v.brands?.name || 'Unknown',
        }));

        setAvailableVariants(formattedVariants);
      } catch (error) {
        console.error('Error fetching variants:', error);
      } finally {
        setLoadingVariants(false);
      }
    };

    fetchVariants();

    const fetchBrands = async () => {
      try {
        setLoadingBrands(true);
        const { data, error } = await supabase
          .from('brands')
          .select('id, name')
          .order('name');
        if (error) throw error;
        setBrands(data || []);
      } catch (err) {
        console.error('Error fetching brands:', err);
      } finally {
        setLoadingBrands(false);
      }
    };
    fetchBrands();

    const fetchVariantTypes = async () => {
      if (!user?.company_id) return;
      try {
        setLoadingVariantTypes(true);
        const { data, error } = await supabase
          .from('variant_types')
          .select('id, name')
          .eq('company_id', user.company_id);
        if (error) throw error;
        setVariantTypes(data || []);
      } catch (err) {
        console.error('Error fetching variant types:', err);
      } finally {
        setLoadingVariantTypes(false);
      }
    };
    if (user?.company_id) {
      fetchVariantTypes();
    }
  }, [user?.company_id]);

  // Filter variants when brand is selected in "Add Existing" tab
  useEffect(() => {
    if (selectedBrandForExisting) {
      const filtered = availableVariants.filter(v => v.brand_id === selectedBrandForExisting);
      setFilteredVariantsForBrand(filtered);
      setSelectedVariantId(''); // Reset variant selection when brand changes
    } else {
      setFilteredVariantsForBrand(availableVariants);
    }
  }, [selectedBrandForExisting, availableVariants]);

  const filteredOrders = purchaseOrders.filter(order =>
    order.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.supplier.company_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const calculateSubtotal = () => {
    const existingTotal = itemsToAdd.reduce((sum, item) => sum + item.total, 0);
    const draftTotal = newItemsDraft.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    return existingTotal + draftTotal;
  };
  const calculateTax = () => (calculateSubtotal() * taxRate) / 100;
  const calculateTotal = () => calculateSubtotal() + calculateTax() - discount;

  const handleAddItemToList = () => {
    if (!selectedVariantId) {
      toast({ title: 'Error', description: 'Please select a product', variant: 'destructive' });
      return;
    }
    if (itemQuantity <= 0) {
      toast({ title: 'Error', description: 'Quantity must be greater than 0', variant: 'destructive' });
      return;
    }

    const selectedVariant = availableVariants.find(v => v.id === selectedVariantId);
    if (!selectedVariant) {
      toast({ title: 'Error', description: 'Selected product not found', variant: 'destructive' });
      return;
    }

    // Allow 0 price for POSM, but require price for other types
    if (selectedVariant.variant_type !== 'posm' && itemPrice <= 0) {
      toast({ title: 'Error', description: 'Price must be greater than 0', variant: 'destructive' });
      return;
    }

    // Ensure POSM price is always 0
    const finalPrice = selectedVariant.variant_type === 'posm' ? 0 : itemPrice;

    const newItem = {
      variant_id: selectedVariant.id,
      brand_name: selectedVariant.brand_name,
      variant_name: selectedVariant.name,
      variant_type: selectedVariant.variant_type,
      quantity: itemQuantity,
      unit_price: finalPrice,
      total: itemQuantity * finalPrice
    };

    setItemsToAdd([...itemsToAdd, newItem]);
    setSelectedVariantId('');
    setItemQuantity(0);
    setItemPrice(0);
    toast({ title: 'Added', description: `${selectedVariant.brand_name} - ${selectedVariant.name} added to list` });
  };

  const handleRemoveItemFromList = (index: number) => {
    setItemsToAdd(itemsToAdd.filter((_, i) => i !== index));
  };

  const handleCreateOrder = async () => {
    // Always use B1G Corporation as the supplier
    let supplierId = selectedSupplierId;

    // Try to find B1G Corporation supplier
    if (!supplierId) {
      const defaultSupplier = suppliers.find(s => s.company_name === 'B1G Corporation');
      if (defaultSupplier) {
        supplierId = defaultSupplier.id;
        setSelectedSupplierId(supplierId);
      }
    }

    // If still not found, try fetching it directly
    if (!supplierId) {
      try {
        const { data: existing, error: findErr } = await supabase
          .from('suppliers')
          .select('id, company_name')
          .ilike('company_name', 'B1G Corporation')
          .maybeSingle();

        if (!findErr && existing) {
          supplierId = existing.id;
          setSelectedSupplierId(supplierId);
        }
      } catch (e) {
        console.error('Error finding B1G Corporation supplier:', e);
      }
    }

    if (!supplierId) {
      toast({
        title: 'Error',
        description: 'B1G Corporation supplier not found. Please contact system administrator.',
        variant: 'destructive'
      });
      return;
    }

    if (itemsToAdd.length === 0 && newItemsDraft.length === 0) {
      toast({ title: 'Error', description: 'Please add at least one item', variant: 'destructive' });
      return;
    }

    if (!expectedDelivery) {
      toast({ title: 'Error', description: 'Please set expected delivery date', variant: 'destructive' });
      return;
    }

    setCreatingOrder(true);
    const itemsPayload = [...itemsToAdd];

    // If there are draft new items, ensure brand and variants now (just-in-time), but DO NOT add to main inventory here.
    // They will only reach main inventory upon approval by RPC.
    if (newItemsDraft.length > 0) {
      try {
        // Determine brand to use/create
        if (!newBrandName.trim() && !existingBrandId) {
          toast({ title: 'Error', description: 'Enter a new brand or select an existing brand for new items', variant: 'destructive' });
          setCreatingOrder(false);
          return;
        }
        let brandId = existingBrandId;
        let brandName = '';
        if (newBrandName.trim()) {
          const { data: newBrand, error: brandErr } = await supabase
            .from('brands')
            .insert({
              name: newBrandName.trim(),
              company_id: user.company_id
            })
            .select()
            .single();
          if (brandErr) throw brandErr;
          brandId = newBrand.id;
          brandName = newBrand.name;
        } else {
          const b = brands.find(b => b.id === brandId);
          brandName = b?.name || 'Unknown';
        }

        // Create variants and push into itemsToAdd list for this PO
        for (const draft of newItemsDraft) {
          // Convert 'posm' to 'POSM' for database constraint
          const dbVariantType = draft.type === 'posm' ? 'POSM' : draft.type;

          // Find the corresponding variant_type_id
          const vt = variantTypes.find(type => type.name.toLowerCase() === dbVariantType.toLowerCase());
          if (!vt) {
            throw new Error(`Variant type "${dbVariantType}" not found for your company. Please contact support.`);
          }

          const { data: v, error: vErr } = await supabase
            .from('variants')
            .insert({
              name: draft.name,
              variant_type: dbVariantType,
              brand_id: brandId,
              company_id: user.company_id,
              variant_type_id: vt.id
            })
            .select()
            .single();
          if (vErr) throw vErr;
          // Convert back to lowercase for TypeScript consistency
          const variantType = v.variant_type.toLowerCase() as 'flavor' | 'battery' | 'posm';
          itemsPayload.push({
            variant_id: v.id,
            brand_name: brandName,
            variant_name: v.name,
            variant_type: variantType,
            quantity: draft.quantity,
            unit_price: draft.unit_price,
            total: draft.quantity * draft.unit_price,
          });
        }
      } catch (e: any) {
        console.error('Error preparing new items for PO:', e);
        toast({ title: 'Error', description: e?.message || 'Failed to prepare new items', variant: 'destructive' });
        setCreatingOrder(false);
        return;
      }
    }

    const result = await createPurchaseOrder({
      supplier_id: supplierId,
      order_date: orderDate,
      expected_delivery_date: expectedDelivery,
      items: itemsPayload.map(item => ({
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
      })),
      tax_rate: taxRate,
      discount,
      notes,
    });

    setCreatingOrder(false);

    if (result.success) {
      // Reset form
      setSelectedSupplierId('');
      setItemsToAdd([]);
      setNewItemsDraft([]);
      setExistingBrandId('');
      setNewBrandName('');
      setFlavorInput({ name: '', quantity: 0, unit_price: 0 });
      setBatteryInput({ name: '', quantity: 0, unit_price: 0 });
      setPosmInput({ name: '', quantity: 0, unit_price: 0 });
      setExpectedDelivery('');
      setDiscount(0);
      setTaxRate(0);
      setNotes('');
      setCreateDialogOpen(false);
    } else {
      toast({
        title: 'Error',
        description: result.error || 'Failed to create purchase order',
        variant: 'destructive',
      });
    }
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
          <p className="text-muted-foreground">Create and manage your purchase orders</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              Create Purchase Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Purchase Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* PO Details */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>PO Number</Label>
                  <Input value="Auto-generated" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Order Date</Label>
                  <Input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expected Delivery Date</Label>
                  <Input
                    type="date"
                    value={expectedDelivery}
                    onChange={(e) => setExpectedDelivery(e.target.value)}
                    min={orderDate}
                  />
                </div>
              </div>

              {/* Buyer Information */}
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <Label className="text-base font-semibold">Buyer Information</Label>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Company</p>
                    <p className="font-medium">{companyInfo?.company_name || 'Loading...'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Contact Person</p>
                    <p className="font-medium">{user?.full_name || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Address</p>
                    <p className="font-medium">{user?.address || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Phone</p>
                    <p className="font-medium">{user?.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Email</p>
                    <p className="font-medium">{user?.email || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Supplier Selection */}
              <div className="border rounded-lg p-4 space-y-3">
                <Label className="text-base font-semibold">Supplier</Label>
                <div className="space-y-2">
                  <Label>Select Supplier</Label>
                  <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedSupplierId && suppliers.find(s => s.id === selectedSupplierId) && (
                    <div className="mt-3 bg-muted p-3 rounded-lg space-y-1 text-sm">
                      {(() => {
                        const supplier = suppliers.find(s => s.id === selectedSupplierId);
                        return supplier ? (
                          <>
                            <p><span className="text-muted-foreground">Contact Person:</span> {supplier.contact_person}</p>
                            <p><span className="text-muted-foreground">Phone:</span> {supplier.phone}</p>
                            <p><span className="text-muted-foreground">Email:</span> {supplier.email}</p>
                            <p><span className="text-muted-foreground">Address:</span> {supplier.address}</p>
                            <p>
                              <Badge variant={supplier.status === 'active' ? 'default' : 'secondary'} className="mt-1">
                                {supplier.status.charAt(0).toUpperCase() + supplier.status.slice(1)}
                              </Badge>
                            </p>
                          </>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* Order Items */}
              <div className="border rounded-lg p-4 space-y-4">
                <Label className="text-base font-semibold">Order Items (Products to Purchase)</Label>

                <Tabs defaultValue="existing" value={newItemTab} onValueChange={(v) => setNewItemTab(v as any)}>
                  <TabsList className="grid grid-cols-2 w-full">
                    <TabsTrigger value="existing">Add Existing</TabsTrigger>
                    <TabsTrigger value="new">Add New Item</TabsTrigger>
                  </TabsList>

                  {/* Existing Item Tab */}
                  <TabsContent value="existing" className="space-y-3 bg-muted/30 p-4 rounded-lg">
                    <div className="space-y-2">
                      <Label>Select Brand</Label>
                      <Select value={selectedBrandForExisting} onValueChange={setSelectedBrandForExisting}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a brand" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Brands</SelectItem>
                          {brands.map((brand) => (
                            <SelectItem key={brand.id} value={brand.id}>
                              {brand.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Select Variant</Label>
                      <Select
                        value={selectedVariantId}
                        onValueChange={setSelectedVariantId}
                        disabled={!selectedBrandForExisting || filteredVariantsForBrand.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={
                            !selectedBrandForExisting
                              ? "Select a brand first"
                              : filteredVariantsForBrand.length === 0
                                ? "No variants available"
                                : "Choose a variant"
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredVariantsForBrand.map((variant) => (
                            <SelectItem key={variant.id} value={variant.id}>
                              {variant.name} ({variant.variant_type.toUpperCase()})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={itemQuantity || ''}
                          onChange={(e) => setItemQuantity(parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Unit Price (₱)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={itemPrice || ''}
                          onChange={(e) => setItemPrice(parseFloat(e.target.value) || 0)}
                          disabled={selectedVariantId && availableVariants.find(v => v.id === selectedVariantId)?.variant_type === 'posm'}
                          className={selectedVariantId && availableVariants.find(v => v.id === selectedVariantId)?.variant_type === 'posm' ? 'bg-muted cursor-not-allowed' : ''}
                        />
                        {selectedVariantId && availableVariants.find(v => v.id === selectedVariantId)?.variant_type === 'posm' && (
                          <p className="text-xs text-muted-foreground">POSM items have 0 price</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleAddItemToList}
                      size="sm"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add to Order
                    </Button>
                  </TabsContent>

                  {/* New Item Tab */}
                  <TabsContent value="new" className="space-y-4 bg-muted/30 p-4 rounded-lg">
                    {/* Brand Section */}
                    <div className="space-y-3">
                      <Label className="text-base font-semibold">Brand</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>New Brand Name</Label>
                          <Input
                            placeholder="e.g., RELX, JUUL"
                            value={newBrandName}
                            onChange={(e) => setNewBrandName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Or Select Existing Brand</Label>
                          <Select value={existingBrandId} onValueChange={setExistingBrandId}>
                            <SelectTrigger>
                              <SelectValue placeholder={loadingBrands ? 'Loading brands...' : 'Choose existing brand'} />
                            </SelectTrigger>
                            <SelectContent>
                              {brands.map(b => (
                                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">Enter a new brand name OR select an existing brand</p>
                    </div>

                    {/* Variants Section */}
                    <div className="space-y-3">
                      <Label className="text-base font-semibold">Variants</Label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Flavor */}
                        <div className="border rounded-lg p-4 space-y-3">
                          <Label className="text-primary font-semibold">Flavor</Label>
                          <div className="space-y-2">
                            <Label>Flavor Name</Label>
                            <Input
                              placeholder="Flavor Code"
                              value={flavorInput.name}
                              onChange={(e) => setFlavorInput({ ...flavorInput, name: e.target.value })}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>Quantity</Label>
                              <Input
                                type="number" min="0" placeholder="0"
                                value={flavorInput.quantity || ''}
                                onChange={(e) => setFlavorInput({ ...flavorInput, quantity: parseInt(e.target.value) || 0 })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Price (₱)</Label>
                              <Input
                                type="number" min="0" step="0.01" placeholder="0.00"
                                value={flavorInput.unit_price || ''}
                                onChange={(e) => setFlavorInput({ ...flavorInput, unit_price: parseFloat(e.target.value) || 0 })}
                              />
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => {
                              if (!flavorInput.name.trim() || flavorInput.quantity <= 0 || flavorInput.unit_price <= 0) return;
                              setNewItemsDraft([...newItemsDraft, { type: 'flavor', name: flavorInput.name.trim(), quantity: flavorInput.quantity, unit_price: flavorInput.unit_price }]);
                              setFlavorInput({ name: '', quantity: 0, unit_price: 0 });
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" /> Add to List
                          </Button>
                        </div>

                        {/* Battery */}
                        <div className="border rounded-lg p-4 space-y-3">
                          <Label className="text-green-700 font-semibold">Battery</Label>
                          <div className="space-y-2">
                            <Label>Battery Name</Label>
                            <Input
                              placeholder="Battery Code"
                              value={batteryInput.name}
                              onChange={(e) => setBatteryInput({ ...batteryInput, name: e.target.value })}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>Quantity</Label>
                              <Input
                                type="number" min="0" placeholder="0"
                                value={batteryInput.quantity || ''}
                                onChange={(e) => setBatteryInput({ ...batteryInput, quantity: parseInt(e.target.value) || 0 })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Price (₱)</Label>
                              <Input
                                type="number" min="0" step="0.01" placeholder="0.00"
                                value={batteryInput.unit_price || ''}
                                onChange={(e) => setBatteryInput({ ...batteryInput, unit_price: parseFloat(e.target.value) || 0 })}
                              />
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => {
                              if (!batteryInput.name.trim() || batteryInput.quantity <= 0 || batteryInput.unit_price <= 0) return;
                              setNewItemsDraft([...newItemsDraft, { type: 'battery', name: batteryInput.name.trim(), quantity: batteryInput.quantity, unit_price: batteryInput.unit_price }]);
                              setBatteryInput({ name: '', quantity: 0, unit_price: 0 });
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" /> Add to List
                          </Button>
                        </div>

                        {/* POSM */}
                        <div className="border rounded-lg p-4 space-y-3">
                          <Label className="text-purple-700 font-semibold">POSM</Label>
                          <div className="space-y-2">
                            <Label>POSM Name</Label>
                            <Input
                              placeholder="Marketin Materials"
                              value={posmInput.name}
                              onChange={(e) => setPosmInput({ ...posmInput, name: e.target.value })}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>Quantity</Label>
                              <Input
                                type="number" min="0" placeholder="0"
                                value={posmInput.quantity || ''}
                                onChange={(e) => setPosmInput({ ...posmInput, quantity: parseInt(e.target.value) || 0 })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Price (₱)</Label>
                              <Input
                                type="number"
                                value="0.00"
                                disabled
                                className="bg-muted cursor-not-allowed"
                              />
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => {
                              if (!posmInput.name.trim() || posmInput.quantity <= 0) return;
                              setNewItemsDraft([...newItemsDraft, { type: 'posm', name: posmInput.name.trim(), quantity: posmInput.quantity, unit_price: 0 }]);
                              setPosmInput({ name: '', quantity: 0, unit_price: 0 });
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" /> Add to List
                          </Button>
                        </div>
                      </div>

                      {/* Draft list */}
                      {newItemsDraft.length > 0 ? (
                        <div className="border rounded-lg p-3 space-y-2">
                          <Label className="text-sm">New Items to Create ({newItemsDraft.length})</Label>
                          <div className="space-y-2">
                            {newItemsDraft.map((d, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-background p-2 rounded">
                                <div className="flex items-center gap-2 text-sm">
                                  <Badge variant="secondary" className={
                                    d.type === 'flavor' ? 'bg-blue-100 text-blue-700' :
                                      d.type === 'battery' ? 'bg-green-100 text-green-700' :
                                        'bg-purple-100 text-purple-700'
                                  }>
                                    {d.type.toUpperCase()}
                                  </Badge>
                                  <span className="font-medium">{d.name}</span>
                                  <span className="text-muted-foreground">•</span>
                                  <span>{d.quantity} units</span>
                                  <span className="text-muted-foreground">@</span>
                                  <span>₱{d.unit_price.toFixed(2)}</span>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setNewItemsDraft(newItemsDraft.filter((_, i) => i !== idx))}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Items will be created and added to inventory only when the PO is created and approved.
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No items added yet</p>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Items List */}
                {itemsToAdd.length > 0 && (
                  <div className="border-t pt-3 space-y-2">
                    <Label className="text-sm">Items in Order ({itemsToAdd.length})</Label>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {itemsToAdd.map((item, index) => (
                        <div key={index} className="flex items-center justify-between bg-muted p-3 rounded-md">
                          <div className="flex-1 grid grid-cols-5 gap-2 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Brand</p>
                              <p className="font-medium">{item.brand_name}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Product</p>
                              <p className="font-medium">{item.variant_name}</p>
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
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Quantity</p>
                              <p>{item.quantity} units</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Unit Price</p>
                              <p>₱{item.unit_price.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Total</p>
                              <p className="font-semibold">₱{item.total.toLocaleString()}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItemFromList(index)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Pricing */}
              <div className="border rounded-lg p-4 space-y-3">
                <Label className="text-base font-semibold">Pricing Details</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Tax Rate (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={taxRate}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Discount (₱)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discount}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-medium">₱{calculateSubtotal().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax ({taxRate}%):</span>
                    <span className="font-medium">₱{calculateTax().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Discount:</span>
                    <span className="font-medium">- ₱{discount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total Amount:</span>
                    <span>₱{calculateTotal().toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes / Special Instructions (Optional)</Label>
                <Textarea
                  placeholder="Add any special instructions or notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <Button className="w-full" onClick={handleCreateOrder} disabled={creatingOrder}>
                {creatingOrder ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Purchase Order'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
            {filteredOrders.map((order) => (
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
                    <div className="text-xs text-muted-foreground">Seller</div>
                    <div className="truncate">{order.supplier.company_name}</div>
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
                  <div className="col-span-2 flex justify-between border-t pt-2 font-medium">
                    <span>Amount</span>
                    <span>₱{order.total_amount.toLocaleString()}</span>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  {order.status === 'pending' && (
                    <Button variant="default" size="sm" onClick={() => handleOpenApproveDialog(order)} disabled={approvingOrderId === order.id}>
                      <Check className="h-4 w-4 mr-1" /> Approve
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
                {filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono font-medium">{order.po_number}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{order.supplier.company_name}</p>
                        <p className="text-xs text-muted-foreground">{order.supplier.contact_person}</p>
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
                          order.status === 'approved' ? 'default' :
                            order.status === 'pending' ? 'secondary' :
                              'destructive'
                        }
                      >
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {order.status === 'pending' && (
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
                            Approve & Add to Inventory
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
                ))}
              </TableBody>
            </Table>
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
                    <p className="font-semibold text-sm">This will add the following items to your Main Inventory:</p>
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
                              {item.variant_type.toUpperCase()}
                            </Badge>
                          </div>
                          <span className="font-semibold">+{item.quantity} units</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The quantities will be added to existing stock or new items will be created if they don't exist.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveOrder}>
              <Check className="h-4 w-4 mr-2" />
              Approve & Add to Inventory
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

      {/* View Purchase Order Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Purchase Order Details</DialogTitle>
          </DialogHeader>
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
                    <p className="font-medium">{companyInfo?.company_name || 'N/A'}</p>
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

              {/* Items - Responsive */}
              <div className="space-y-2">
                <h4 className="font-semibold text-lg">Items</h4>
                {/* Mobile: card list */}
                <div className="md:hidden space-y-2">
                  {orderToView.items.map((item: any) => (
                    <div key={item.id} className="rounded-lg border bg-background p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{item.brand_name} • {item.variant_name}</div>
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
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Qty</div>
                          <div>{item.quantity}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Unit</div>
                          <div>₱{item.unit_price.toFixed(2)}</div>
                        </div>
                        <div className="col-span-2 flex justify-between border-t pt-2 font-medium">
                          <span>Total</span>
                          <span>₱{item.total_price.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: table */}
                <div className="hidden md:block border rounded-lg">
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
                  <span className="font-medium">₱{orderToView.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax ({orderToView.tax_rate}%):</span>
                  <span className="font-medium">₱{orderToView.tax_amount.toFixed(2)}</span>
                </div>
                {orderToView.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Discount:</span>
                    <span className="font-medium text-green-600">- ₱{orderToView.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total Amount:</span>
                  <span>₱{orderToView.total_amount.toFixed(2)}</span>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}

