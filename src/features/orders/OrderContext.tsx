import { createContext, useContext, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { sendNotification } from '@/features/shared/lib/notification.helpers';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AuthContext } from '@/features/auth/hooks';

export interface OrderItem {
  id: string;
  brandName: string;
  variantName: string;
  variantType: 'flavor' | 'battery' | 'posm';
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
  stage?: 'agent_pending' | 'finance_pending' | 'leader_approved' | 'admin_approved' | 'leader_rejected' | 'admin_rejected';
  signatureUrl?: string;
  paymentMethod?: 'GCASH' | 'BANK_TRANSFER' | 'CASH';
  paymentProofUrl?: string;
  pricingStrategy?: 'rsp' | 'dsp' | 'special';
}

interface OrderContextType {
  orders: Order[];
  loading: boolean;
  addOrder: (order: Order) => Promise<string>;
  updateOrderStatus: (orderId: string, status: 'pending' | 'approved' | 'rejected', reason?: string) => Promise<void>;
  getOrdersByAgent: (agentId: string) => Order[];
  getAllOrders: () => Order[];
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

// Fetcher function for orders
const fetchOrders = async (companyId?: string): Promise<Order[]> => {
  if (!companyId) return [];
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
      pricing_strategy,
      created_at,
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
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Fallback: build a clientId -> clientName map
  const clientIds: string[] = Array.from(new Set((ordersData || []).map((o: any) => o.client_id).filter(Boolean)));
  let clientIdToName: Record<string, string> = {};
  if (clientIds.length > 0) {
    const { data: clientsLookup } = await supabase
      .from('clients')
      .select('id, name')
      .eq('company_id', companyId)
      .in('id', clientIds);
    (clientsLookup || []).forEach((c: any) => { clientIdToName[c.id] = c.name; });
  }

  const ordersWithEmbeddedItems: Record<string, any[]> = {};
  (ordersData || []).forEach((o: any) => {
    ordersWithEmbeddedItems[o.id] = Array.isArray(o.items) ? o.items : [];
  });

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
  }

  return (ordersData || []).map((order: any) => {
    const rawItems = ordersWithEmbeddedItems[order.id] || [];
    const items = rawItems.map((item: any) => {
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
      pricingStrategy: order.pricing_strategy || undefined,
    };
  });
};

export function OrderProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { user } = useContext(AuthContext) || {};

