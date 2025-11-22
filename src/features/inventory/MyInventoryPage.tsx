import { useState, useEffect } from 'react';
import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Package, ChevronDown, ChevronRight, ArrowLeft, FileSignature, ShoppingCart, Loader2, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import { format } from 'date-fns';
import { useAgentInventory } from './hooks';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

export default function MyInventory() {
  const { agentBrands } = useAgentInventory();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBrands, setExpandedBrands] = useState<string[]>([]);
  const [remitDialogOpen, setRemitDialogOpen] = useState(false);
  const [remitting, setRemitting] = useState(false);
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [leaderName, setLeaderName] = useState<string | null>(null);

  // New state for orders and signature
  const [todayOrders, setTodayOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [showOrderDetailsModal, setShowOrderDetailsModal] = useState(false);

  // Confirmation checkboxes for each section
  const [unsoldConfirmed, setUnsoldConfirmed] = useState(false);
  const [soldConfirmed, setSoldConfirmed] = useState(false);
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);

  const toggleBrandExpand = (brandId: string) => {
    setExpandedBrands(prev =>
      prev.includes(brandId)
        ? prev.filter(id => id !== brandId)
        : [...prev, brandId]
    );
  };

  const filteredBrands = agentBrands.filter(brand =>
    brand.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    brand.flavors.some(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    brand.batteries.some(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getTotalVariants = () => {
    let count = 0;
    agentBrands.forEach(brand => {
      count += brand.flavors.length + brand.batteries.length;
    });
    return count;
  };

  const getTotalStock = (brand: any) => {
    const flavorStock = brand.flavors.reduce((sum: number, f: any) => sum + f.stock, 0);
    const batteryStock = brand.batteries.reduce((sum: number, b: any) => sum + b.stock, 0);
    return flavorStock + batteryStock;
  };

  const getLowStockCount = () => {
    let count = 0;
    agentBrands.forEach(brand => {
      count += brand.flavors.filter(f => f.status === 'low').length;
      count += brand.batteries.filter(b => b.status === 'low').length;
    });
    return count;
  };

  // Get items with stock > 0 to remit
  const getItemsToRemit = () => {
    const items: Array<{
      variantId: string;
      variantName: string;
      brandName: string;
      variantType: 'flavor' | 'battery';
      quantity: number;
      price: number;
    }> = [];

    agentBrands.forEach(brand => {
      brand.flavors.forEach(flavor => {
        // Ensure stock is a number and greater than 0
        const stock = typeof flavor.stock === 'number' ? flavor.stock : Number(flavor.stock) || 0;
        if (stock > 0) {
          items.push({
            variantId: flavor.id,
            variantName: flavor.name,
            brandName: brand.name,
            variantType: 'flavor',
            quantity: stock,
            price: flavor.price
          });
        }
      });
      brand.batteries.forEach(battery => {
        // Ensure stock is a number and greater than 0
        const stock = typeof battery.stock === 'number' ? battery.stock : Number(battery.stock) || 0;
        if (stock > 0) {
          items.push({
            variantId: battery.id,
            variantName: battery.name,
            brandName: brand.name,
            variantType: 'battery',
            quantity: stock,
            price: battery.price
          });
        }
      });
    });

    return items;
  };

  // Get total quantity to remit
  const getTotalRemitQuantity = () => {
    return getItemsToRemit().reduce((sum, item) => sum + item.quantity, 0);
  };

  // Fetch leader info
  useEffect(() => {
    const fetchLeader = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('leader_teams')
          .select(`
            leader_id,
            profiles!leader_teams_leader_id_fkey(
              id,
              full_name
            )
          `)
          .eq('agent_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
          console.error('Error fetching leader:', error);
          return;
        }

        if (data) {
          setLeaderId(data.leader_id);
          setLeaderName((data.profiles as any)?.full_name || null);
        }
      } catch (error) {
        console.error('Error fetching leader:', error);
      }
    };

    fetchLeader();

    // Real-time subscriptions for agent inventory and orders
    const channels = [
      subscribeToTable('agent_inventory', () => {
        console.log('🔄 Real-time: Agent inventory updated');
        // Inventory will auto-refresh via AgentInventoryContext
      }),
      subscribeToTable('client_orders', () => {
        console.log('🔄 Real-time: Orders updated');
        if (remitDialogOpen && user?.id) {
          fetchTodayOrders(); // Refresh orders if dialog is open
        }
      })
    ];

    return () => channels.forEach(unsubscribe);
  }, [user?.id]);

  // Fetch today's orders when dialog opens and reset confirmations
  useEffect(() => {
    if (remitDialogOpen && user?.id) {
      fetchTodayOrders();
      // Reset confirmations
      setUnsoldConfirmed(false);
      setSoldConfirmed(false);
      setSignatureConfirmed(false);
    }
  }, [remitDialogOpen, user?.id]);

  // Fetch today's orders (not yet remitted)
  const fetchTodayOrders = async () => {
    if (!user?.id) return;

    setLoadingOrders(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('client_orders')
        .select(`
          id,
          order_number,
          total_amount,
          status,
          created_at,
          clients(name),
          items:client_order_items(
              quantity,
              unit_price,
              variant:variants(
                name,
                brand:brands(name)
            )
          )
        `)
        .eq('agent_id', user.id)
        .eq('remitted', false)  // Only non-remitted orders
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group orders with their items
      const formattedOrders = (data || []).map((order: any) => {
        const items = (order.items || []).map((item: any) => ({
          variantName: item.variant?.name || 'Unknown',
          brandName: item.variant?.brand?.name || 'Unknown',
          quantity: item.quantity,
          price: item.unit_price || 0,
          amount: item.quantity * (item.unit_price || 0)
        }));

        // Get unique brand names
        const uniqueBrands = [...new Set(items.map((item: any) => item.brandName))];

        // Calculate total quantity
        const totalQuantity = items.reduce((sum: number, item: any) => sum + item.quantity, 0);

        return {
          id: order.id,
          orderNumber: order.order_number,
          clientName: order.clients?.name || 'Unknown',
          brands: uniqueBrands.length > 0 ? uniqueBrands.join(', ') : '-',
          totalQuantity: totalQuantity,
          totalAmount: order.total_amount,
          status: order.status,
          createdAt: order.created_at,
          items: items
        };
      });

      setTodayOrders(formattedOrders);
    } catch (error: any) {
      console.error('Error fetching today orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to load today\'s orders',
        variant: 'destructive'
      });
    } finally {
      setLoadingOrders(false);
    }
  };

  // Upload signature to storage
  const uploadSignatureToStorage = async (): Promise<{ url: string; path: string } | null> => {
    if (!signatureDataUrl || !user?.id || !leaderId) return null;

    try {
      // Convert base64 to blob
      const response = await fetch(signatureDataUrl);
      const blob = await response.blob();

      // Create unique filename
      const timestamp = new Date().getTime();
      const filename = `${user.id}/${leaderId}/${timestamp}.png`;

      // Upload to remittance-signatures bucket
      const { data, error } = await supabase.storage
        .from('remittance-signatures')
        .upload(filename, blob, {
          contentType: 'image/png',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('remittance-signatures')
        .getPublicUrl(filename);

      return {
        url: publicUrl,
        path: filename
      };
    } catch (error: any) {
      console.error('Error uploading signature:', error);
      toast({
        title: 'Signature Upload Failed',
        description: error.message || 'Failed to upload signature',
        variant: 'destructive'
      });
      return null;
    }
  };

  // Handle remit inventory
  const handleRemitInventory = async () => {
    if (!user?.id || !leaderId) {
      toast({
        title: 'Error',
        description: 'Unable to find your leader. Please contact admin.',
        variant: 'destructive'
      });
      return;
    }

    // Check signature
    if (!signatureDataUrl) {
      toast({
        title: 'Signature Required',
        description: 'Please provide your signature to confirm remittance',
        variant: 'destructive'
      });
      setShowSignatureModal(true);
      return;
    }

    const itemsToRemit = getItemsToRemit();

    if (itemsToRemit.length === 0 && todayOrders.length === 0) {
      toast({
        title: 'Nothing to remit',
        description: 'You have no inventory or orders to remit',
        variant: 'destructive'
      });
      return;
    }

    setRemitting(true);
    try {
      // Upload signature
      const signatureData = await uploadSignatureToStorage();
      if (!signatureData) {
        throw new Error('Failed to upload signature');
      }

      // Get unique order IDs
      const orderIds = [...new Set(todayOrders.map(order => order.id))];

      // Call remit function with orders and signature
      const { data, error } = await supabase.rpc('remit_inventory_to_leader', {
        p_agent_id: user.id,
        p_leader_id: leaderId,
        p_performed_by: user.id,
        p_order_ids: orderIds,
        p_signature_url: signatureData.url,
        p_signature_path: signatureData.path
      });

      if (error) {
        console.error('Backend RPC error:', error);
        throw error;
      }

      if (data && !data.success) {
        throw new Error(data.message || 'Failed to remit inventory');
      }

      toast({
        title: 'Success!',
        description: data.message || 'Inventory and orders remitted successfully',
      });

      setRemitDialogOpen(false);
      setSignatureDataUrl(null);
      setTodayOrders([]);

      // Refresh page
      window.location.reload();
    } catch (error: any) {
      console.error('Error remitting inventory:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to remit inventory',
        variant: 'destructive'
      });
    } finally {
      setRemitting(false);
    }
  };

  const itemsToRemit = getItemsToRemit();
  const hasItemsToRemit = itemsToRemit.length > 0;
  const totalRemitQuantity = getTotalRemitQuantity();

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">My Inventory</h1>
          <p className="text-sm md:text-base text-muted-foreground">Products allocated to you by admin</p>
        </div>
        {hasItemsToRemit && leaderId && (
          <Button
            onClick={() => setRemitDialogOpen(true)}
            variant="outline"
            className="gap-2 w-full sm:w-auto"
            size="sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Remit Inventory
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Total Brands</p>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{agentBrands.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Total Variants</p>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{getTotalVariants()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Low Stock Items</p>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-yellow-600">{getLowStockCount()}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search brands, products, or variants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {filteredBrands.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">No inventory yet</div>
            ) : (
              filteredBrands.map((brand) => (
                <div key={brand.id} className="rounded-lg border bg-background p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{brand.name}</div>
                      <div className="text-xs text-muted-foreground">{brand.flavors.length}F / {brand.batteries.length}B</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Stock</div>
                      <div className="font-bold">{getTotalStock(brand)}</div>
                      {(() => {
                        const hasLow = brand.flavors.some((f: any) => f.status === 'low') || brand.batteries.some((b: any) => b.status === 'low');
                        const total = getTotalStock(brand);
                        const pillClass = total === 0 ? 'bg-red-100 text-red-700' : hasLow ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';
                        const label = total === 0 ? 'Out of stock' : hasLow ? 'Low stock' : 'In stock';
                        return <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${pillClass}`}>{label}</span>;
                      })()}
                    </div>
                  </div>
                  {/* Details */}
                  {expandedBrands.includes(brand.id) && (
                    <div className="mt-3 space-y-2">
                      {brand.flavors.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-blue-600 mb-1">Flavors</div>
                          <div className="space-y-1">
                            {brand.flavors.map((f: any) => (
                              <div key={f.id} className="flex justify-between items-center text-sm bg-muted/30 rounded px-2 py-1">
                                <span>{f.name}</span>
                                <div className="text-right">
                                  <div className="font-medium">{f.stock} • ₱{f.price.toFixed(2)}</div>
                                  <span className={`text-xs ${f.stock === 0 ? 'text-red-600' : (f as any).status === 'low' ? 'text-orange-600' : 'text-blue-700'}`}>
                                    {(f as any).status === 'low' ? 'low' : f.stock === 0 ? 'out' : 'in'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {brand.batteries.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-green-600 mb-1">Batteries</div>
                          <div className="space-y-1">
                            {brand.batteries.map((b: any) => (
                              <div key={b.id} className="flex justify-between items-center text-sm bg-muted/30 rounded px-2 py-1">
                                <span>{b.name}</span>
                                <div className="text-right">
                                  <div className="font-medium">{b.stock} • ₱{b.price.toFixed(2)}</div>
                                  <span className={`text-xs ${b.stock === 0 ? 'text-red-600' : (b as any).status === 'low' ? 'text-orange-600' : 'text-blue-700'}`}>
                                    {(b as any).status === 'low' ? 'low' : b.stock === 0 ? 'out' : 'in'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => toggleBrandExpand(brand.id)}>
                      {expandedBrands.includes(brand.id) ? 'Hide Details' : 'Show Details'}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop/Tablet: table */}
          <div className="hidden md:block w-full overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBrands.map((brand) => (
                  <React.Fragment key={brand.id}>
                    {/* Brand Row */}
                    <TableRow className="hover:bg-muted/50 bg-primary/5">
                      <TableCell className="cursor-pointer" onClick={() => toggleBrandExpand(brand.id)}>
                        {expandedBrands.includes(brand.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-bold cursor-pointer" onClick={() => toggleBrandExpand(brand.id)}>
                        {brand.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">Brand</Badge>
                      </TableCell>
                      <TableCell className="text-right cursor-pointer" onClick={() => toggleBrandExpand(brand.id)}>
                        {getTotalStock(brand)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground cursor-pointer" onClick={() => toggleBrandExpand(brand.id)}>
                        {brand.flavors.length}F / {brand.batteries.length}B
                      </TableCell>
                      <TableCell className="text-right">
                        {(() => {
                          const total = getTotalStock(brand);
                          const hasLow = brand.flavors.some((f: any) => f.status === 'low') || brand.batteries.some((b: any) => b.status === 'low');
                          const pillClass = total === 0 ? 'bg-red-100 text-red-700' : hasLow ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';
                          const label = total === 0 ? 'Out of Stock' : hasLow ? 'Low Stock' : 'In Stock';
                          return <span className={`px-2 py-1 rounded-full text-xs font-medium ${pillClass}`}>{label}</span>;
                        })()}
                      </TableCell>
                    </TableRow>

                    {/* Flavors */}
                    {expandedBrands.includes(brand.id) && brand.flavors.length > 0 && (
                      <TableRow className="bg-blue-50/50">
                        <TableCell></TableCell>
                        <TableCell colSpan={5} className="pl-8 py-2">
                          <span className="text-xs font-semibold text-blue-600">FLAVORS</span>
                        </TableCell>
                      </TableRow>
                    )}
                    {expandedBrands.includes(brand.id) && brand.flavors.map((flavor) => (
                      <TableRow key={flavor.id} className="bg-muted/10">
                        <TableCell></TableCell>
                        <TableCell className="pl-12 text-sm">
                          <span className="text-muted-foreground">↳</span> {flavor.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-blue-100 text-blue-700">Flavor</Badge>
                        </TableCell>
                        <TableCell className="text-right">{flavor.stock}</TableCell>
                        <TableCell className="text-right">₱{flavor.price.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={
                              flavor.status === 'available' ? 'default' :
                                flavor.status === 'low' ? 'secondary' :
                                  'destructive'
                            }
                          >
                            {flavor.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Batteries */}
                    {expandedBrands.includes(brand.id) && brand.batteries.length > 0 && (
                      <TableRow className="bg-green-50/50">
                        <TableCell></TableCell>
                        <TableCell colSpan={5} className="pl-8 py-2">
                          <span className="text-xs font-semibold text-green-600">BATTERIES</span>
                        </TableCell>
                      </TableRow>
                    )}
                    {expandedBrands.includes(brand.id) && brand.batteries.map((battery) => (
                      <TableRow key={battery.id} className="bg-muted/10">
                        <TableCell></TableCell>
                        <TableCell className="pl-12 text-sm">
                          <span className="text-muted-foreground">↳</span> {battery.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-green-100 text-green-700">Battery</Badge>
                        </TableCell>
                        <TableCell className="text-right">{battery.stock}</TableCell>
                        <TableCell className="text-right">₱{battery.price.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={
                              battery.status === 'available' ? 'default' :
                                battery.status === 'low' ? 'secondary' :
                                  'destructive'
                            }
                          >
                            {battery.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Remit Inventory Dialog */}
      <Dialog open={remitDialogOpen} onOpenChange={setRemitDialogOpen}>
        <DialogContent className="w-[95vw] max-w-4xl h-[90vh] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-4 pt-6 pb-4 md:px-6">
            <DialogTitle className="text-lg md:text-xl">Remit Inventory to Leader</DialogTitle>
            <DialogDescription className="text-sm">
              {leaderName
                ? `Remit your unsold inventory and today's sold orders to ${leaderName}`
                : 'Remit your unsold inventory and today\'s sold orders to your leader'}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="unsold" className="w-full flex-1 flex flex-col overflow-hidden">
            <div className="px-3 md:px-6 pt-2 pb-1">
              <TabsList className="grid w-full grid-cols-4 gap-1 h-auto p-1">
                <TabsTrigger value="unsold" className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 relative py-1.5 px-1 text-xs sm:text-sm min-w-0">
                  <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="text-[9px] sm:text-sm leading-tight truncate max-w-full">Unsold</span>
                  {unsoldConfirmed && <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-600 absolute top-0 right-0" />}
                </TabsTrigger>
                <TabsTrigger value="sold" className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 relative py-1.5 px-1 text-xs sm:text-sm min-w-0">
                  <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="text-[9px] sm:text-sm leading-tight truncate max-w-full">Sold</span>
                  {soldConfirmed && <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-600 absolute top-0 right-0" />}
                </TabsTrigger>
                <TabsTrigger value="signature" className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 relative py-1.5 px-1 text-xs sm:text-sm min-w-0">
                  <FileSignature className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="text-[9px] sm:text-sm leading-tight truncate max-w-full">Sign</span>
                  {signatureConfirmed && <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-600 absolute top-0 right-0" />}
                </TabsTrigger>
                <TabsTrigger value="summary" className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 py-1.5 px-1 text-xs sm:text-sm min-w-0">
                  <ClipboardCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="text-[9px] sm:text-sm leading-tight truncate max-w-full">Summary</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Unsold Inventory Tab */}
            <TabsContent value="unsold" className="flex-1 overflow-y-auto px-4 md:px-6 space-y-3 md:space-y-4 mt-2">
              <Card>
                <CardContent className="p-3 md:p-4">
                  <div className="grid grid-cols-3 gap-2 md:gap-4 text-center">
                    <div>
                      <div className="text-lg md:text-2xl font-bold text-primary">{itemsToRemit.length}</div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">Items</div>
                    </div>
                    <div>
                      <div className="text-lg md:text-2xl font-bold text-primary">{totalRemitQuantity}</div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">Total Units</div>
                    </div>
                    <div>
                      <div className="text-lg md:text-2xl font-bold text-primary">
                        ₱{itemsToRemit.reduce((sum, item) => sum + (item.quantity * item.price), 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">Total Value</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {itemsToRemit.length > 0 ? (
                <>
                  {/* Mobile Card Layout */}
                  <div className="md:hidden space-y-2">
                    {itemsToRemit.map((item) => (
                      <Card key={item.variantId} className="border">
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <div className="font-semibold text-sm">{item.brandName}</div>
                              <div className="text-sm text-muted-foreground">{item.variantName}</div>
                            </div>
                            <Badge variant="secondary" className="ml-2 text-xs">{item.variantType}</Badge>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t">
                            <div className="flex items-center gap-4">
                              <div>
                                <div className="text-xs text-muted-foreground">Quantity</div>
                                <div className="font-semibold text-sm">{item.quantity}</div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">Value</div>
                                <div className="font-semibold text-sm">₱{(item.quantity * item.price).toLocaleString()}</div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Desktop Table Layout */}
                  <div className="hidden md:block border rounded-lg overflow-hidden">
                    <div className="max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background">
                          <TableRow>
                            <TableHead>Brand</TableHead>
                            <TableHead>Variant</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                            <TableHead className="text-right">Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itemsToRemit.map((item) => (
                            <TableRow key={item.variantId}>
                              <TableCell className="font-medium">{item.brandName}</TableCell>
                              <TableCell>{item.variantName}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{item.variantType}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                              <TableCell className="text-right">₱{(item.quantity * item.price).toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No unsold inventory to remit</p>
                </div>
              )}

              {/* Confirmation Checkbox */}
              <div className="flex items-start space-x-2 p-3 md:p-4 bg-muted/30 rounded-lg border">
                <Checkbox
                  id="unsold-confirm"
                  checked={unsoldConfirmed}
                  onCheckedChange={(checked) => setUnsoldConfirmed(checked === true)}
                  className="mt-0.5"
                />
                <label
                  htmlFor="unsold-confirm"
                  className="text-xs md:text-sm font-medium leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  I have reviewed the unsold inventory items ({itemsToRemit.length} items, {totalRemitQuantity} units)
                </label>
              </div>
            </TabsContent>

            {/* Sold Orders Tab */}
            <TabsContent value="sold" className="flex-1 overflow-y-auto px-4 md:px-6 space-y-3 md:space-y-4 mt-2">
              {loadingOrders ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : todayOrders.length > 0 ? (
                <>
                  <Card>
                    <CardContent className="p-3 md:p-4">
                      <div className="grid grid-cols-2 gap-2 md:gap-4 text-center">
                        <div>
                          <div className="text-lg md:text-2xl font-bold text-green-600">
                            {todayOrders.length}
                          </div>
                          <div className="text-[10px] md:text-xs text-muted-foreground">Orders</div>
                        </div>
                        <div>
                          <div className="text-lg md:text-2xl font-bold text-green-600">
                            ₱{todayOrders.reduce((sum, o) => sum + o.totalAmount, 0).toLocaleString()}
                          </div>
                          <div className="text-[10px] md:text-xs text-muted-foreground">Revenue</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Mobile Card Layout */}
                  <div className="md:hidden space-y-2">
                    {todayOrders.map((order) => (
                      <Card key={order.id} className="border">
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start mb-2 pb-2 border-b">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-muted-foreground">Order #</div>
                              <div className="font-mono text-xs font-semibold truncate">{order.orderNumber}</div>
                            </div>
                            <div className="text-right ml-2">
                              <div className="text-xs text-muted-foreground">Amount</div>
                              <div className="font-bold text-sm text-green-600">₱{order.totalAmount.toFixed(2)}</div>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center gap-2">
                              <div className="text-xs text-muted-foreground">Client</div>
                              <div className="text-sm font-medium truncate">{order.clientName}</div>
                            </div>
                            <div className="flex justify-between items-center gap-2">
                              <div className="text-xs text-muted-foreground">Brand</div>
                              <div className="text-xs truncate">{order.brands}</div>
                            </div>
                            <div className="flex justify-between items-center gap-2">
                              <div className="text-xs text-muted-foreground">Quantity</div>
                              <div className="text-sm font-semibold">{order.totalQuantity}</div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full mt-3 h-8 text-xs"
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowOrderDetailsModal(true);
                            }}
                          >
                            View Details
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Desktop Table Layout */}
                  <div className="hidden md:block border rounded-lg overflow-hidden">
                    <div className="max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background">
                          <TableRow>
                            <TableHead>Order#</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Brand</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-center w-24">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {todayOrders.map((order) => (
                            <TableRow key={order.id}>
                              <TableCell className="font-mono text-sm">{order.orderNumber}</TableCell>
                              <TableCell>{order.clientName}</TableCell>
                              <TableCell className="text-sm">{order.brands}</TableCell>
                              <TableCell className="text-right font-semibold">{order.totalQuantity}</TableCell>
                              <TableCell className="text-right font-semibold text-green-600">
                                ₱{order.totalAmount.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setShowOrderDetailsModal(true);
                                  }}
                                >
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No orders sold today</p>
                </div>
              )}

              {/* Confirmation Checkbox */}
              <div className="flex items-start space-x-2 p-3 md:p-4 bg-muted/30 rounded-lg border">
                <Checkbox
                  id="sold-confirm"
                  checked={soldConfirmed}
                  onCheckedChange={(checked) => setSoldConfirmed(checked === true)}
                  className="mt-0.5"
                />
                <label
                  htmlFor="sold-confirm"
                  className="text-xs md:text-sm font-medium leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  I have reviewed today's sold orders ({todayOrders.length} orders)
                </label>
              </div>
            </TabsContent>

            {/* Signature Tab */}
            <TabsContent value="signature" className="flex-1 overflow-y-auto px-4 md:px-6 space-y-3 md:space-y-4 mt-2">
              <div className="space-y-3 md:space-y-4">
                {signatureDataUrl ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm md:text-base">Your Signature</h3>
                      <Button variant="ghost" size="sm" onClick={() => setShowSignatureModal(true)} className="text-xs md:text-sm h-8 md:h-9">
                        Change
                      </Button>
                    </div>
                    <div className="border rounded-md p-3 md:p-4 bg-gray-50">
                      <img src={signatureDataUrl} alt="Signature" className="max-h-24 md:max-h-32 mx-auto" />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileSignature className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 md:mb-4 text-muted-foreground" />
                    <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">Signature required to confirm remittance</p>
                    <Button onClick={() => setShowSignatureModal(true)} size="sm" className="md:text-sm">
                      Add Signature
                    </Button>
                  </div>
                )}

                {/* Confirmation Checkbox */}
                {signatureDataUrl && (
                  <div className="flex items-start space-x-2 p-3 md:p-4 bg-muted/30 rounded-lg border">
                    <Checkbox
                      id="signature-confirm"
                      checked={signatureConfirmed}
                      onCheckedChange={(checked) => setSignatureConfirmed(checked === true)}
                      className="mt-0.5"
                    />
                    <label
                      htmlFor="signature-confirm"
                      className="text-xs md:text-sm font-medium leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      I confirm this is my signature and I authorize this remittance
                    </label>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Summary Tab */}
            <TabsContent value="summary" className="flex-1 overflow-y-auto px-3 md:px-6 space-y-2.5 md:space-y-4 mt-2">
              {/* Validation Warning */}
              {(!unsoldConfirmed || !soldConfirmed || !signatureConfirmed) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 md:p-4">
                  <p className="text-[11px] md:text-sm text-yellow-800 font-semibold mb-1.5">
                    ⚠️ Review all sections
                  </p>
                  <ul className="text-[10px] md:text-sm text-yellow-700 space-y-0.5 ml-3">
                    {!unsoldConfirmed && <li>• Confirm unsold inventory</li>}
                    {!soldConfirmed && <li>• Confirm sold orders</li>}
                    {!signatureConfirmed && <li>• Add signature</li>}
                  </ul>
                </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 md:gap-4">
                {/* Unsold Inventory Summary */}
                <Card className={unsoldConfirmed ? 'border-green-200 bg-green-50' : 'border-gray-200'}>
                  <CardHeader className="pb-1.5 px-3 pt-3 md:pb-3 md:px-6 md:pt-6">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Package className="h-3.5 w-3.5 md:h-5 md:w-5 flex-shrink-0" />
                        <h3 className="font-semibold text-[11px] md:text-base truncate">Unsold</h3>
                      </div>
                      {unsoldConfirmed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 md:h-5 md:w-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <div className="h-3.5 w-3.5 md:h-5 md:w-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 pb-3 md:px-6 md:pb-6">
                    <div className="space-y-1 md:space-y-2">
                      <div className="flex justify-between gap-2 text-[10px] md:text-sm">
                        <span className="text-muted-foreground">Items:</span>
                        <span className="font-semibold">{itemsToRemit.length}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-[10px] md:text-sm">
                        <span className="text-muted-foreground">Units:</span>
                        <span className="font-semibold">{totalRemitQuantity}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-[10px] md:text-sm">
                        <span className="text-muted-foreground">Value:</span>
                        <span className="font-semibold truncate">
                          ₱{itemsToRemit.reduce((sum, item) => sum + (item.quantity * item.price), 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Sold Orders Summary */}
                <Card className={soldConfirmed ? 'border-green-200 bg-green-50' : 'border-gray-200'}>
                  <CardHeader className="pb-1.5 px-3 pt-3 md:pb-3 md:px-6 md:pt-6">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <ShoppingCart className="h-3.5 w-3.5 md:h-5 md:w-5 flex-shrink-0" />
                        <h3 className="font-semibold text-[11px] md:text-base truncate">Sold</h3>
                      </div>
                      {soldConfirmed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 md:h-5 md:w-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <div className="h-3.5 w-3.5 md:h-5 md:w-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 pb-3 md:px-6 md:pb-6">
                    <div className="space-y-1 md:space-y-2">
                      <div className="flex justify-between gap-2 text-[10px] md:text-sm">
                        <span className="text-muted-foreground">Orders:</span>
                        <span className="font-semibold">{todayOrders.length}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-[10px] md:text-sm">
                        <span className="text-muted-foreground">Sold:</span>
                        <span className="font-semibold">{todayOrders.reduce((sum, o) => sum + o.totalQuantity, 0)}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-[10px] md:text-sm">
                        <span className="text-muted-foreground">Revenue:</span>
                        <span className="font-semibold truncate">
                          ₱{todayOrders.reduce((sum, o) => sum + o.totalAmount, 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Signature Summary */}
                <Card className={signatureConfirmed ? 'border-green-200 bg-green-50' : 'border-gray-200'}>
                  <CardHeader className="pb-1.5 px-3 pt-3 md:pb-3 md:px-6 md:pt-6">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <FileSignature className="h-3.5 w-3.5 md:h-5 md:w-5 flex-shrink-0" />
                        <h3 className="font-semibold text-[11px] md:text-base truncate">Signature</h3>
                      </div>
                      {signatureConfirmed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 md:h-5 md:w-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <div className="h-3.5 w-3.5 md:h-5 md:w-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 pb-3 md:px-6 md:pb-6">
                    {signatureDataUrl ? (
                      <div className="border rounded p-1.5 md:p-2 bg-white flex items-center justify-center">
                        <img src={signatureDataUrl} alt="Signature" className="max-h-12 md:max-h-20 max-w-full object-contain" />
                      </div>
                    ) : (
                      <div className="text-center text-[10px] md:text-sm text-muted-foreground py-2 md:py-4">
                        No signature
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Remittance Details */}
              <Card>
                <CardHeader className="pb-1.5 px-3 pt-3 md:pb-3 md:px-6 md:pt-6">
                  <h3 className="font-semibold text-[11px] md:text-base">Details</h3>
                </CardHeader>
                <CardContent className="space-y-2 md:space-y-4 px-3 pb-3 md:px-6 md:pb-6">
                  <div className="grid grid-cols-2 gap-2 md:gap-4 text-[10px] md:text-sm">
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-[9px] md:text-xs">To:</p>
                      <p className="font-semibold truncate">{leaderName || 'Unknown'}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-[9px] md:text-xs">Date:</p>
                      <p className="font-semibold truncate">{format(new Date(), 'MMM dd, yyyy')}</p>
                    </div>
                  </div>

                  <div className="border-t pt-2 md:pt-4">
                    <h4 className="font-semibold mb-1.5 text-[10px] md:text-sm">What happens:</h4>
                    <ul className="text-[9px] md:text-sm space-y-0.5 text-muted-foreground leading-tight">
                      <li>✓ Unsold inventory cleared</li>
                      <li>✓ Orders marked remitted</li>
                      <li>✓ Signature saved</li>
                      <li>✓ Record created</li>
                      <li>✓ Leader notified</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Final Confirmation */}
              {unsoldConfirmed && soldConfirmed && signatureConfirmed ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 md:p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 md:h-5 md:w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] md:text-sm font-semibold text-green-800">
                        Ready to submit
                      </p>
                      <p className="text-[9px] md:text-sm text-green-700 mt-0.5">
                        Click "Confirm Remit" below.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 md:p-4">
                  <div className="flex items-start gap-2">
                    <div className="h-3.5 w-3.5 md:h-5 md:w-5 rounded-full border-2 border-red-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] md:text-sm font-semibold text-red-800">
                        Cannot submit yet
                      </p>
                      <p className="text-[9px] md:text-sm text-red-700 mt-0.5">
                        Review all sections first.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0 px-4 pb-4 pt-3 md:px-6 md:pb-6 border-t">
            <Button
              variant="outline"
              onClick={() => setRemitDialogOpen(false)}
              disabled={remitting}
              className="w-full sm:w-auto h-10 md:h-9 text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRemitInventory}
              disabled={
                remitting ||
                (!hasItemsToRemit && todayOrders.length === 0) ||
                !leaderId ||
                !signatureDataUrl ||
                !unsoldConfirmed ||
                !soldConfirmed ||
                !signatureConfirmed
              }
              variant="default"
              className="w-full sm:w-auto h-10 md:h-9 text-sm"
            >
              {remitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Remitting...
                </>
              ) : (
                'Confirm Remit'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature Modal */}
      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent className="w-[95vw] max-w-2xl p-4 md:p-6">
          <DialogHeader>
            <DialogTitle className="text-base md:text-lg">Sign Remittance</DialogTitle>
            <DialogDescription className="text-xs md:text-sm">
              Please sign below to confirm this remittance
            </DialogDescription>
          </DialogHeader>
          <SignatureCanvas
            onSave={(dataUrl) => {
              setSignatureDataUrl(dataUrl);
              setShowSignatureModal(false);
              toast({
                title: 'Signature Saved',
                description: 'Your signature has been captured',
              });
            }}
            onCancel={() => setShowSignatureModal(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Order Details Modal */}
      <Dialog open={showOrderDetailsModal} onOpenChange={setShowOrderDetailsModal}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-4 pt-6 pb-4 md:px-6 border-b">
            <DialogTitle className="text-base md:text-lg">Order Details</DialogTitle>
            {selectedOrder && (
              <DialogDescription className="text-xs md:text-sm">
                {selectedOrder.orderNumber} • {selectedOrder.clientName}
              </DialogDescription>
            )}
          </DialogHeader>

          {selectedOrder && (
            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">
              {/* Order Summary */}
              <Card>
                <CardContent className="p-3 md:p-4">
                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Order Number</div>
                      <div className="font-mono text-sm font-semibold">{selectedOrder.orderNumber}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Client</div>
                      <div className="text-sm font-medium">{selectedOrder.clientName}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Total Amount</div>
                      <div className="text-base font-bold text-green-600">₱{selectedOrder.totalAmount.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Total Quantity</div>
                      <div className="text-base font-bold">{selectedOrder.totalQuantity}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Order Items */}
              <div>
                <h3 className="text-sm font-semibold mb-2 px-1">Order Items ({selectedOrder.items.length})</h3>

                {/* Mobile Card Layout */}
                <div className="md:hidden space-y-2">
                  {selectedOrder.items.map((item: any, index: number) => (
                    <Card key={index} className="border">
                      <CardContent className="p-3">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-muted-foreground">Product</div>
                              <div className="font-medium text-sm truncate">{item.variantName}</div>
                            </div>
                            <Badge variant="secondary" className="ml-2 text-xs flex-shrink-0">{item.brandName}</Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                            <div>
                              <div className="text-[10px] text-muted-foreground">Quantity</div>
                              <div className="font-semibold text-sm">{item.quantity}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground">Price</div>
                              <div className="font-semibold text-sm">₱{item.price.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted-foreground">Amount</div>
                              <div className="font-semibold text-sm text-green-600">₱{item.amount.toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Desktop Table Layout */}
                <div className="hidden md:block border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Brand</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items.map((item: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Badge variant="secondary">{item.brandName}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{item.variantName}</TableCell>
                          <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                          <TableCell className="text-right">₱{item.price.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-semibold text-green-600">₱{item.amount.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="px-4 pb-4 pt-3 md:px-6 border-t">
            <Button
              variant="outline"
              onClick={() => setShowOrderDetailsModal(false)}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
