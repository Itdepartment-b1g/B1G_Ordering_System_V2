import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AuthContext } from '@/features/auth/hooks';

export interface OrderItem {
  id: string;
  brandName: string;
  variantName: string;
  variantType: 'flavor' | 'battery';
  quantity: number;
  unitPrice: number;
  sellingPrice?: number;
  dspPrice?: number;
  rspPrice?: number;
  total: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  agentId: string;

  agentName: string;
  clientId: string;
  clientName: string;
  clientAccountType?: 'Key Accounts' | 'Standard Accounts';
  date: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  stage?: 'agent_pending' | 'leader_approved' | 'admin_approved' | 'leader_rejected' | 'admin_rejected';
  signatureUrl?: string;
  paymentMethod?: 'GCASH' | 'BANK_TRANSFER' | 'CASH';
  paymentProofUrl?: string;
}

interface OrderContextType {
  orders: Order[];
  loading: boolean;
  addOrder: (order: Order) => Promise<string>; // Returns the generated order number
  updateOrderStatus: (orderId: string, status: 'pending' | 'approved' | 'rejected') => void;
  getOrdersByAgent: (agentId: string) => Order[];
  getAllOrders: () => Order[];
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch orders from Supabase
  const fetchOrders = async () => {
    try {
      setLoading(true);

      const { data: ordersData, error } = await supabase
        .from('client_orders')
        .select(`
          id,
          order_number,
          agent_id,
          client_id,
          client_account_type,
          order_date,
          subtotal,
          tax_rate,
          tax_amount,
          discount,
          total_amount,
          status,
          notes,
          signature_url,
          payment_method,
          payment_proof_url,
          stage,
          agent:profiles!client_orders_agent_id_fkey(full_name),
          client:clients(name, email),
          items:client_order_items(
            id,
            quantity,
            unit_price,
            selling_price,
            dsp_price,
            rsp_price,
            variant:variants(
              name,
              variant_type,
              main_inventory(
                selling_price,
                unit_price
              ),
              brand:brands(name)
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fallback: build a clientId -> clientName map if embedded relation is not returned due to RLS/constraint naming
      const clientIds: string[] = Array.from(new Set((ordersData || []).map((o: any) => o.client_id).filter(Boolean)));
      let clientIdToName: Record<string, string> = {};
      if (clientIds.length > 0) {
        const { data: clientsLookup } = await supabase
          .from('clients')
          .select('id, name')
          .in('id', clientIds);
        (clientsLookup || []).forEach((c: any) => { clientIdToName[c.id] = c.name; });
      }

      // Build a quick map of order items returned via the embedded relation
      const ordersWithEmbeddedItems: Record<string, any[]> = {};
      (ordersData || []).forEach((o: any) => {
        ordersWithEmbeddedItems[o.id] = Array.isArray(o.items) ? o.items : [];
      });

      // Fallback: if embedded relation didn't return items (likely due to RLS on client_order_items),
      // fetch items in a separate bulk query and merge them in
      const orderIdsNeedingItems = (ordersData || [])
        .filter((o: any) => !(Array.isArray(o.items) && o.items.length > 0))
        .map((o: any) => o.id);

      if (orderIdsNeedingItems.length > 0) {
        const { data: itemsFallback } = await supabase
          .from('client_order_items')
          .select(`
            id,
            client_order_id,
            quantity,
            unit_price,
            selling_price,
            dsp_price,
            rsp_price,
            variant:variants(
              name,
              variant_type,
              brand:brands(name),
              main_inventory(selling_price, unit_price)
            )
          `)
          .in('client_order_id', orderIdsNeedingItems);

        (itemsFallback || []).forEach((row: any) => {
          const list = ordersWithEmbeddedItems[row.client_order_id] || [];
          list.push({
            id: row.id,
            quantity: row.quantity,
            unit_price: row.unit_price,
            variant: row.variant || null,
          });
          ordersWithEmbeddedItems[row.client_order_id] = list;
        });

        console.log('Fetched items fallback:', itemsFallback?.length || 0, 'items for', orderIdsNeedingItems.length, 'orders');
      }

      // Debug: Log orders with items
      console.log('Orders with embedded items:', Object.keys(ordersWithEmbeddedItems).length);

      const transformedOrders: Order[] = (ordersData || []).map((order: any) => {
        const rawItems = ordersWithEmbeddedItems[order.id] || [];
        const items = rawItems.map((item: any) => {
          // Handle variant data - check if it's an object or nested
          const variant = item.variant || {};
          const brand = variant.brand || {};
          const brandName = (typeof brand === 'object' && brand.name) ? brand.name : (typeof brand === 'string' ? brand : 'Unknown');

          const inv = Array.isArray(variant?.main_inventory) ? variant.main_inventory[0] : variant?.main_inventory;
          const selling = inv?.selling_price;
          const cost = inv?.unit_price;
          const effectiveUnit = (order.status === 'approved') ? ((typeof selling === 'number') ? selling : (typeof cost === 'number' ? cost : item.unit_price)) : item.unit_price;

          return {
            id: item.id,
            brandName: brandName,
            variantName: variant?.name || 'Unknown',
            variantType: variant?.variant_type || 'flavor',
            quantity: item.quantity || 0,
            unitPrice: effectiveUnit || item.unit_price || 0,
            total: (item.quantity || 0) * (effectiveUnit || item.unit_price || 0),
          };
        });

        // Debug log for orders with no items
        if (items.length === 0 && rawItems.length > 0) {
          console.warn('Order', order.order_number, 'has raw items but transformed to empty:', rawItems);
        }

        const approvedTotal = items.reduce((sum: number, it: any) => sum + it.total, 0);

        return {
          id: order.id,
          orderNumber: order.order_number,
          agentId: order.agent_id,
          agentName: order.agent?.full_name || 'Unknown Agent',
          clientId: order.client_id,
          clientName: order.client?.name || clientIdToName[order.client_id] || 'Unknown Client',
          clientAccountType: order.client_account_type || 'Standard Accounts',
          date: order.order_date,
          items,
          subtotal: order.subtotal,
          tax: order.tax_amount,
          discount: order.discount || 0,
          total: order.status === 'approved' ? approvedTotal + (order.tax_amount || 0) - (order.discount || 0) : order.total_amount,
          notes: order.notes || '',
          status: order.status,
          stage: order.stage,
          signatureUrl: order.signature_url || undefined,
          paymentMethod: order.payment_method || undefined,
          paymentProofUrl: order.payment_proof_url || undefined,
        };
      });

      setOrders(transformedOrders);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  // Use the user from AuthContext instead of listening to onAuthStateChange directly
  // This ensures we only fetch orders AFTER the profile has been fully loaded and the user is "ready"
  const { user } = useContext(AuthContext) || {};

  useEffect(() => {
    // Only fetch orders if we have a user (deferred until after auth)
    if (user) {
      console.log('📦 [OrderProvider] User authenticated and profile loaded, fetching orders...');
      fetchOrders();
    } else {
      setLoading(false);
    }

    // Real-time subscriptions - listen for INSERT, UPDATE, DELETE events
    const channel = supabase
      .channel('client_orders_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'client_orders',
        },
        (payload) => {
          console.log('📬 Order change detected:', payload.eventType);
          // Refetch orders when any change occurs
          fetchOrders();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_order_items',
        },
        (payload) => {
          console.log('📬 Order item change detected:', payload.eventType);
          // Refetch orders when items change too
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]); // Depend on user from AuthContext

  const addOrder = async (order: Order) => {
    try {
      console.log('📝 Creating order:', order);

      // 1. Fetch client's account_type
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('account_type')
        .eq('id', order.clientId)
        .single();

      if (clientError) {
        console.error('Error fetching client account type:', clientError);
        throw clientError;
      }

      const clientAccountType = clientData?.account_type || 'Standard Accounts';
      console.log('👤 Client account type:', clientAccountType);

      // 2. Generate unique order number from database function
      const { data: orderNumberData, error: numberError } = await supabase
        .rpc('generate_order_number');

      if (numberError) {
        console.error('Error generating order number:', numberError);
        throw numberError;
      }

      const generatedOrderNumber = orderNumberData as string;
      console.log('🔢 Generated order number:', generatedOrderNumber);

      // 3. Insert into client_orders table
      const { data: newOrder, error: orderError } = await supabase
        .from('client_orders')
        .insert({
          order_number: generatedOrderNumber, // Use database-generated number
          agent_id: order.agentId,
          client_id: order.clientId,
          client_account_type: clientAccountType,
          order_date: order.date,
          subtotal: order.subtotal,
          tax_rate: 0,
          tax_amount: order.tax,
          discount: order.discount,
          total_amount: order.total,
          notes: order.notes,
          signature_url: (order as any).signatureUrl || null, // Include signature URL if provided
          payment_method: (order as any).paymentMethod || null, // Include payment method if provided
          payment_proof_url: (order as any).paymentProofUrl || null, // Include payment proof URL if provided
          status: 'pending',
          stage: 'agent_pending' // Set stage explicitly for two-stage approval
        } as any)
        .select('id, order_number')
        .single();

      if (orderError) {
        console.error('Error creating order:', orderError);
        throw orderError;
      }

      if (!newOrder) {
        throw new Error('Failed to create order - no ID returned');
      }

      console.log('✅ Order created with ID:', newOrder.id, 'Number:', newOrder.order_number);

      // 3. Fetch agent inventory prices for each item to capture selling_price, dsp_price, and rsp_price
      const orderItemsWithPrices = await Promise.all(
        order.items.map(async (item) => {
          // Fetch agent inventory to get the prices at time of order
          const { data: agentInv } = await supabase
            .from('agent_inventory')
            .select('selling_price, dsp_price, rsp_price, allocated_price')
            .eq('agent_id', order.agentId)
            .eq('variant_id', item.id)
            .maybeSingle();

          return {
            client_order_id: newOrder.id,
            variant_id: item.id,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            selling_price: item.sellingPrice ?? agentInv?.selling_price ?? null,
            dsp_price: item.dspPrice ?? agentInv?.dsp_price ?? null,
            rsp_price: item.rspPrice ?? agentInv?.rsp_price ?? null
          };
        })
      );

      const { error: itemsError } = await supabase
        .from('client_order_items')
        .insert(orderItemsWithPrices as any);

      if (itemsError) {
        console.error('Error creating order items:', itemsError);
        throw itemsError;
      }

      console.log('✅ Order items created:', orderItemsWithPrices.length);

      // 4. Deduct stock from agent inventory (for pending orders)
      console.log('📉 Deducting from agent inventory...');
      for (const item of order.items) {
        // Get current agent inventory stock
        const { data: agentInv, error: getError } = await supabase
          .from('agent_inventory')
          .select('stock, id')
          .eq('agent_id', order.agentId)
          .eq('variant_id', item.id)
          .maybeSingle();

        if (getError) {
          console.error('Error fetching agent inventory:', getError);
          throw getError;
        }

        if (!agentInv) {
          throw new Error(`Agent inventory not found for variant ${item.id}`);
        }

        const currentStock = agentInv.stock as number;
        const newStock = currentStock - item.quantity;

        if (currentStock < item.quantity) {
          throw new Error(`Insufficient agent inventory. Available: ${currentStock}, Required: ${item.quantity}`);
        }

        console.log(`📊 Current stock: ${currentStock}, Deducting: ${item.quantity}, New stock: ${newStock}`);

        // Update agent inventory
        const { data: updateResult, error: updateError } = await supabase
          .from('agent_inventory')
          .update({
            stock: newStock,
            updated_at: new Date().toISOString()
          } as any)
          .eq('agent_id', order.agentId)
          .eq('variant_id', item.id)
          .select();

        if (updateError) {
          console.error('Error updating agent inventory:', updateError);
          throw updateError;
        }

        console.log(`✅ Deducted ${item.quantity} from agent inventory. Update result:`, updateResult);
      }

      console.log('✅ All agent inventory updates complete');

      // Return the generated order number so the UI can show it
      return newOrder.order_number;
    } catch (err) {
      console.error('Error adding order:', err);
      throw err;
    }
  };

  const updateOrderStatus = async (orderId: string, status: 'pending' | 'approved' | 'rejected') => {
    try {
      console.log(`📋 Updating order ${orderId} to status: ${status}`);

      // Get current user ID for approver tracking
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (status === 'approved') {
        // Use database function for approval (handles inventory deduction)
        const { data, error } = await supabase
          .rpc('approve_client_order', {
            p_order_id: orderId,
            p_approver_id: user.id
          });

        if (error) {
          console.error('Error approving order:', error);
          throw error;
        }

        if (!data || !data.success) {
          throw new Error(data?.error || 'Failed to approve order');
        }

        console.log('✅ Order approved:', data);
      } else if (status === 'rejected') {
        // Use database function for rejection (handles inventory return)
        const { data, error } = await supabase
          .rpc('reject_client_order', {
            p_order_id: orderId,
            p_approver_id: user.id,
            p_reason: null
          });

        if (error) {
          console.error('Error rejecting order:', error);
          throw error;
        }

        if (!data || !data.success) {
          throw new Error(data?.error || 'Failed to reject order');
        }

        console.log('✅ Order rejected:', data);

        // REMOVED: Double restoration logic that was causing stock to go from 5 to 15 instead of 10
        // The database function reject_client_order() already handles stock restoration properly
        // This frontend code was causing double restoration:
        // 1. Database function: 5 + 5 = 10 ✅
        // 2. Frontend code: 10 + 5 = 15 ❌ (double restoration!)
        console.log('✅ Order rejected via database function - stock restoration handled automatically');
      } else {
        // For other status changes, update directly
        const { error } = await supabase
          .from('client_orders')
          .update({ status } as any)
          .eq('id', orderId);

        if (error) throw error;
      }

      console.log(`✅ Order ${orderId} status updated to ${status}`);

      // Optimistically update local state so UI reflects changes immediately
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));

      // Real-time will handle the UI update
    } catch (err: any) {
      console.error('Error updating order status:', err);
      throw new Error(err.message || 'Failed to update order status');
    }
  };

  const getOrdersByAgent = (agentId: string) => {
    return orders.filter(order => order.agentId === agentId);
  };

  const getAllOrders = () => {
    return orders;
  };

  return (
    <OrderContext.Provider value={{ orders, loading, addOrder, updateOrderStatus, getOrdersByAgent, getAllOrders }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrders must be used within OrderProvider');
  }
  return context;
}