  const { data: orders = [], isLoading: loading } = useQuery({
    queryKey: ['orders', user?.company_id],
    queryFn: () => fetchOrders(user?.company_id),
    enabled: !!user?.company_id,
  });

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('client_orders_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_orders' },
        () => {
          qc.invalidateQueries({ queryKey: ['orders'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_order_items' },
        () => {
          qc.invalidateQueries({ queryKey: ['orders'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  const addOrderMutation = useMutation({
    mutationFn: async (order: Order) => {
      // 1. Fetch client's company_id (needed for notifications)
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('company_id, account_type')
        .eq('id', order.clientId)
        .single();

      if (clientError) throw clientError;
      const companyId = clientData?.company_id;
      const clientAccountType = clientData?.account_type || 'Standard Accounts';
      if (!companyId) throw new Error('Could not determine company_id for the order');

      // 2. Prepare items for RPC
      // The RPC expects an array of variant details
      const rpcItems = order.items.map(item => ({
        variant_id: item.id,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        selling_price: item.sellingPrice || null,
        dsp_price: item.dspPrice || null,
        rsp_price: item.rspPrice || null,
        total_price: item.total
      }));

      // 3. Call RPC to create order and deduct stock
      const { data, error: rpcError } = await supabase.rpc('create_client_order_v2', {
        p_agent_id: order.agentId,
        p_client_id: order.clientId,
        p_items: rpcItems,
        p_notes: order.notes,
        p_signature_url: (order as any).signatureUrl || null,
        p_payment_method: (order as any).paymentMethod || null,
        p_payment_proof_url: (order as any).paymentProofUrl || null,
        p_pricing_strategy: (order as any).pricingStrategy || 'rsp',
        p_order_date: order.date
      });

      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error(data?.message || 'Failed to create order');

      const { id: serverId, order_number: orderNumber } = data.data;

      // 4. Notify Finance/Admin
      try {
        const { data: staffProfiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('company_id', companyId)
          .in('role', ['finance', 'admin'])
          .eq('status', 'active');

        if (staffProfiles && staffProfiles.length > 0) {
          const { data: agentProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', order.agentId)
            .single();

          const notificationPromises = staffProfiles.map(staff =>
            sendNotification({
              userId: staff.id,
              companyId: companyId,
              type: 'order_created',
              title: 'New Order Received',
              message: `${agentProfile?.full_name || 'An agent'} has created a new order #${orderNumber}.`,
              referenceType: 'order',
              referenceId: serverId
            })
          );
          await Promise.all(notificationPromises);
        }
      } catch (err) {
        console.error('Failed to notify staff of new order:', err);
      }

      return { serverId, orderNumber, clientAccountType };
    },
    onMutate: async (newOrder) => {
      await qc.cancelQueries({ queryKey: ['orders'] });
      const previousOrders = qc.getQueryData<Order[]>(['orders']);

      const optimisticOrder: Order = {
        ...newOrder,
        id: 'temp-' + Date.now(),
        orderNumber: 'PENDING...',
        status: 'pending',
        stage: 'finance_pending',
      };

      qc.setQueryData(['orders'], (old: Order[] | undefined) => [optimisticOrder, ...(old || [])]);
      return { previousOrders };
    },
    onError: (err, newOrder, context) => {
      if (context?.previousOrders) {
        qc.setQueryData(['orders'], context.previousOrders);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, reason }: { orderId: string, status: 'pending' | 'approved' | 'rejected', reason?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (status === 'approved') {
        const { data, error } = await supabase.rpc('approve_client_order', {
          p_order_id: orderId,
          p_approver_id: user.id
        });
        if (error) throw error;
        if (!data?.success) {
          console.error('Approval RPC returned failure:', data);
          throw new Error(data?.message || data?.error || JSON.stringify(data) || 'Failed to approve order');
        }

        // Notify Agent
        try {
          const { data: orderData } = await supabase
            .from('client_orders')
            .select('agent_id, company_id, order_number')
            .eq('id', orderId)
            .single();

          if (orderData) {
            await sendNotification({
              userId: orderData.agent_id,
              companyId: orderData.company_id,
              type: 'order_approved',
              title: 'Order Approved',
              message: `Your order #${orderData.order_number} has been approved.`,
              referenceType: 'order',
              referenceId: orderId
            });
          }
        } catch (err) {
          console.error('Failed to notify agent of order approval:', err);
        }
      } else if (status === 'rejected') {
        const { data, error } = await supabase.rpc('reject_client_order', {
          p_order_id: orderId,
          p_approver_id: user.id,
          p_reason: reason || null
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.message || 'Failed to reject order');

        // Notify Agent
        try {
          const { data: orderData } = await supabase
            .from('client_orders')
            .select('agent_id, company_id, order_number')
            .eq('id', orderId)
            .single();

          if (orderData) {
            await sendNotification({
              userId: orderData.agent_id,
              companyId: orderData.company_id,
              type: 'order_rejected',
              title: 'Order Rejected',
              message: `Your order #${orderData.order_number} has been rejected.`,
              referenceType: 'order',
              referenceId: orderId
            });
          }
        } catch (err) {
          console.error('Failed to notify agent of order rejection:', err);
        }
      } else {
        const { error } = await supabase.from('client_orders').update({ status } as any).eq('id', orderId);
        if (error) throw error;
      }
    },
    onMutate: async ({ orderId, status }) => {
      await qc.cancelQueries({ queryKey: ['orders'] });
      const previousOrders = qc.getQueryData<Order[]>(['orders']);

      qc.setQueryData(['orders'], (old: Order[] | undefined) =>
        old?.map(o => o.id === orderId ? { ...o, status } : o)
      );

      return { previousOrders };
    },
    onError: (err, variables, context) => {
      if (context?.previousOrders) {
        qc.setQueryData(['orders'], context.previousOrders);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
    }
  });

  const addOrder = async (order: Order) => {
    const result = await addOrderMutation.mutateAsync(order);
    return result.orderNumber;
  };

  const updateOrderStatus = async (orderId: string, status: 'pending' | 'approved' | 'rejected', reason?: string) => {
    await updateStatusMutation.mutateAsync({ orderId, status, reason });
  };

  const getOrdersByAgent = useCallback((agentId: string) => {
    return orders.filter(order => order.agentId === agentId);
  }, [orders]);

  const getAllOrders = useCallback(() => {
    return orders;
  }, [orders]);

  return (
    <OrderContext.Provider value={{
      orders,
      loading,
      addOrder,
      updateOrderStatus,
      getOrdersByAgent,
      getAllOrders
    }}>
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
