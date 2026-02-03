import { useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import type { PurchaseOrder, PurchaseOrderItem, Supplier } from './types';
import { PurchaseOrderContext } from './hooks';

export function PurchaseOrderProvider({ children }: { children: ReactNode }) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch all purchase orders with items
  const fetchPurchaseOrders = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);

      // Fetch purchase orders with supplier info
      const { data: orders, error: ordersError } = await supabase
        .from('purchase_orders')
        .select(`
          id, created_at, supplier_id, subtotal, tax_rate, tax_amount, discount, total_amount, status, company_id, po_number, order_date, expected_delivery_date, notes, created_by, approved_by, approved_at, updated_at,
          suppliers (
            id,
            company_name,
            contact_person,
            email,
            phone,
            address,
            status
          )
        `)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // For each order, fetch its items with brand and variant info
      const ordersWithItems = await Promise.all(
        (orders || []).map(async (order) => {
          const { data: items, error: itemsError } = await supabase
            .from('purchase_order_items')
            .select(`
              id,
              variant_id,
              quantity,
              unit_price,
              total_price,
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
            return {
              ...order,
              supplier: Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers,
              items: [],
            };
          }

          const formattedItems: PurchaseOrderItem[] = (items || []).map((item: any) => ({
            id: item.id,
            variant_id: item.variant_id,
            brand_name: item.variants?.brands?.name || 'Unknown',
            variant_name: item.variants?.name || 'Unknown',
            variant_type: item.variants?.variant_type || 'flavor',
            quantity: item.quantity,
            unit_price: parseFloat(item.unit_price),
            total_price: parseFloat(item.total_price),
          }));

          return {
            ...order,
            supplier: Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers,
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
      toast({
        title: 'Error',
        description: 'Failed to load purchase orders',
        variant: 'destructive',
      });
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Fetch all suppliers
  const fetchSuppliers = async () => {
    try {
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
    supplier_id: string;
    order_date: string;
    expected_delivery_date: string;
    items: Array<{
      variant_id: string;
      quantity: number;
      unit_price: number;
    }>;
    tax_rate: number;
    discount: number;
    notes: string;
  }) => {
    try {
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      if (!user.company_id) {
        return { success: false, error: 'User company information not found' };
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
      const { data: lastPO, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('po_number')
        .eq('company_id', user.company_id)
        .like('po_number', `PO-${year}-%`)
        .order('id', { ascending: false }) // id is serial/increasing, or use created_at
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
          supplier_id: orderData.supplier_id,
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

      if (poError) throw poError;

      // Insert purchase order items (calculate total_price)
      const itemsToInsert = orderData.items.map((item) => ({
        company_id: user.company_id,
        purchase_order_id: newPO.id,
        variant_id: item.variant_id,
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
      console.error('Error creating purchase order:', error);
      return { success: false, error: error.message };
    }
  };

  // Approve a purchase order
  const approvePurchaseOrder = async (poId: string) => {
    try {
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      console.log('[PO Approval] Starting approval for PO:', poId, 'by user:', user.id);

      // Call the database function
      const { data, error } = await supabase.rpc('approve_purchase_order', {
        po_id: poId,
        approver_id: user.id,
      });

      console.log('[PO Approval] RPC response:', { data, error });

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
        description: `${data.po_number} has been approved and added to inventory`,
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
        .eq('id', poId);

      if (error) throw error;

      toast({ title: 'Purchase Order Rejected', description: 'The PO has been rejected.' });
      await fetchPurchaseOrders();
      return { success: true };
    } catch (error: any) {
      console.error('Error rejecting purchase order:', error);
      return { success: false, error: error.message };
    }
  };

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
  }, [user]);

  return (
    <PurchaseOrderContext.Provider
      value={{
        purchaseOrders,
        suppliers,
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
