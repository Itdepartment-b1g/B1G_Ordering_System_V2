import { useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import type { PurchaseOrder, PurchaseOrderItem, Supplier } from './types';
import { PurchaseOrderContext } from './hooks';

const WAREHOUSE_PLACEHOLDER_SUPPLIER: Supplier = {
  id: '',
  company_name: 'Warehouse (internal transfer)',
  contact_person: '—',
  email: '—',
  phone: '—',
  address: '—',
  status: 'active',
};

const PO_ITEMS_SELECT = `
  id,
  variant_id,
  warehouse_location_id,
  quantity,
  unit_price,
  total_price,
  warehouse_locations:warehouse_location_id (
    id,
    name,
    is_main
  ),
  variants:variant_id (
    id,
    name,
    variant_type,
    brands:brand_id (
      name
    )
  )
`;

function formatPoItem(item: any): PurchaseOrderItem {
  const variantRaw = item.variants;
  const variant = Array.isArray(variantRaw) ? variantRaw[0] : variantRaw;
  const brandRaw = variant?.brands;
  const brand = Array.isArray(brandRaw) ? brandRaw[0] : brandRaw;
  const locRaw = item.warehouse_locations;
  const warehouseLocation = Array.isArray(locRaw) ? locRaw[0] : locRaw;

  return {
    id: item.id,
    variant_id: item.variant_id,
    warehouse_location_id: item.warehouse_location_id ?? null,
    warehouse_location: warehouseLocation ?? null,
    brand_name: brand?.name || 'Unknown',
    variant_name: variant?.name || 'Unknown',
    variant_type: variant?.variant_type || 'flavor',
    quantity: item.quantity,
    unit_price: parseFloat(item.unit_price),
    total_price: parseFloat(item.total_price),
  };
}

function formatPurchaseOrder(order: any, items: any[]): PurchaseOrder {
  const rawSup = Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers;
  const rawLoc = Array.isArray(order.warehouse_locations)
    ? order.warehouse_locations[0]
    : order.warehouse_locations;
  const supplier =
    order.fulfillment_type === 'warehouse_transfer' ? WAREHOUSE_PLACEHOLDER_SUPPLIER : rawSup;

  const rawClient = Array.isArray(order.client) ? order.client[0] : order.client;
  const rawShop = Array.isArray(order.shop) ? order.shop[0] : order.shop;
  const rawAddress = Array.isArray(order.address) ? order.address[0] : order.address;
  const rawKam = Array.isArray(order.kam) ? order.kam[0] : order.kam;
  const rawCreatedByUser = Array.isArray(order.created_by_user)
    ? order.created_by_user[0]
    : order.created_by_user;

  return {
    ...order,
    supplier,
    warehouse_location: rawLoc ?? null,
    subtotal: parseFloat(order.subtotal),
    tax_rate: parseFloat(order.tax_rate),
    tax_amount: parseFloat(order.tax_amount),
    discount: parseFloat(order.discount),
    total_amount: parseFloat(order.total_amount),
    items: items.map(formatPoItem),
    client: rawClient ?? null,
    shop: rawShop ?? null,
    address: rawAddress ?? null,
    kam: rawKam ?? null,
    created_by_user: rawCreatedByUser ?? null,
  };
}

export function PurchaseOrderProvider({ children }: { children: ReactNode }) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [linkedWarehouseCompanyId, setLinkedWarehouseCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const manualRefreshUntilRef = useRef(0);

  const markManualRefresh = () => {
    manualRefreshUntilRef.current = Date.now() + 3000;
  };

  const scheduleBackgroundRefresh = () => {
    void fetchPurchaseOrders(false, true);
  };

  // Fetch all purchase orders with items (single query — no N+1)
  const fetchPurchaseOrders = async (showLoading = true, dedupeRealtime = false) => {
    if (dedupeRealtime) markManualRefresh();
    try {
      if (showLoading) setLoading(true);

      let poQuery = supabase
        .from('purchase_orders')
        .select(`
          id, created_at, supplier_id, fulfillment_type, warehouse_company_id, warehouse_location_id, subtotal, tax_rate, tax_amount, discount, total_amount, status, company_id, po_number, order_date, expected_delivery_date, notes, created_by, approved_by, approved_at, updated_at,
          company_account_type, workflow_status, rfpf_number, dr_number, po_order_kind, source_rebate_id,
          kam_id,
          key_account_client_id, key_account_shop_id, key_account_address_id,
          warehouse_locations:warehouse_location_id (
            id,
            name,
            is_main
          ),
          suppliers (
            id,
            company_name,
            contact_person,
            email,
            phone,
            address,
            status
          ),
          client:key_account_clients(client_name),
          shop:key_account_shops(shop_name, cor_pdf_path),
          address:key_account_delivery_addresses(address_label,full_address,city,province,zip_code,contact_name,contact_phone,is_default),
          kam:profiles!purchase_orders_kam_id_fkey(full_name,email),
          created_by_user:profiles!purchase_orders_created_by_fkey(full_name,email),
          purchase_order_items (${PO_ITEMS_SELECT})
        `);

      if (user?.role === 'warehouse' && user.company_id) {
        const { data: isMain } = await supabase.rpc('is_main_warehouse_user', {});
        poQuery = poQuery
          .eq('fulfillment_type', 'warehouse_transfer')
          .eq('warehouse_company_id', user.company_id);

        // Do NOT filter by purchase_orders.warehouse_location_id for sub-warehouse users.
        // Multi-location transfers store the true source per item (purchase_order_items.warehouse_location_id),
        // and RLS already restricts sub-warehouses to their slice.
        // Filtering here would hide valid multi-location POs (header location can be NULL).
        void isMain;
      }

      const { data: orders, error: ordersError } = await poQuery.order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const ordersWithItems = (orders || []).map((order: any) => {
        const nestedItems = order.purchase_order_items;
        const items = Array.isArray(nestedItems) ? nestedItems : [];
        const { purchase_order_items: _poItems, ...orderFields } = order;
        return formatPurchaseOrder(orderFields, items);
      });

      // Standard Accounts: warehouse cannot read creator profiles via RLS join.
      // Reuse get_po_requestor_info (same source as View "Placed by").
      let enrichedOrders = ordersWithItems;
      if (user?.role === 'warehouse') {
        const standardOrders = ordersWithItems.filter(
          (o) => String(o.company_account_type || 'Standard Accounts') !== 'Key Accounts'
        );
        if (standardOrders.length > 0) {
          const placedByEntries = await Promise.all(
            standardOrders.map(async (o) => {
              try {
                const { data, error } = await supabase.rpc('get_po_requestor_info', {
                  p_po_id: o.id,
                });
                if (error || !data) return [o.id, null] as const;
                const profile = (data as { profile?: PurchaseOrder['requestor_profile'] }).profile ?? null;
                return [o.id, profile] as const;
              } catch {
                return [o.id, null] as const;
              }
            })
          );
          const placedByMap = new Map(placedByEntries);
          enrichedOrders = ordersWithItems.map((o) => {
            const profile = placedByMap.get(o.id);
            if (!profile) return o;
            return { ...o, requestor_profile: profile };
          });
        }
      }

      setPurchaseOrders(enrichedOrders);
    } catch (error) {
      const msg = String((error as any)?.message || '');
      const isAbort =
        (error as any)?.name === 'AbortError' ||
        msg.includes('AbortError') ||
        msg.includes('aborted');
      if (isAbort) return;

      console.error('Error fetching purchase orders:', error);
      if (error && typeof error === 'object') {
        try {
          console.error('Error details:', JSON.stringify(error));
        } catch {
          // ignore
        }
      }
      toast({
        title: 'Error',
        description: msg || 'Failed to load purchase orders',
        variant: 'destructive',
      });
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Fetch all suppliers
  const fetchSuppliers = async () => {
    try {
      if (user?.role === 'warehouse') {
        setSuppliers([]);
        return;
      }

      if (!user?.company_id) {
        console.warn('No company_id available to fetch suppliers');
        return;
      }

      const { data, error } = await supabase
        .from('suppliers')
        .select('id, company_name, contact_person, email, phone, address, status')
        .eq('company_id', user.company_id)
        .eq('status', 'active')
        .order('company_name');

      if (error) throw error;
      setSuppliers(data || []);
      console.log('Suppliers fetched:', data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      toast({
        title: 'Error',
        description: 'Failed to load suppliers',
        variant: 'destructive',
      });
    }
  };

  // Create a new purchase order
  const createPurchaseOrder = async (orderData: {
    supplier_id: string | null;
    fulfillment_type: 'supplier' | 'warehouse_transfer';
    warehouse_company_id?: string | null;
    warehouse_location_id?: string | null;
    order_date: string;
    expected_delivery_date: string;
    items: Array<{
      variant_id: string;
      quantity: number;
      unit_price: number;
      warehouse_location_id?: string | null;
    }>;
    tax_rate: number;
    discount: number;
    notes: string;
  }) => {
    // Retry configuration
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        if (!user) {
          return { success: false, error: 'User not authenticated' };
        }

        if (!user.company_id) {
          return { success: false, error: 'User company information not found' };
        }

        if (orderData.fulfillment_type === 'supplier' && !orderData.supplier_id) {
          return { success: false, error: 'Supplier is required' };
        }
        if (orderData.fulfillment_type === 'warehouse_transfer' && !orderData.warehouse_company_id) {
          return { success: false, error: 'Warehouse hub is not configured for this company' };
        }
        if (orderData.fulfillment_type === 'warehouse_transfer') {
          const hasHeaderLocation = !!orderData.warehouse_location_id;
          const hasItemLocations = (orderData.items || []).every((it) => !!it.warehouse_location_id);
          if (!hasHeaderLocation && !hasItemLocations) {
            return { success: false, error: 'Warehouse location is required for internal transfers' };
          }
        }

        // Calculate totals
        const subtotal = orderData.items.reduce(
          (sum, item) => sum + item.quantity * item.unit_price,
          0
        );
        const tax_amount = (subtotal * orderData.tax_rate) / 100;
        const total_amount = subtotal + tax_amount - orderData.discount;

        // Generate PO number
        const year = new Date().getFullYear();
        
        // Get the last PO number for this company and year
        // Sort by created_at DESC to ensure we get the latest even if IDs are out of order
        const { data: lastPO, error: fetchError } = await supabase
          .from('purchase_orders')
          .select('po_number')
          .eq('company_id', user.company_id)
          .like('po_number', `PO-${year}-%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fetchError) throw fetchError;

        let nextSequence = 1001; 
        if (lastPO && lastPO.po_number) {
          const parts = lastPO.po_number.split('-');
          if (parts.length === 3) {
            const lastSeq = parseInt(parts[2], 10);
            if (!isNaN(lastSeq)) {
              nextSequence = lastSeq + 1;
            }
          }
        }

        const poNumber = `PO-${year}-${String(nextSequence).padStart(4, '0')}`;

        // Insert purchase order
        const { data: newPO, error: poError } = await supabase
          .from('purchase_orders')
          .insert({
            company_id: user.company_id,
            po_number: poNumber,
            fulfillment_type: orderData.fulfillment_type,
            warehouse_company_id:
              orderData.fulfillment_type === 'warehouse_transfer'
                ? orderData.warehouse_company_id
                : null,
            warehouse_location_id:
              orderData.fulfillment_type === 'warehouse_transfer'
                ? orderData.warehouse_location_id
                : null,
            supplier_id: orderData.fulfillment_type === 'supplier' ? orderData.supplier_id : null,
            order_date: orderData.order_date,
            expected_delivery_date: orderData.expected_delivery_date,
            subtotal,
            tax_rate: orderData.tax_rate,
            tax_amount,
            discount: orderData.discount,
            total_amount,
            status: 'pending',
            notes: orderData.notes,
            created_by: user.id,
          })
          .select()
          .single();

        if (poError) {
          // Check for unique constraint violation (duplicate PO number)
          if (poError.code === '23505') {
            console.warn(`Duplicate PO number ${poNumber} detected. Retrying... (Attempt ${attempt + 1}/${MAX_RETRIES})`);
            attempt++;
            continue; // Retry the loop
          }
          throw poError;
        }

        // Insert purchase order items (calculate total_price)
        const itemsToInsert = orderData.items.map((item) => ({
          company_id: user.company_id,
          purchase_order_id: newPO.id,
          variant_id: item.variant_id,
          warehouse_location_id:
            orderData.fulfillment_type === 'warehouse_transfer'
              ? (item.warehouse_location_id ?? orderData.warehouse_location_id ?? null)
              : null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.quantity * item.unit_price,
        }));

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        const { logPurchaseOrderEvent } = await import('./purchaseOrderEventsApi');
        void logPurchaseOrderEvent({
          purchaseOrderId: newPO.id,
          eventType: 'created',
          note: orderData.notes || null,
          lines: orderData.items.map((item) => ({
            variant_id: item.variant_id,
            quantity: item.quantity,
          })),
          createdBy: user.id,
        });

        toast({
          title: 'Success',
          description: `Purchase Order ${poNumber} created successfully`,
        });

        scheduleBackgroundRefresh();

        return { success: true };
      } catch (error: any) {
        // If we exhausted retries or hit a different error
        console.error('Error creating purchase order:', error);
        return { success: false, error: error.message };
      }
    }

    return { success: false, error: 'Failed to generate a unique PO Number after multiple attempts. Please try again.' };
  };

  // Approve a purchase order
  const approvePurchaseOrder = async (poId: string) => {
    try {
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      console.log('[PO Approval] Starting approval for PO:', poId, 'by user:', user.id);

      const { data: poRow, error: poRowErr } = await supabase
        .from('purchase_orders')
        .select('fulfillment_type,warehouse_location_id')
        .eq('id', poId)
        .single();

      if (poRowErr) throw poRowErr;

      let rpcName: string = 'approve_purchase_order';
      if (poRow?.fulfillment_type === 'warehouse_transfer') {
        // Always use reserve-then-fulfill flow for warehouse transfers
        // This ensures sub-warehouse transfers require fulfillment after approval
        rpcName = 'approve_multi_location_po';
      }

      const { data, error } =
        rpcName === 'approve_multi_location_po'
          ? await supabase.rpc(rpcName, { p_po_id: poId, p_approver_id: user.id })
          : await supabase.rpc(rpcName as any, { po_id: poId, approver_id: user.id });

      console.log('[PO Approval] RPC response:', { data, error, rpcName });

      if (error) {
        console.error('[PO Approval] RPC error:', error);
        throw error;
      }

      if (!data) {
        console.error('[PO Approval] No data returned from function');
        return { success: false, error: 'No response from approval function' };
      }

      if (!data.success) {
        console.error('[PO Approval] Function returned failure:', data.error);
        return { success: false, error: data.error };
      }

      console.log('[PO Approval] Success! PO Number:', data.po_number);

      // approve_multi_location_po already writes purchase_order_events; log for other paths.
      if (rpcName !== 'approve_multi_location_po') {
        const { logPurchaseOrderEvent } = await import('./purchaseOrderEventsApi');
        void logPurchaseOrderEvent({
          purchaseOrderId: poId,
          eventType: 'approved',
          createdBy: user.id,
        });
      }

      toast({
        title: 'Purchase Order Approved',
        description:
          rpcName === 'approve_warehouse_transfer_po'
            ? `${data.po_number} approved — stock moved from warehouse to client company`
            : rpcName === 'approve_multi_location_po'
              ? `${data.po_number} approved — reserved for fulfillment by requested warehouses`
            : `${data.po_number} has been approved and added to inventory`,
        duration: 5000,
      });

      scheduleBackgroundRefresh();

      return { success: true };
    } catch (error: any) {
      console.error('[PO Approval] Exception:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve purchase order',
        variant: 'destructive',
      });
      return { success: false, error: error.message };
    }
  };

  // Reject a purchase order (status -> rejected)
  const rejectPurchaseOrder = async (poId: string) => {
    try {
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'rejected', approved_by: null, approved_at: null })
        .eq('id', poId)
        .eq('status', 'pending');

      if (error) throw error;

      const { logPurchaseOrderEvent } = await import('./purchaseOrderEventsApi');
      void logPurchaseOrderEvent({
        purchaseOrderId: poId,
        eventType: 'rejected',
        createdBy: user.id,
      });

      toast({ title: 'Purchase Order Rejected', description: 'The PO has been rejected.' });
      scheduleBackgroundRefresh();
      return { success: true };
    } catch (error: any) {
      console.error('Error rejecting purchase order:', error);
      return { success: false, error: error.message };
    }
  };

  // Resolve linked warehouse hub for client companies (any non-warehouse role).
  // Used for warehouse_transfer PO creation and History visibility.
  useEffect(() => {
    if (!user?.company_id || user.role === 'warehouse') {
      setLinkedWarehouseCompanyId(null);
      return;
    }

    let cancelled = false;
    (async () => {
      // Tenant users may not be able to SELECT the warehouse user's profile row due to RLS
      // (different company). Use a SECURITY DEFINER RPC to resolve hub company_id safely.
      const { data: hubCompanyId, error: hubErr } = await supabase.rpc('get_linked_warehouse_company_id', {});

      if (cancelled) return;
      if (hubErr || !hubCompanyId) {
        setLinkedWarehouseCompanyId(null);
        return;
      }
      setLinkedWarehouseCompanyId(hubCompanyId as string);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.company_id, user?.role]);

  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePurchaseOrdersRefresh = (showLoading = false) => {
    if (Date.now() < manualRefreshUntilRef.current) return;
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => {
      refreshDebounceRef.current = null;
      if (Date.now() < manualRefreshUntilRef.current) return;
      void fetchPurchaseOrders(showLoading);
    }, 400);
  };

  // Real-time subscriptions
  useEffect(() => {
    if (!user) return;

    void fetchPurchaseOrders();
    fetchSuppliers();

    const poSubscription = supabase
      .channel('purchase_orders_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_orders' },
        () => {
          schedulePurchaseOrdersRefresh(false);
        }
      )
      .subscribe();

    const poItemsSubscription = supabase
      .channel('purchase_order_items_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_order_items' },
        () => {
          schedulePurchaseOrdersRefresh(false);
        }
      )
      .subscribe();

    return () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      poSubscription.unsubscribe();
      poItemsSubscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, user?.company_id]);

  return (
    <PurchaseOrderContext.Provider
      value={{
        purchaseOrders,
        suppliers,
        linkedWarehouseCompanyId,
        loading,
        fetchPurchaseOrders,
        fetchSuppliers,
        createPurchaseOrder,
        approvePurchaseOrder,
        rejectPurchaseOrder,
      }}
    >
      {children}
    </PurchaseOrderContext.Provider>
  );
}
