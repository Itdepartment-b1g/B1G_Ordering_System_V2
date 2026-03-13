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
import { Search, Package, ChevronDown, ChevronRight, ArrowLeft, FileSignature, ShoppingCart, Loader2, CheckCircle2, ClipboardCheck, PackageMinus, Info } from 'lucide-react';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format } from 'date-fns';
import { useAgentInventory } from './hooks';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { ReturnInventoryDialog } from './components/ReturnInventoryDialog';
import { ReturnToMainDialog } from './components/ReturnToMainDialog';
import MyReturnRequestsSection from './components/MyReturnRequestsSection';
import type { RemittanceOrder, BankOrderNote } from './types';

const LOW_STOCK_THRESHOLD = 10;
const isLowStock = (stock: number) => stock <= LOW_STOCK_THRESHOLD;

// Sold tab (End of Day Cash Remittance): only show orders on or after this date. Orders before are v1 imports.
const SOLD_TAB_ORDER_DATE_THRESHOLD = '2026-02-17';

// Helper function to get variant type colors
const getVariantTypeColor = (type: string) => {
  const typeLower = type.toLowerCase();
  switch (typeLower) {
    case 'flavor':
      return { bg: 'bg-blue-100', text: 'text-blue-700', header: 'text-blue-600', headerBg: 'bg-blue-50/50' };
    case 'battery':
      return { bg: 'bg-green-100', text: 'text-green-700', header: 'text-green-600', headerBg: 'bg-green-50/50' };
    case 'posm':
      return { bg: 'bg-purple-100', text: 'text-purple-700', header: 'text-purple-600', headerBg: 'bg-purple-50/50' };
    case 'foc':
      return { bg: 'bg-orange-100', text: 'text-orange-700', header: 'text-orange-600', headerBg: 'bg-orange-50/50' };
    case 'ncv':
      return { bg: 'bg-pink-100', text: 'text-pink-700', header: 'text-pink-600', headerBg: 'bg-pink-50/50' };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-700', header: 'text-gray-600', headerBg: 'bg-gray-50/50' };
  }
};

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
  const [leaderRole, setLeaderRole] = useState<string | null>(null);

  // New state for orders and signature
  const [todayCashOrders, setTodayCashOrders] = useState<RemittanceOrder[]>([]);
  const [todayBankOrders, setTodayBankOrders] = useState<RemittanceOrder[]>([]);
  const [bankOrderNotes, setBankOrderNotes] = useState<Map<string, string>>(new Map());
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<RemittanceOrder | null>(null);
  const [showOrderDetailsModal, setShowOrderDetailsModal] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnToMainDialogOpen, setReturnToMainDialogOpen] = useState(false);

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

  const getTotalStock = (brand: any) => {
    return (brand.allVariants || []).reduce((sum: number, v: any) => sum + v.stock, 0);
  };

  // Create a deep copy of brands with filtering applied at the variant level
  // Only include brands that end up having at least one item with stock > 0
  const activeBrands = agentBrands
    .map(brand => {
      const allVariantsWithStock = (brand.allVariants || []).filter((v: any) => v.stock > 0);
      const variantsByTypeWithStock = new Map<string, any[]>();

      // Rebuild variantsByType with only items that have stock > 0
      if (brand.variantsByType) {
        brand.variantsByType.forEach((variants, type) => {
          const filtered = variants.filter((v: any) => v.stock > 0);
          if (filtered.length > 0) {
            variantsByTypeWithStock.set(type, filtered);
          }
        });
      }

      return {
        ...brand,
        allVariants: allVariantsWithStock,
        variantsByType: variantsByTypeWithStock,
        flavors: brand.flavors.filter((f: any) => f.stock > 0),
        batteries: brand.batteries.filter((b: any) => b.stock > 0),
        posms: (brand.posms || []).filter((p: any) => p.stock > 0)
      };
    })
    .filter(brand => brand.allVariants.length > 0);

  const filteredBrands = activeBrands.filter(brand => {
    const matchesSearch =
      brand.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (brand.allVariants || []).some(v => v.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesSearch;
  });

  const getTotalVariants = () => {
    let count = 0;
    activeBrands.forEach(brand => {
      count += (brand.allVariants || []).length;
    });
    return count;
  };

  const getLowStockCount = () => {
    let count = 0;
    activeBrands.forEach(brand => {
      count += (brand.allVariants || []).filter((v: any) => v.status === 'low' || isLowStock(v.stock)).length;
    });
    return count;
  };

  // Get items with stock > 0 to remit
  const getItemsToRemit = () => {
    const items: Array<{
      variantId: string;
      variantName: string;
      brandName: string;
      variantType: string;
      quantity: number;
      price: number;
      dspPrice?: number;
      rspPrice?: number;
    }> = [];

    agentBrands.forEach(brand => {
      (brand.allVariants || []).forEach(variant => {
        const stock = typeof variant.stock === 'number' ? variant.stock : Number(variant.stock) || 0;
        if (stock > 0) {
          items.push({
            variantId: variant.id,
            variantName: variant.name,
            brandName: brand.name,
            variantType: variant.variantType || 'flavor',
            quantity: stock,
            price: variant.price,
            dspPrice: variant.dspPrice,
            rspPrice: variant.rspPrice
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
        // First, get the leader_id from leader_teams
        const { data: teamData, error: teamError } = await supabase
          .from('leader_teams')
          .select('leader_id')
          .eq('agent_id', user.id)
          .maybeSingle();

        if (teamError && teamError.code !== 'PGRST116') { // PGRST116 is "not found"
          console.error('Error fetching leader team:', teamError);
          return;
        }

        if (!teamData || !teamData.leader_id) {
          // Agent is not assigned to any leader
          setLeaderId(null);
          setLeaderName(null);
          setLeaderRole(null);
          return;
        }

        // Then, fetch the leader's profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .eq('id', teamData.leader_id)
          .single();

        if (profileError) {
          console.error('Error fetching leader profile:', profileError);
          return;
        }

        if (profileData) {
          setLeaderId(profileData.id);
          setLeaderName(profileData.full_name || null);
          setLeaderRole(profileData.role || null);
        }
      } catch (error) {
        console.error('Error fetching leader:', error);
      }
    };

    fetchLeader();

    console.log('🎧 MyInventoryPage: Setting up real-time subscriptions');

    // Debounce timer for real-time updates
    let orderDebounceTimer: NodeJS.Timeout | null = null;

    const debouncedOrderRefresh = () => {
      if (orderDebounceTimer) clearTimeout(orderDebounceTimer);
      orderDebounceTimer = setTimeout(() => {
        console.log('🔄 Real-time: Refreshing orders...');
        if (remitDialogOpen && user?.id) {
          fetchUnremittedOrders();
        }
      }, 300);
    };

    // Real-time subscription for client_orders only
    // (agent_inventory is already handled by AgentInventoryContext)
    const ordersChannel = subscribeToTable(
      'client_orders',
      (payload) => {
        console.log('🔔 Real-time: Order change detected:', payload.eventType, payload);
        debouncedOrderRefresh();
      },
      '*',
      { column: 'agent_id', value: user.id }
    );

    return () => {
      if (orderDebounceTimer) clearTimeout(orderDebounceTimer);
      unsubscribe(ordersChannel);
      console.log('🔌 MyInventoryPage: Cleaned up subscriptions');
    };
  }, [user?.id, remitDialogOpen]);

  // Fetch unremitted orders on mount to check if button should be enabled
  useEffect(() => {
    if (user?.id) {
      fetchUnremittedOrders();
    }
  }, [user?.id]);

  // Reset confirmations when dialog opens
  useEffect(() => {
    if (remitDialogOpen && user?.id) {
      // Reset confirmations
      setUnsoldConfirmed(false);
      setSoldConfirmed(false);
      setSignatureConfirmed(false);
    }
  }, [remitDialogOpen, user?.id]);

  // Auto-confirm sold orders if there are none (optional section)
  useEffect(() => {
    if (todayCashOrders.length === 0 && todayBankOrders.length === 0) {
      setSoldConfirmed(true);
    }
  }, [todayCashOrders.length, todayBankOrders.length]);

  // Fetch all unremitted orders (CASH + BANK_TRANSFER/GCASH)
  // CASH orders require physical cash remittance
  // Bank transfer orders just need acknowledgment with notes
  const fetchUnremittedOrders = async () => {
    if (!user?.id) return;

    setLoadingOrders(true);
    try {
      // Fetch ALL unremitted orders regardless of creation date
      // Exclude orders with verified cash deposits (approved deposits)
      const { data, error } = await supabase
        .from('client_orders')
        .select(`
          id,
          order_number,
          order_date,
          total_amount,
          status,
          payment_method,
          bank_type,
          payment_mode,
          payment_splits,
          agent_remittance_notes,
          created_at,
          deposit_id,
          clients(name),
          items:client_order_items(
              quantity,
              unit_price,
              variant:variants(
                name,
                brand:brands(name)
            )
          ),
          cash_deposit:cash_deposits!client_orders_deposit_id_fkey(
            id,
            status
          )
        `)
        .eq('agent_id', user.id)
        .eq('remitted', false)  // Only non-remitted orders
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter out orders with verified cash deposits (approved deposits should not appear in remittance)
      // Also exclude v1 imports: order_date before threshold (sold tab only shows orders from 2026-02-17 onward)
      const unremittedOrders = (data || []).filter((order: any) => {
        if (order.deposit_id && order.cash_deposit) {
          if (order.cash_deposit.status === 'verified') return false;
        }
        const orderDate = order.order_date ?? null;
        if (!orderDate || orderDate < SOLD_TAB_ORDER_DATE_THRESHOLD) return false;
        return true;
      });

      // Format and split orders by payment type
      const cashOrders: RemittanceOrder[] = [];
      const bankOrders: RemittanceOrder[] = [];

      unremittedOrders.forEach((order: any) => {
        const paymentMode = order.payment_mode as 'FULL' | 'SPLIT' | null;
        const paymentMethod = order.payment_method as 'CASH' | 'GCASH' | 'BANK_TRANSFER' | 'CHEQUE' | null;
        const splits = Array.isArray(order.payment_splits) ? order.payment_splits : [];

        let cashPortion = 0;
        let chequePortion = 0;
        let nonCashPortion = 0;
        const nonCashLabels: string[] = [];

        if (paymentMode === 'SPLIT') {
          splits.forEach((s: any) => {
            const amount = s.amount || 0;
            if (s.method === 'CASH') {
              cashPortion += amount;
            } else if (s.method === 'CHEQUE') {
              chequePortion += amount;
            } else if (s.method === 'BANK_TRANSFER' || s.method === 'GCASH') {
              nonCashPortion += amount;
              // Build human-readable label for non-cash methods
              if (s.method === 'BANK_TRANSFER') {
                if (s.bank && !nonCashLabels.includes(s.bank)) {
                  nonCashLabels.push(s.bank);
                } else if (!s.bank && !nonCashLabels.includes('Bank Transfer')) {
                  nonCashLabels.push('Bank Transfer');
                }
              } else if (s.method === 'GCASH' && !nonCashLabels.includes('GCash')) {
                nonCashLabels.push('GCash');
              }
            }
          });
        } else if (paymentMethod === 'CASH' || paymentMethod === 'CHEQUE') {
          const amt = order.total_amount || 0;
          if (paymentMethod === 'CASH') {
            cashPortion = amt;
          } else {
            chequePortion = amt;
          }
        }

        const remittanceAmount = cashPortion + chequePortion;

        const items = (order.items || []).map((item: any) => ({
          variantName: item.variant?.name || 'Unknown',
          brandName: item.variant?.brand?.name || 'Unknown',
          quantity: item.quantity,
          unitPrice: item.unit_price || 0
        }));

        const formattedOrder: RemittanceOrder = {
          id: order.id,
          orderNumber: order.order_number,
          clientName: order.clients?.name || 'Unknown',
          totalAmount: remittanceAmount || order.total_amount,
          paymentMethod: order.payment_method,
          bankType: order.bank_type,
          items,
          createdAt: order.created_at,
          agentNotes: order.agent_remittance_notes,
          paymentMode,
          cashPortion,
          chequePortion,
          fullOrderTotal: order.total_amount,
          nonCashPortion: nonCashPortion > 0 ? nonCashPortion : undefined,
          nonCashLabel: nonCashLabels.length > 0 ? nonCashLabels.join(' + ') : undefined
        };

        // For agent-side remittance list:
        // - Include any order where CASH or CHEQUE has a portion (full or split)
        // - Bank transfer / GCash-only orders remain in bankOrders for notes
        if (cashPortion > 0 || chequePortion > 0) {
          cashOrders.push(formattedOrder);
        } else if (order.payment_method === 'BANK_TRANSFER' || order.payment_method === 'GCASH') {
          bankOrders.push(formattedOrder);
        }
      });

      setTodayCashOrders(cashOrders);
      setTodayBankOrders(bankOrders);
    } catch (error: any) {
      console.error('Error fetching unremitted orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to load unremitted orders',
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
      // Convert base64 data URI to blob without using fetch (to avoid CSP violation)
      let blob: Blob;

      if (signatureDataUrl.startsWith('data:')) {
        // Extract base64 data from data URI
        const base64Data = signatureDataUrl.split(',')[1];
        if (!base64Data) {
          throw new Error('Invalid data URI format');
        }

        // Convert base64 to binary string
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Create blob from bytes
        blob = new Blob([bytes], { type: 'image/png' });
      } else {
        // Fallback: if it's already a URL, try to fetch (but this shouldn't happen)
        const response = await fetch(signatureDataUrl);
        blob = await response.blob();
      }

      // Create folder structure: date_folder/user_name_folder/signature.png
      const today = new Date();
      const dateFolder = format(today, 'yyyy-MM-dd'); // Format: 2025-01-15

      // Sanitize user name for folder name (replace spaces and special chars with hyphens)
      const userName = user.full_name || 'unknown-user';
      const sanitizedUserName = userName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens

      const timestamp = new Date().getTime();
      const filename = `${dateFolder}/${sanitizedUserName}/${timestamp}.png`;

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

    // Validation: Ensure all required confirmations are in place
    if (!unsoldConfirmed) {
      toast({
        title: 'Please Confirm',
        description: 'Please confirm the unsold inventory tab to proceed',
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

      // Get unique order IDs from both cash and bank orders
      const cashOrderIds = todayCashOrders.map(order => order.id);
      const bankOrderIds = todayBankOrders.map(order => order.id);
      const allOrderIds = [...cashOrderIds, ...bankOrderIds];

      // Prepare bank order notes in the format expected by the function
      const bankNotes: BankOrderNote[] = Array.from(bankOrderNotes.entries())
        .filter(([orderId, notes]) => notes.trim())
        .map(([orderId, notes]) => ({
          order_id: orderId,
          notes: notes.trim()
        }));

      // Call remit function with orders, bank notes, and signature
      const { data, error } = await supabase.rpc('remit_inventory_to_leader', {
        p_agent_id: user.id,
        p_leader_id: leaderId,
        p_performed_by: user.id,
        p_order_ids: allOrderIds,
        p_signature_url: signatureData.url,
        p_signature_path: signatureData.path,
        p_bank_order_notes: bankNotes
      });

      if (error) {
        console.error('Backend RPC error:', error);
        throw error;
      }

      if (data && !data.success) {
        throw new Error(data.message || 'Failed to remit inventory');
      }

      // Build summary message
      const cashTotal = todayCashOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      const bankTotal = todayBankOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      const totalOrders = todayCashOrders.length + todayBankOrders.length;

      let description = '';
      if (todayCashOrders.length > 0 && todayBankOrders.length > 0) {
        description = `Remittance complete! ${todayCashOrders.length} cash/cheque order(s) (₱${cashTotal.toLocaleString()}) and ${todayBankOrders.length} bank order(s) (₱${bankTotal.toLocaleString()}) processed.`;
      } else if (todayCashOrders.length > 0) {
        description = `Remittance successful! ₱${cashTotal.toLocaleString()} from ${todayCashOrders.length} cash/cheque order(s) submitted to ${leaderName || 'your leader'}.`;
      } else if (todayBankOrders.length > 0) {
        description = `${todayBankOrders.length} bank transfer order(s) acknowledged (₱${bankTotal.toLocaleString()}).`;
      } else {
        description = 'End of day process complete. Your inventory carries over to tomorrow.';
      }

      toast({
        title: 'Remittance Complete!',
        description
      });

      setRemitDialogOpen(false);
      setSignatureDataUrl(null);
      setTodayCashOrders([]);
      setTodayBankOrders([]);
      setBankOrderNotes(new Map());

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
  // Agent can remit with just orders (no unsold inventory required)
  // They just need to be assigned to a leader
  const canRemit = !!leaderId;

  return (
    <div className="w-full p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your stock and remittance</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {user?.role !== 'team_leader' && (
            <Button
              onClick={() => setRemitDialogOpen(true)}
              variant="default"
              className="gap-2 flex-1 sm:flex-initial"
              disabled={!canRemit}
            >
              <ClipboardCheck className="h-4 w-4" />
              Remit
            </Button>
          )}
          {user?.role === 'team_leader' ? (
            <Button
              onClick={() => setReturnToMainDialogOpen(true)}
              variant="outline"
              className="gap-2 flex-1 sm:flex-initial"
            >
              <PackageMinus className="h-4 w-4" />
              Return to Main
            </Button>
          ) : (
            <Button
              onClick={() => setReturnDialogOpen(true)}
              variant="outline"
              className="gap-2 flex-1 sm:flex-initial"
              disabled={!leaderId}
            >
              <PackageMinus className="h-4 w-4" />
              Return
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Brands</div>
            <div className="text-2xl font-bold mt-1">{activeBrands.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Items</div>
            <div className="text-2xl font-bold mt-1">{getTotalVariants()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Low Stock</div>
            <div className={`text-2xl font-bold mt-1 ${getLowStockCount() > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
              {getLowStockCount() > 0 ? getLowStockCount() : '0'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inventory List */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="font-semibold">Inventory</h2>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile List */}
          <div className="md:hidden space-y-2">
            {filteredBrands.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>{searchQuery ? 'No results found' : 'No inventory'}</p>
              </div>
            ) : (
              filteredBrands.map((brand) => (
                <Card key={brand.id}>
                  <div className="p-3">
                    {/* Brand Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{brand.name}</h3>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {brand.flavors.length + brand.batteries.length + (brand.posms || []).length} items
                        </div>
                      </div>
                      <div className="text-right ml-3">
                        {(() => {
                          const total = getTotalStock(brand);
                          const hasLow = brand.flavors.some((f: any) => f.status === 'low' || isLowStock(f.stock)) || brand.batteries.some((b: any) => b.status === 'low' || isLowStock(b.stock)) || (brand.posms || []).some((p: any) => p.status === 'low' || isLowStock(p.stock));
                          return (
                            <>
                              <div className={`text-xl font-bold ${hasLow && total > 0 ? 'text-amber-600' : ''}`}>{total}</div>
                              {total === 0 ? <div className="text-xs text-red-600">Out</div> : hasLow ? <div className="text-xs text-yellow-600">Low</div> : <div className="text-xs text-green-600">OK</div>}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    {/* Details */}
                    {expandedBrands.includes(brand.id) && (
                      <div className="space-y-2 pt-2 border-t mt-2">
                        {brand.variantsByType && Array.from(brand.variantsByType.entries()).map(([type, variants]) => (
                          <div key={type}>
                            <div className="text-xs font-semibold text-muted-foreground mb-1 capitalize">
                              {type === 'posm' ? 'POSM' : type === 'foc' ? 'FOC' : type === 'ncv' ? 'NCV' : `${type}s`}
                            </div>
                            <div className="space-y-1">
                              {variants.map((v: any) => (
                                <div key={v.id} className="flex items-center justify-between text-sm py-1">
                                  <span className="truncate">{v.name}</span>
                                  <div className="text-right ml-2 flex-shrink-0">
                                    <span className={`font-semibold ${isLowStock(v.stock) ? 'text-amber-600' : ''}`}>{v.stock}</span>
                                    <span className="text-xs text-muted-foreground ml-1">₱{v.price.toFixed(2)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Toggle Button */}
                    <button
                      onClick={() => toggleBrandExpand(brand.id)}
                      className="w-full mt-2 pt-2 border-t text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {expandedBrands.includes(brand.id) ? 'Hide' : 'Show'} Details
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Desktop/Tablet: table */}
          <div className="hidden md:block w-full overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Variants</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">DSP</TableHead>
                  <TableHead className="text-right">RSP</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBrands.map((brand) => (
                  <React.Fragment key={brand.id}>
                    {/* Brand Row */}
                    <TableRow className={`hover:bg-muted/50 ${(() => {
                      const total = getTotalStock(brand);
                      const hasLow = brand.flavors.some((f: any) => isLowStock(f.stock)) || brand.batteries.some((b: any) => isLowStock(b.stock)) || (brand.posms || []).some((p: any) => isLowStock(p.stock));
                      return hasLow && total > 0 ? 'bg-amber-50/60' : 'bg-primary/5';
                    })()}`}>
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
                      <TableCell className="text-right text-muted-foreground cursor-pointer" onClick={() => toggleBrandExpand(brand.id)}>
                        <span className="text-xs">
                          {brand.variantsByType && Array.from(brand.variantsByType.entries()).map(([type, variants], idx) => {
                            const prefix = idx > 0 ? ' • ' : '';
                            const typeName = type === 'posm' ? 'POSM' : type === 'foc' ? 'FOC' : type === 'ncv' ? 'NCV' : type.charAt(0).toUpperCase() + type.slice(1);
                            const plural = variants.length !== 1 && type !== 'posm' && type !== 'foc' && type !== 'ncv' ? 's' : '';
                            return `${prefix}${variants.length} ${typeName}${plural}`;
                          }).join('')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right cursor-pointer" onClick={() => toggleBrandExpand(brand.id)}>
                        <span className={(() => {
                          const total = getTotalStock(brand);
                          const hasLow = (brand.allVariants || []).some((v: any) => isLowStock(v.stock));
                          return hasLow && total > 0 ? 'font-semibold text-amber-600' : 'font-semibold';
                        })()}>
                          {getTotalStock(brand)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">-</TableCell>
                      <TableCell className="text-right text-muted-foreground">-</TableCell>
                      <TableCell className="text-right text-muted-foreground">-</TableCell>
                      <TableCell className="text-right">
                        {(() => {
                          const total = getTotalStock(brand);
                          const hasLow = (brand.allVariants || []).some((v: any) => v.status === 'low' || isLowStock(v.stock));
                          const pillClass = total === 0 ? 'bg-red-100 text-red-700' : hasLow ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';
                          const label = total === 0 ? 'Out of Stock' : hasLow ? 'Low stock' : 'In Stock';
                          return <span className={`px-2 py-1 rounded-full text-xs font-medium ${pillClass}`}>{label}</span>;
                        })()}
                      </TableCell>
                    </TableRow>

                    {/* Dynamic Variant Type Sections */}
                    {expandedBrands.includes(brand.id) && brand.variantsByType && Array.from(brand.variantsByType.entries()).map(([type, variants]) => {
                      const colors = getVariantTypeColor(type);
                      const typeDisplay = type === 'posm' ? 'POSM' : type === 'foc' ? 'FOC' : type === 'ncv' ? 'NCV' : type.toUpperCase();

                      return (
                        <React.Fragment key={type}>
                          {/* Type Header */}
                          <TableRow className={colors.headerBg}>
                            <TableCell></TableCell>
                            <TableCell colSpan={8} className="pl-8 py-2">
                              <span className={`text-xs font-semibold ${colors.header}`}>{typeDisplay}</span>
                            </TableCell>
                          </TableRow>

                          {/* Variant Rows */}
                          {variants.map((variant: any) => (
                            <TableRow key={variant.id} className={`hover:bg-muted/20 ${isLowStock(variant.stock) && variant.stock > 0 ? 'bg-amber-50/80' : 'bg-muted/10'}`}>
                              <TableCell></TableCell>
                              <TableCell className="pl-12 text-sm font-medium">
                                <span className="text-muted-foreground">↳</span> {variant.name}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className={`${colors.bg} ${colors.text} capitalize`}>
                                  {type === 'posm' ? 'POSM' : type === 'foc' ? 'FOC' : type === 'ncv' ? 'NCV' : type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground text-xs">-</TableCell>
                              <TableCell className={`text-right font-semibold ${isLowStock(variant.stock) ? 'text-amber-600' : ''}`}>
                                {variant.stock}
                              </TableCell>
                              <TableCell className="text-right font-medium">₱{variant.price.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-muted-foreground text-sm">
                                {variant.dspPrice ? `₱${variant.dspPrice.toFixed(2)}` : '-'}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground text-sm">
                                {variant.rspPrice ? `₱${variant.rspPrice.toFixed(2)}` : '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant={
                                    variant.stock === 0 ? 'destructive' :
                                      isLowStock(variant.stock) ? 'secondary' : 'default'
                                  }
                                  className={`text-xs ${isLowStock(variant.stock) && variant.stock > 0 ? 'bg-amber-100 text-amber-700 border-amber-200' : ''}`}
                                >
                                  {variant.stock === 0 ? 'Out of stock' : isLowStock(variant.stock) ? 'Low stock' : variant.status === 'available' ? 'available' : variant.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* My Return Requests (mobile sales only) */}
      {user?.role !== 'team_leader' && <MyReturnRequestsSection />}

      {/* Remit Inventory Dialog */}
      <Dialog open={remitDialogOpen} onOpenChange={setRemitDialogOpen}>
        <DialogContent className="w-[95vw] max-w-4xl h-[90vh] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-4 pt-6 pb-4 md:px-6">
            <DialogTitle className="text-lg md:text-xl">End of Day Cash Remittance</DialogTitle>
            <DialogDescription className="text-sm">
              {leaderName
                ? `Submit cash proceeds to ${leaderName}${leaderRole === 'manager' ? ' (Manager)' : leaderRole === 'team_leader' ? ' (Team Leader)' : ''}. Unsold inventory stays with you.`
                : 'Submit cash proceeds to your leader/manager. Unsold inventory stays with you.'}
            </DialogDescription>
            {!leaderId && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ You are not assigned to a leader/manager. Please contact your administrator.
                </p>
              </div>
            )}
            {leaderId && todayCashOrders.length === 0 && todayBankOrders.length === 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  ℹ️ No unremitted orders. Click confirm to complete end-of-day process.
                </p>
              </div>
            )}
            {leaderId && (todayCashOrders.length > 0 || todayBankOrders.length > 0) && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  ✅ {todayCashOrders.length > 0 && `₱${todayCashOrders.reduce((sum, o) => sum + o.totalAmount, 0).toLocaleString()} in cash from ${todayCashOrders.length} order(s)`}
                  {todayCashOrders.length > 0 && todayBankOrders.length > 0 && ' + '}
                  {todayBankOrders.length > 0 && `${todayBankOrders.length} bank transfer order(s)`}
                </p>
              </div>
            )}
          </DialogHeader>

          <Tabs defaultValue="unsold" className="w-full flex-1 flex flex-col overflow-hidden">
            <div className="px-3 md:px-6 pt-2 pb-1">
              <TabsList className="grid w-full grid-cols-4 gap-1 h-auto p-1">
                <TabsTrigger value="unsold" className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 relative py-1.5 px-1 text-xs sm:text-sm min-w-0">
                  <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="text-[9px] sm:text-sm leading-tight truncate max-w-full">Current Stock</span>
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
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4 text-center">
                    <div>
                      <div className="text-lg md:text-2xl font-bold text-primary">{itemsToRemit.length}</div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">Items</div>
                    </div>
                    <div>
                      <div className="text-lg md:text-2xl font-bold text-primary">{totalRemitQuantity}</div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">Total Units</div>
                    </div>
                    <div>
                      <div className="text-base md:text-xl font-bold text-primary">
                        ₱{itemsToRemit.reduce((sum, item) => sum + (item.quantity * (item.price || 0)), 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">Price Value</div>
                    </div>
                    <div>
                      <div className="text-base md:text-xl font-bold text-blue-600">
                        ₱{itemsToRemit.reduce((sum, item) => sum + (item.quantity * (item.dspPrice || 0)), 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">DSP Value</div>
                    </div>
                    <div>
                      <div className="text-base md:text-xl font-bold text-green-600">
                        ₱{itemsToRemit.reduce((sum, item) => sum + (item.quantity * (item.rspPrice || 0)), 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">RSP Value</div>
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
                            <Badge
                              variant="secondary"
                              className={`ml-2 text-xs ${item.variantType === 'flavor' ? 'bg-blue-100 text-blue-700' :
                                item.variantType === 'battery' ? 'bg-green-100 text-green-700' :
                                  'bg-purple-100 text-purple-700'
                                }`}
                            >
                              {item.variantType === 'posm' ? 'POSM' : item.variantType.charAt(0).toUpperCase() + item.variantType.slice(1)}
                            </Badge>
                          </div>
                          <div className="pt-2 border-t space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="text-xs text-muted-foreground">Quantity</div>
                              <div className="font-semibold text-sm">{item.quantity}</div>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="text-xs text-muted-foreground">Price Value</div>
                              <div className="font-semibold text-sm">₱{(item.quantity * (item.price || 0)).toLocaleString()}</div>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="text-xs text-muted-foreground">DSP Value</div>
                              <div className="font-semibold text-sm text-blue-600">₱{(item.quantity * (item.dspPrice || 0)).toLocaleString()}</div>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="text-xs text-muted-foreground">RSP Value</div>
                              <div className="font-semibold text-sm text-green-600">₱{(item.quantity * (item.rspPrice || 0)).toLocaleString()}</div>
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
                            <TableHead className="text-right">Price Value</TableHead>
                            <TableHead className="text-right">DSP Value</TableHead>
                            <TableHead className="text-right">RSP Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itemsToRemit.map((item) => (
                            <TableRow key={item.variantId}>
                              <TableCell className="font-medium">{item.brandName}</TableCell>
                              <TableCell>{item.variantName}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className={
                                    item.variantType === 'flavor' ? 'bg-blue-100 text-blue-700' :
                                      item.variantType === 'battery' ? 'bg-green-100 text-green-700' :
                                        'bg-purple-100 text-purple-700'
                                  }
                                >
                                  {item.variantType === 'posm' ? 'POSM' : item.variantType.charAt(0).toUpperCase() + item.variantType.slice(1)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                              <TableCell className="text-right">₱{(item.quantity * (item.price || 0)).toLocaleString()}</TableCell>
                              <TableCell className="text-right text-blue-600">₱{(item.quantity * (item.dspPrice || 0)).toLocaleString()}</TableCell>
                              <TableCell className="text-right text-green-600">₱{(item.quantity * (item.rspPrice || 0)).toLocaleString()}</TableCell>
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
                  <p className="text-sm">No inventory on hand</p>
                  <p className="text-xs mt-1">Your inventory will show here when allocated by your leader</p>
                </div>
              )}

              {/* Confirmation Checkbox */}
              <div className="flex items-start space-x-2 p-3 md:p-4 bg-blue-50 rounded-lg border border-blue-200">
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
                  ✓ I acknowledge this inventory ({itemsToRemit.length} items, {totalRemitQuantity} units) stays with me and carries over to tomorrow
                </label>
              </div>
            </TabsContent>

            {/* Sold Orders Tab */}
            <TabsContent value="sold" className="flex-1 overflow-y-auto px-4 md:px-6 space-y-3 md:space-y-4 mt-2">
              {/* Nested Tabs for Cash vs Bank Orders */}
              <Tabs defaultValue="cash" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="cash" className="text-xs md:text-sm">
                    Cash & Cheque ({todayCashOrders.length})
                  </TabsTrigger>
                  <TabsTrigger value="bank" className="text-xs md:text-sm">
                    Bank Transfer ({todayBankOrders.length})
                  </TabsTrigger>
                </TabsList>

                {/* Cash Orders Sub-Tab */}
                <TabsContent value="cash" className="space-y-3">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs md:text-sm text-green-900">
                      💵 <strong>Cash & Cheque Remittance:</strong> Physical cash and cheques from these orders must be remitted to your leader.
                    </p>
                  </div>
                  {loadingOrders ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : todayCashOrders.length > 0 ? (
                    <>
                      <Card>
                        <CardContent className="p-3 md:p-4">
                          <div className="grid grid-cols-2 gap-2 md:gap-4 text-center">
                            <div>
                              <div className="text-lg md:text-2xl font-bold text-green-600">
                                {todayCashOrders.length}
                              </div>
                              <div className="text-[10px] md:text-xs text-muted-foreground">Orders</div>
                            </div>
                            <div>
                              <div className="text-lg md:text-2xl font-bold text-green-600">
                                ₱{todayCashOrders.reduce((sum, o) => sum + o.totalAmount, 0).toLocaleString()}
                              </div>
                              <div className="text-[10px] md:text-xs text-muted-foreground">Total to Remit</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Mobile Card Layout */}
                      <div className="md:hidden space-y-2">
                        {todayCashOrders.map((order) => (
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
                                  {order.paymentMode === 'SPLIT' && (order.cashPortion || order.chequePortion) && (
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      {order.cashPortion ? `Cash ₱${order.cashPortion.toFixed(2)}` : ''}
                                      {order.chequePortion ? `${order.cashPortion ? ' • ' : ''}Cheque ₱${order.chequePortion.toFixed(2)}` : ''}
                                    </div>
                                  )}
                                  {order.paymentMode === 'SPLIT' && order.fullOrderTotal && order.nonCashPortion && order.nonCashPortion > 0 && (
                                    <div className="text-[10px] text-muted-foreground">
                                      {order.nonCashLabel || 'Non-cash'} ₱{order.nonCashPortion.toFixed(2)} (handled by Finance)
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center gap-2">
                                  <div className="text-xs text-muted-foreground">Client</div>
                                  <div className="text-sm font-medium truncate">{order.clientName}</div>
                                </div>
                                <div className="flex justify-between items-center gap-2">
                                  <div className="text-xs text-muted-foreground">Items</div>
                                  <div className="text-xs">{order.items.length} item(s)</div>
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
                                <TableHead className="text-right">Items</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-center w-24">Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {todayCashOrders.map((order) => (
                                <TableRow key={order.id}>
                                  <TableCell className="font-mono text-sm">{order.orderNumber}</TableCell>
                                  <TableCell>{order.clientName}</TableCell>
                                  <TableCell className="text-right">{order.items.length}</TableCell>
                                  <TableCell className="text-right font-semibold text-green-600 align-top">
                                    <div className="space-y-1">
                                      <div>₱{order.totalAmount.toFixed(2)}</div>
                                      {order.paymentMode === 'SPLIT' && (order.cashPortion || order.chequePortion) && (
                                        <div className="text-xs text-muted-foreground">
                                          {order.cashPortion ? `Cash ₱${order.cashPortion.toFixed(2)}` : ''}
                                          {order.chequePortion ? `${order.cashPortion ? ' • ' : ''}Cheque ₱${order.chequePortion.toFixed(2)}` : ''}
                                        </div>
                                      )}
                                      {order.paymentMode === 'SPLIT' && order.fullOrderTotal && order.nonCashPortion && order.nonCashPortion > 0 && (
                                        <div className="text-[10px] text-muted-foreground">
                                          {order.nonCashLabel || 'Non-cash'} ₱{order.nonCashPortion.toFixed(2)} (handled by Finance)
                                        </div>
                                      )}
                                    </div>
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
                      <p className="text-sm">No cash or cheque orders today</p>
                    </div>
                  )}
                </TabsContent>

                {/* Bank Transfer Orders Sub-Tab */}
                <TabsContent value="bank" className="space-y-3">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs md:text-sm">
                      <strong>Bank Transfer Orders:</strong> These orders go through finance verification. You can add notes/remarks for each order below.
                    </AlertDescription>
                  </Alert>

                  {loadingOrders ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : todayBankOrders.length > 0 ? (
                    <>
                      <Card>
                        <CardContent className="p-3 md:p-4">
                          <div className="grid grid-cols-2 gap-2 md:gap-4 text-center">
                            <div>
                              <div className="text-lg md:text-2xl font-bold text-blue-600">
                                {todayBankOrders.length}
                              </div>
                              <div className="text-[10px] md:text-xs text-muted-foreground">Orders</div>
                            </div>
                            <div>
                              <div className="text-lg md:text-2xl font-bold text-blue-600">
                                ₱{todayBankOrders.reduce((sum, o) => sum + o.totalAmount, 0).toLocaleString()}
                              </div>
                              <div className="text-[10px] md:text-xs text-muted-foreground">Total Value</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Bank Orders List with Notes */}
                      <div className="space-y-3">
                        {todayBankOrders.map((order) => (
                          <Card key={order.id} className="border">
                            <CardContent className="p-3 md:p-4 space-y-3">
                              <div className="flex justify-between items-start">
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Order #:</span>
                                    <span className="font-mono text-sm font-semibold">{order.orderNumber}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Client:</span>
                                    <span className="text-sm">{order.clientName}</span>
                                  </div>
                                  {order.bankType && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">Bank:</span>
                                      <Badge variant="outline" className="text-xs">{order.bankType}</Badge>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Items:</span>
                                    <span className="text-sm">{order.items.length}</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs text-muted-foreground">Amount</div>
                                  <div className="font-bold text-lg text-blue-600">₱{order.totalAmount.toFixed(2)}</div>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-xs font-medium">Agent Notes/Remarks</label>
                                <Textarea
                                  placeholder="Add any notes or remarks for this order..."
                                  value={bankOrderNotes.get(order.id) || ''}
                                  onChange={(e) => {
                                    const newNotes = new Map(bankOrderNotes);
                                    newNotes.set(order.id, e.target.value);
                                    setBankOrderNotes(newNotes);
                                  }}
                                  rows={2}
                                  className="text-sm"
                                />
                              </div>

                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setShowOrderDetailsModal(true);
                                }}
                              >
                                View Order Details
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No bank transfer orders today</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {/* Confirmation Checkbox for ALL orders */}
              {(todayCashOrders.length > 0 || todayBankOrders.length > 0) && (
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
                    I have reviewed the unremitted orders ({todayCashOrders.length + todayBankOrders.length} orders total) - <span className="text-muted-foreground">Optional</span>
                  </label>
                </div>
              )}
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
              {(!unsoldConfirmed || !signatureConfirmed || ((todayCashOrders.length > 0 || todayBankOrders.length > 0) && !soldConfirmed)) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 md:p-4">
                  <p className="text-[11px] md:text-sm text-yellow-800 font-semibold mb-1.5">
                    ⚠️ Review required sections
                  </p>
                  <ul className="text-[10px] md:text-sm text-yellow-700 space-y-0.5 ml-3">
                    {!unsoldConfirmed && <li>• Confirm current inventory (required)</li>}
                    {(todayCashOrders.length > 0 || todayBankOrders.length > 0) && !soldConfirmed && <li>• Review orders for remittance (optional)</li>}
                    {!signatureConfirmed && <li>• Add signature (required)</li>}
                  </ul>
                </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 md:gap-4">
                {/* Inventory Retained Summary */}
                <Card className={unsoldConfirmed ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}>
                  <CardHeader className="pb-1.5 px-3 pt-3 md:pb-3 md:px-6 md:pt-6">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Package className="h-3.5 w-3.5 md:h-5 md:w-5 flex-shrink-0" />
                        <h3 className="font-semibold text-[11px] md:text-base truncate">Inventory Retained</h3>
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
                        <span className="text-muted-foreground">Price Value:</span>
                        <span className="font-semibold truncate">
                          ₱{itemsToRemit.reduce((sum, item) => sum + (item.quantity * (item.price || 0)), 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 text-[10px] md:text-sm">
                        <span className="text-muted-foreground">DSP Value:</span>
                        <span className="font-semibold truncate text-blue-600">
                          ₱{itemsToRemit.reduce((sum, item) => sum + (item.quantity * (item.dspPrice || 0)), 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 text-[10px] md:text-sm">
                        <span className="text-muted-foreground">RSP Value:</span>
                        <span className="font-semibold truncate text-green-600">
                          ₱{itemsToRemit.reduce((sum, item) => sum + (item.quantity * (item.rspPrice || 0)), 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Cash Orders Summary */}
                <Card className={soldConfirmed ? 'border-green-200 bg-green-50' : 'border-gray-200'}>
                  <CardHeader className="pb-1.5 px-3 pt-3 md:pb-3 md:px-6 md:pt-6">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <ShoppingCart className="h-3.5 w-3.5 md:h-5 md:w-5 flex-shrink-0" />
                        <h3 className="font-semibold text-[11px] md:text-base truncate">Cash & Cheque Sales</h3>
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
                        <span className="font-semibold">{todayCashOrders.length + todayBankOrders.length}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-[10px] md:text-sm">
                        <span className="text-muted-foreground">Sold:</span>
                        <span className="font-semibold">{[...todayCashOrders, ...todayBankOrders].reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0)}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-[10px] md:text-sm">
                        <span className="text-muted-foreground">Revenue:</span>
                        <span className="font-semibold truncate">
                          ₱{[...todayCashOrders, ...todayBankOrders].reduce((sum, o) => sum + o.totalAmount, 0).toLocaleString()}
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
                      <p className="text-muted-foreground text-[9px] md:text-xs">Remitting To:</p>
                      <p className="font-semibold truncate">
                        {leaderName || 'Unknown'}
                        {leaderRole === 'manager' && ' (Manager)'}
                        {leaderRole === 'team_leader' && ' (Team Leader)'}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-[9px] md:text-xs">Date:</p>
                      <p className="font-semibold truncate">{format(new Date(), 'MMM dd, yyyy')}</p>
                    </div>
                  </div>

                  <div className="border-t pt-2 md:pt-4">
                    <h4 className="font-semibold mb-1.5 text-[10px] md:text-sm">What happens:</h4>
                    <ul className="text-[9px] md:text-sm space-y-0.5 text-muted-foreground leading-tight">
                      <li>✓ Unsold inventory stays with you (available tomorrow)</li>
                      <li>✓ Cash proceeds handed to {leaderName || 'your leader'}</li>
                      <li>✓ {todayCashOrders.length + todayBankOrders.length} order{(todayCashOrders.length + todayBankOrders.length) !== 1 ? 's' : ''} marked as remitted</li>
                      <li>✓ Cash deposit record created (pending leader verification)</li>
                      <li>✓ Digital signature captured for audit</li>
                      <li>✓ {leaderName || 'Leader'} receives notification</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Final Confirmation */}
              {unsoldConfirmed && signatureConfirmed && ((todayCashOrders.length === 0 && todayBankOrders.length === 0) || soldConfirmed) ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 md:p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 md:h-5 md:w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] md:text-sm font-semibold text-green-800">
                        Ready for remittance
                      </p>
                      <p className="text-[9px] md:text-sm text-green-700 mt-0.5">
                        {todayCashOrders.length > 0 || todayBankOrders.length > 0
                          ? `Processing ${todayCashOrders.length + todayBankOrders.length} order(s). ${todayCashOrders.length > 0 ? `₱${todayCashOrders.reduce((sum, o) => sum + o.totalAmount, 0).toLocaleString()} in cash to remit.` : ''} Your ${totalRemitQuantity} units of inventory stay with you.`
                          : `No cash to remit today. Your ${totalRemitQuantity} units of inventory stay with you.`
                        }
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 md:p-4">
                  <div className="flex items-start gap-2">
                    <div className="h-3.5 w-3.5 md:h-5 md:w-5 rounded-full border-2 border-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] md:text-sm font-semibold text-yellow-800">
                        Complete required steps
                      </p>
                      <p className="text-[9px] md:text-sm text-yellow-700 mt-0.5">
                        {!unsoldConfirmed && 'Confirm inventory retention. '}
                        {!signatureConfirmed && 'Add your signature. '}
                        {(todayCashOrders.length > 0 || todayBankOrders.length > 0) && !soldConfirmed && 'Review orders.'}
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
                !leaderId ||
                !signatureDataUrl ||
                !unsoldConfirmed ||
                !signatureConfirmed ||
                ((todayCashOrders.length > 0 || todayBankOrders.length > 0) && !soldConfirmed)
              }
              variant="default"
              className="w-full sm:w-auto h-10 md:h-9 text-sm"
            >
              {remitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                todayCashOrders.length > 0 || todayBankOrders.length > 0 ? 'Complete Remittance' : 'Complete End of Day'
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
                {selectedOrder.orderNumber} • {selectedOrder.clientName} • {format(new Date(selectedOrder.createdAt), 'MMM dd, yyyy • hh:mm a')}
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
                      <div className="text-xs text-muted-foreground mb-1">Date & Time</div>
                      <div className="text-sm font-medium">
                        {format(new Date(selectedOrder.createdAt), 'MMM dd, yyyy • hh:mm a')}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Payment</div>
                      {selectedOrder.paymentMode === 'SPLIT' ? (
                        <div className="space-y-1 text-xs">
                          <Badge variant="outline" className="inline-flex px-2 py-0.5 text-[11px]">
                            Split Payment
                          </Badge>

                          {/* Remitted cash/cheque portion */}
                          {(selectedOrder.cashPortion || selectedOrder.chequePortion) && (
                            <div className="text-[11px] text-foreground">
                              {selectedOrder.cashPortion ? `Cash ₱${selectedOrder.cashPortion.toFixed(2)}` : ''}
                              {selectedOrder.chequePortion
                                ? `${selectedOrder.cashPortion ? ' • ' : ''}Cheque ₱${selectedOrder.chequePortion.toFixed(2)}`
                                : ''}
                            </div>
                          )}

                          {/* Non-cash (bank/GCash) portion */}
                          {selectedOrder.nonCashPortion && selectedOrder.nonCashPortion > 0 && (
                            <div className="text-[11px] text-muted-foreground">
                              {selectedOrder.nonCashLabel || 'Bank / GCash'} ₱{selectedOrder.nonCashPortion.toFixed(2)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Badge
                          variant={selectedOrder.paymentMethod === 'CASH' || selectedOrder.paymentMethod === 'CHEQUE' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {selectedOrder.paymentMethod}
                        </Badge>
                      )}
                    </div>
                    {selectedOrder.bankType && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Bank</div>
                        <div className="text-sm font-medium">{selectedOrder.bankType}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        {selectedOrder.paymentMode === 'SPLIT' ? 'Remittance Amount (Cash/Cheque)' : 'Total Amount'}
                      </div>
                      <div className="text-base font-bold text-green-600">₱{selectedOrder.totalAmount.toFixed(2)}</div>
                    </div>
                    {selectedOrder.paymentMode === 'SPLIT' && typeof selectedOrder.fullOrderTotal === 'number' && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Order Total</div>
                        <div className="text-base font-semibold">₱{selectedOrder.fullOrderTotal.toFixed(2)}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Total Quantity</div>
                      <div className="text-base font-bold">{selectedOrder.items.reduce((sum, item) => sum + item.quantity, 0)}</div>
                    </div>
                    {selectedOrder.agentNotes && (
                      <div className="col-span-2">
                        <div className="text-xs text-muted-foreground mb-1">Agent Notes</div>
                        <div className="text-sm p-2 bg-muted/50 rounded border">{selectedOrder.agentNotes}</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Order Items */}
              <div>
                <h3 className="text-sm font-semibold mb-2 px-1">Order Items ({selectedOrder.items.length})</h3>

                {selectedOrder.items.length > 0 ? (
                  (() => {
                    // Group items by brand for clearer overview
                    const itemsByBrand = selectedOrder.items.reduce((acc: any, item: any) => {
                      const brand = item.brandName || 'Unknown Brand';
                      if (!acc[brand]) acc[brand] = [];
                      acc[brand].push(item);
                      return acc;
                    }, {} as Record<string, any[]>);

                    const brands = Object.keys(itemsByBrand).sort();

                    return (
                      <>
                        {/* Mobile Card Layout - grouped by brand */}
                        <div className="md:hidden space-y-3">
                          {brands.map((brand) => (
                            <div key={brand} className="space-y-2">
                              <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {brand}
                                  </span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {itemsByBrand[brand].length} item
                                    {itemsByBrand[brand].length > 1 ? 's' : ''}
                                  </Badge>
                                </div>
                                <div className="text-[11px] font-semibold text-green-700">
                                  ₱
                                  {itemsByBrand[brand]
                                    .reduce((sum: number, it: any) => sum + it.quantity * it.unitPrice, 0)
                                    .toFixed(2)}
                                </div>
                              </div>

                              {itemsByBrand[brand].map((item: any, index: number) => (
                                <Card key={`${brand}-${index}`} className="border ml-1.5">
                                  <CardContent className="p-3">
                                    <div className="space-y-2">
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="text-[10px] text-muted-foreground">Product</div>
                                          <div className="font-medium text-sm truncate">{item.variantName}</div>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                                        <div>
                                          <div className="text-[10px] text-muted-foreground">Quantity</div>
                                          <div className="font-semibold text-sm">{item.quantity}</div>
                                        </div>
                                        <div>
                                          <div className="text-[10px] text-muted-foreground">Price</div>
                                          <div className="font-semibold text-sm">
                                            ₱{item.unitPrice.toFixed(2)}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-[10px] text-muted-foreground">Amount</div>
                                          <div className="font-semibold text-sm text-green-600">
                                            ₱{(item.quantity * item.unitPrice).toFixed(2)}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          ))}
                        </div>

                        {/* Desktop Table Layout - grouped by brand */}
                        <div className="hidden md:block space-y-3">
                          {brands.map((brand) => (
                            <div key={brand} className="border rounded-lg overflow-hidden">
                              <div className="bg-muted/40 px-4 py-2 border-b flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {brand}
                                  </span>
                                  <Badge variant="outline" className="text-[11px]">
                                    {itemsByBrand[brand].length} item
                                    {itemsByBrand[brand].length > 1 ? 's' : ''}
                                  </Badge>
                                </div>
                                <div className="text-sm font-semibold text-green-700">
                                  Brand Total:&nbsp;
                                  ₱
                                  {itemsByBrand[brand]
                                    .reduce((sum: number, it: any) => sum + it.quantity * it.unitPrice, 0)
                                    .toFixed(2)}
                                </div>
                              </div>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">Quantity</TableHead>
                                    <TableHead className="text-right">Price</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {itemsByBrand[brand].map((item: any, index: number) => (
                                    <TableRow key={`${brand}-${index}`}>
                                      <TableCell className="font-medium">{item.variantName}</TableCell>
                                      <TableCell className="text-right font-semibold">{item.quantity}</TableCell>
                                      <TableCell className="text-right">
                                        ₱{item.unitPrice.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-right font-semibold text-green-600">
                                        ₱{(item.quantity * item.unitPrice).toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()
                ) : (
                  <div className="text-center text-xs text-muted-foreground py-4">
                    No items found for this order.
                  </div>
                )}
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

      {/* Return Inventory Dialog (mobile sales → leader) */}
      <ReturnInventoryDialog
        open={returnDialogOpen}
        onOpenChange={setReturnDialogOpen}
        leaderId={leaderId}
        leaderName={leaderName}
      />

      {/* Return to Main Inventory Dialog (team leader → main) */}
      <ReturnToMainDialog
        open={returnToMainDialogOpen}
        onOpenChange={setReturnToMainDialogOpen}
      />
    </div>
  );
}
