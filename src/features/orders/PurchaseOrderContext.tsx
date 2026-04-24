import { useState, useEffect, ReactNode } from 'react';
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

export function PurchaseOrderProvider({ children }: { children: ReactNode }) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [linkedWarehouseCompanyId, setLinkedWarehouseCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch all purchase orders with items
  const fetchPurchaseOrders = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);

      let poQuery = supabase
        .from('purchase_orders')
        .select(`
          id, created_at, supplier_id, fulfillment_type, warehouse_company_id, warehouse_location_id, subtotal, tax_rate, tax_amount, discount, total_amount, status, company_id, po_number, order_date, expected_delivery_date, notes, created_by, approved_by, approved_at, updated_at,
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
          )
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

      // For each order, fetch its items with brand and variant info
      const ordersWithItems = await Promise.all(
        (orders || []).map(async (order) => {
          const { data: items, error: itemsError } = await supabase
            .from('purchase_order_items')
            .select(`
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
              variants (
                id,
                name,
                variant_type,
                brands (
                  name
                )
              )
            `)
            .eq('purchase_order_id', order.id);

          if (itemsError) {
            console.error('Error fetching items for order:', order.id, itemsError);
            const rawSup = Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers;
            const supplier =
              order.fulfillment_type === 'warehouse_transfer' ? WAREHOUSE_PLACEHOLDER_SUPPLIER : rawSup;
            return {
              ...order,
              supplier,
              items: [],
            };
          }

          const formattedItems: PurchaseOrderItem[] = (items || []).map((item: any) => ({
            id: item.id,
            variant_id: item.variant_id,
            warehouse_location_id: item.warehouse_location_id ?? null,
            warehouse_location: Array.isArray(item.warehouse_locations) ? item.warehouse_locations[0] : item.warehouse_locations,
            brand_name: item.variants?.brands?.name || 'Unknown',
            variant_name: item.variants?.name || 'Unknown',
            variant_type: item.variants?.variant_type || 'flavor',
            quantity: item.quantity,
            unit_price: parseFloat(item.unit_price),
            total_price: parseFloat(item.total_price),
          }));

          const rawSup = Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers;
          const rawLoc = Array.isArray((order as any).warehouse_locations)
            ? (order as any).warehouse_locations[0]
            : (order as any).warehouse_locations;
          const supplier =
            order.fulfillment_type === 'warehouse_transfer' ? WAREHOUSE_PLACEHOLDER_SUPPLIER : rawSup;

          return {
            ...order,
            supplier,
            warehouse_location: rawLoc ?? null,
            subtotal: parseFloat(order.subtotal),
            tax_rate: parseFloat(order.tax_rate),
            tax_amount: parseFloat(order.tax_amount),
            discount: parseFloat(order.discount),
            total_amount: parseFloat(order.total_amount),
            items: formattedItems,
          };
        })
      );

      setPurchaseOrders(ordersWithItems);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      // Helpful details when Supabase returns a structured error object
      if (error && typeof error === 'object') {
        try {
          console.error('Error details:', JSON.stringify(error));
        } catch {
          // ignore
        }
      }
      toast({
        title: 'Error',
        description: (error as any)?.message || 'Failed to load purchase orders',
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

        toast({
          title: 'Success',
          description: `Purchase Order ${poNumber} created successfully`,
        });

        // Refresh the list
        await fetchPurchaseOrders();

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

      // Refresh the list
      await fetchPurchaseOrders();

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

      toast({ title: 'Purchase Order Rejected', description: 'The PO has been rejected.' });
      await fetchPurchaseOrders();
      return { success: true };
    } catch (error: any) {
      console.error('Error rejecting purchase order:', error);
      return { success: false, error: error.message };
    }
  };

  // Resolve linked warehouse hub for admin / super_admin (client company PO creation)
  useEffect(() => {
    if (!user?.company_id || !['super_admin', 'admin'].includes(user.role)) {
      setLinkedWarehouseCompanyId(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data: row, error } = await supabase
        .from('warehouse_company_assignments')
        .select('warehouse_user_id')
        .eq('client_company_id', user.company_id)
        .maybeSingle();

      if (cancelled || error || !row?.warehouse_user_id) {
        if (!cancelled) setLinkedWarehouseCompanyId(null);
        return;
      }
      // Tenant users may not be able to SELECT the warehouse user's profile row due to RLS
      // (different company). Use a SECURITY DEFINER RPC to resolve hub company_id safely.
      const { data: hubCompanyId, error: hubErr } = await supabase.rpc('get_linked_warehouse_company_id', {});

      if (cancelled) return;
      if (hubErr || !hubCompanyId) {
        setLinkedWarehouseCompanyId(null);
        return;
      }
      setLinkedWarehouseCompanyId(hubCompanyId as any);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.company_id, user?.role]);

  // Real-time subscriptions
  useEffect(() => {
    if (!user) return;

    fetchPurchaseOrders();
    fetchSuppliers();

    // Subscribe to purchase orders changes
    const poSubscription = supabase
      .channel('purchase_orders_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_orders' },
        () => {
          console.log('Purchase orders changed, refreshing...');
          fetchPurchaseOrders(false);
        }
      )
      .subscribe();

    // Subscribe to purchase order items changes
    const poItemsSubscription = supabase
      .channel('purchase_order_items_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_order_items' },
        () => {
          console.log('Purchase order items changed, refreshing...');
          fetchPurchaseOrders(false);
        }
      )
      .subscribe();

    return () => {
      poSubscription.unsubscribe();
      poItemsSubscription.unsubscribe();
    };
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
