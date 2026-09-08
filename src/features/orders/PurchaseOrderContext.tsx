import { useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { sendNotification, sendNotificationToCompanyRoles } from '@/features/shared/lib/notification.helpers';
import type { PurchaseOrder, PurchaseOrderItem, Supplier } from './types';
import { PurchaseOrderContext } from './hooks';
import type { PurchaseOrderWritePayload } from './hooks';

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
  const rawAssignedTeamLeader = Array.isArray(order.assigned_team_leader)
    ? order.assigned_team_leader[0]
    : order.assigned_team_leader;
  const rawCancelledByUser = Array.isArray(order.cancelled_by_user)
    ? order.cancelled_by_user[0]
    : order.cancelled_by_user;

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
    assigned_team_leader: rawAssignedTeamLeader ?? null,
    cancelled_by_user: rawCancelledByUser ?? null,
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
          id, created_at, supplier_id, fulfillment_type, warehouse_company_id, warehouse_location_id, subtotal, tax_rate, tax_amount, discount, total_amount, status, company_id, po_number, order_date, expected_delivery_date, notes, cancellation_reason, created_by, approved_by, approved_at, updated_at,
          company_account_type, workflow_status, rfpf_number, dr_number, po_order_kind, source_rebate_id,
          kam_id, assigned_team_leader_id,
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
          assigned_team_leader:profiles!purchase_orders_assigned_team_leader_id_fkey(full_name,email),
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
      } else if (user?.role === 'team_leader' && user.id) {
        poQuery = poQuery.eq('created_by', user.id);
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
    assigned_team_leader_id?: string | null;
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
        const isTeamLeaderCreator = user.role === 'team_leader';
        if (isTeamLeaderCreator) {
          if (!linkedWarehouseCompanyId && !orderData.warehouse_company_id) {
            return { success: false, error: 'Warehouse hub is not configured for this company' };
          }
          if (orderData.fulfillment_type !== 'warehouse_transfer') {
            return { success: false, error: 'Team leaders can only request warehouse transfer purchase orders' };
          }
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
          if (isTeamLeaderCreator) {
            if (orderData.assigned_team_leader_id && orderData.assigned_team_leader_id !== user.id) {
              return { success: false, error: 'Team leaders can only create purchase orders assigned to themselves' };
            }
          } else if (!orderData.assigned_team_leader_id) {
            return { success: false, error: 'Receiving team leader is required for internal transfers' };
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
            status: isTeamLeaderCreator ? 'draft' : 'pending',
            notes: orderData.notes,
            created_by: user.id,
            assigned_team_leader_id:
              orderData.fulfillment_type === 'warehouse_transfer'
                ? (isTeamLeaderCreator ? user.id : orderData.assigned_team_leader_id)
                : null,
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

        const hubLinked =
          orderData.fulfillment_type === 'warehouse_transfer' &&
          !!(orderData.warehouse_company_id || linkedWarehouseCompanyId);
        const assignedTlId = isTeamLeaderCreator
          ? null
          : hubLinked && orderData.assigned_team_leader_id
            ? orderData.assigned_team_leader_id
            : null;

        if (isTeamLeaderCreator && user.company_id) {
          void sendNotificationToCompanyRoles({
            companyId: user.company_id,
            roles: ['super_admin'],
            type: 'stock_request_created',
            title: 'Team Leader PO request',
            message: `${poNumber} from ${user.full_name || 'a team leader'} is waiting for your approval.`,
            referenceType: 'purchase_order',
            referenceId: newPO.id,
          });
          toast({
            title: 'Purchase order submitted',
            description: `${poNumber} is waiting for Super Admin approval before it goes to the warehouse.`,
          });
        } else {
          let assignedTlName: string | null = null;
          if (assignedTlId) {
            const { data: tlProfile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', assignedTlId)
              .maybeSingle();
            assignedTlName = String(tlProfile?.full_name || '').trim() || null;

            if (user.company_id) {
              void sendNotification({
                userId: assignedTlId,
                companyId: user.company_id,
                type: 'purchase_order_approved',
                title: 'Purchase Order Assigned',
                message: `${poNumber} was assigned to you for receiving. Open PO Receiving when the warehouse dispatches stock.`,
                referenceType: 'purchase_order',
                referenceId: newPO.id,
              });
            }
          }

          if (assignedTlId) {
            toast({
              title: 'PO assigned to Team Leader',
              description: `${poNumber} is assigned to ${assignedTlName || 'the selected team leader'} for receiving after warehouse fulfills.`,
            });
          } else {
            toast({
              title: 'Success',
              description: `Purchase Order ${poNumber} created successfully`,
            });
          }
        }

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

  const updatePurchaseOrder = async (poId: string, orderData: PurchaseOrderWritePayload) => {
    try {
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }
      if (!user.company_id) {
        return { success: false, error: 'User company information not found' };
      }

      const existing = purchaseOrders.find((order) => order.id === poId);
      if (!existing) {
        return { success: false, error: 'Purchase order not found' };
      }
      if (existing.created_by !== user.id) {
        return { success: false, error: 'Only the creator can edit this purchase order' };
      }
      if (existing.status !== 'draft') {
        return { success: false, error: 'This purchase order can only be edited before Super Admin approval' };
      }
      if (existing.fulfillment_type !== 'warehouse_transfer') {
        return { success: false, error: 'Only warehouse transfer drafts can be edited' };
      }
      if (orderData.fulfillment_type !== 'warehouse_transfer') {
        return { success: false, error: 'Team leader purchase orders must stay as warehouse transfers' };
      }
      if (!orderData.warehouse_company_id && !linkedWarehouseCompanyId) {
        return { success: false, error: 'Warehouse hub is not configured for this company' };
      }

      const hasHeaderLocation = !!orderData.warehouse_location_id;
      const hasItemLocations = (orderData.items || []).every((it) => !!it.warehouse_location_id);
      if (!hasHeaderLocation && !hasItemLocations) {
        return { success: false, error: 'Warehouse location is required for internal transfers' };
      }
      if ((orderData.items || []).length === 0) {
        return { success: false, error: 'Please add at least one item' };
      }

      const subtotal = orderData.items.reduce(
        (sum, item) => sum + item.quantity * item.unit_price,
        0
      );
      const tax_amount = (subtotal * orderData.tax_rate) / 100;
      const total_amount = subtotal + tax_amount - orderData.discount;
      const warehouseCompanyId =
        orderData.warehouse_company_id || linkedWarehouseCompanyId || existing.warehouse_company_id;

      const { data: updated, error: poError } = await supabase
        .from('purchase_orders')
        .update({
          warehouse_company_id: warehouseCompanyId,
          warehouse_location_id: orderData.warehouse_location_id ?? null,
          order_date: orderData.order_date,
          expected_delivery_date: orderData.expected_delivery_date,
          subtotal,
          tax_rate: orderData.tax_rate,
          tax_amount,
          discount: orderData.discount,
          total_amount,
          notes: orderData.notes,
        })
        .eq('id', poId)
        .eq('created_by', user.id)
        .eq('status', 'draft')
        .select('id, po_number')
        .maybeSingle();

      if (poError) throw poError;
      if (!updated) {
        return { success: false, error: 'Purchase order could not be updated. Super Admin may have already approved it.' };
      }

      const { error: deleteError } = await supabase
        .from('purchase_order_items')
        .delete()
        .eq('purchase_order_id', poId)
        .eq('company_id', user.company_id);

      if (deleteError) throw deleteError;

      const itemsToInsert = orderData.items.map((item) => ({
        company_id: user.company_id,
        purchase_order_id: poId,
        variant_id: item.variant_id,
        warehouse_location_id: item.warehouse_location_id ?? orderData.warehouse_location_id ?? null,
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
        purchaseOrderId: poId,
        eventType: 'updated',
        note: 'Draft purchase order was edited before Super Admin approval.',
        lines: orderData.items.map((item) => ({
          variant_id: item.variant_id,
          quantity: item.quantity,
        })),
        createdBy: user.id,
      });

      toast({
        title: 'Purchase order updated',
        description: `${updated.po_number} was saved. Super Admin still needs to approve it.`,
      });

      scheduleBackgroundRefresh();
      return { success: true };
    } catch (error: any) {
      console.error('Error updating purchase order:', error);
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

      const { data: poRow, error: poRowErr } = await supabase
        .from('purchase_orders')
        .select(
          'po_number,company_id,created_by,assigned_team_leader_id,fulfillment_type,warehouse_company_id,warehouse_location_id'
        )
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

      const poNumber = String(data.po_number || poRow?.po_number || 'PO');
      const notifyCompanyId = (poRow?.company_id as string | null) || user.company_id;
      const hubLinkedOnPo =
        poRow?.fulfillment_type === 'warehouse_transfer' && !!poRow?.warehouse_company_id;

      let notifiedCreator = false;
      let notifiedTl = false;

      if (hubLinkedOnPo && notifyCompanyId) {
        const createdBy = poRow?.created_by ? String(poRow.created_by) : null;
        const assignedTlId = poRow?.assigned_team_leader_id
          ? String(poRow.assigned_team_leader_id)
          : null;

        if (createdBy && createdBy !== user.id) {
          void sendNotification({
            userId: createdBy,
            companyId: notifyCompanyId,
            type: 'purchase_order_approved',
            title: 'Purchase Order Approved',
            message: `${poNumber} was approved by warehouse and reserved for fulfillment.`,
            referenceType: 'purchase_order',
            referenceId: poId,
          });
          notifiedCreator = true;
        }

        if (assignedTlId && assignedTlId !== user.id) {
          void sendNotification({
            userId: assignedTlId,
            companyId: notifyCompanyId,
            type: 'purchase_order_approved',
            title: 'PO Approved — Awaiting Dispatch',
            message: `${poNumber} was approved. Open PO Receiving when the warehouse dispatches stock.`,
            referenceType: 'purchase_order',
            referenceId: poId,
          });
          notifiedTl = true;
        }
      }

      let approveDescription =
        rpcName === 'approve_warehouse_transfer_po'
          ? `${poNumber} approved — stock moved from warehouse to client company`
          : rpcName === 'approve_multi_location_po'
            ? `${poNumber} approved — reserved for fulfillment by requested warehouses`
            : `${poNumber} has been approved and added to inventory`;

      if (notifiedCreator && notifiedTl) {
        approveDescription += '. Creator and team leader were notified.';
      } else if (notifiedCreator) {
        approveDescription += '. Creator was notified.';
      } else if (notifiedTl) {
        approveDescription += '. Team leader was notified.';
      }

      toast({
        title: 'Purchase Order Approved',
        description: approveDescription,
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

  const submitTeamLeaderPurchaseOrder = async (poId: string) => {
    try {
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      const { data, error } = await supabase.rpc('submit_team_leader_transfer_po', {
        p_po_id: poId,
      });
      if (error) throw error;
      if (!data?.success) {
        return { success: false, error: data?.error || 'Failed to approve purchase order' };
      }

      const { data: poRow } = await supabase
        .from('purchase_orders')
        .select('po_number, company_id, created_by, assigned_team_leader_id')
        .eq('id', poId)
        .maybeSingle();

      const poNumber = String(data.po_number || poRow?.po_number || 'PO');
      const notifyCompanyId = (poRow?.company_id as string | null) || user.company_id;
      const createdBy = poRow?.created_by ? String(poRow.created_by) : null;

      const { logPurchaseOrderEvent } = await import('./purchaseOrderEventsApi');
      void logPurchaseOrderEvent({
        purchaseOrderId: poId,
        eventType: 'admin_submitted',
        note: 'Super Admin approved this Team Leader PO and sent it to the warehouse.',
        createdBy: user.id,
      });

      if (notifyCompanyId && createdBy && createdBy !== user.id) {
        void sendNotification({
          userId: createdBy,
          companyId: notifyCompanyId,
          type: 'stock_request_approved',
          title: 'Purchase Order Approved',
          message: `${poNumber} was approved and sent to the warehouse.`,
          referenceType: 'purchase_order',
          referenceId: poId,
        });
      }

      toast({
        title: 'Purchase Order Approved',
        description: `${poNumber} was sent to the warehouse for fulfillment.`,
      });
      scheduleBackgroundRefresh();
      return { success: true };
    } catch (error: any) {
      console.error('Error submitting team leader purchase order:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve purchase order',
        variant: 'destructive',
      });
      return { success: false, error: error.message };
    }
  };

  const rejectTeamLeaderPurchaseOrder = async (poId: string, reason?: string) => {
    try {
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      const trimmedReason = reason?.trim() || '';
      if (!trimmedReason) {
        return { success: false, error: 'Please enter a reason' };
      }

      const { data, error } = await supabase.rpc('reject_team_leader_transfer_po', {
        p_po_id: poId,
        p_reason: trimmedReason,
      });
      if (error) throw error;
      if (!data?.success) {
        return { success: false, error: data?.error || 'Failed to cancel purchase order' };
      }

      const { data: poRow } = await supabase
        .from('purchase_orders')
        .select('po_number, company_id, created_by')
        .eq('id', poId)
        .maybeSingle();

      const poNumber = String(data.po_number || poRow?.po_number || 'PO');
      const notifyCompanyId = (poRow?.company_id as string | null) || user.company_id;
      const createdBy = poRow?.created_by ? String(poRow.created_by) : null;

      const { logPurchaseOrderEvent } = await import('./purchaseOrderEventsApi');
      void logPurchaseOrderEvent({
        purchaseOrderId: poId,
        eventType: 'rejected',
        note: trimmedReason,
        createdBy: user.id,
      });

      if (notifyCompanyId && createdBy && createdBy !== user.id) {
        void sendNotification({
          userId: createdBy,
          companyId: notifyCompanyId,
          type: 'stock_request_rejected',
          title: 'Purchase Order Cancelled',
          message: `${poNumber} was cancelled by Super Admin. Reason: ${trimmedReason}`,
          referenceType: 'purchase_order',
          referenceId: poId,
        });
      }

      toast({ title: 'Purchase Order Cancelled', description: `${poNumber} was cancelled.` });
      scheduleBackgroundRefresh();
      return { success: true };
    } catch (error: any) {
      console.error('Error cancelling team leader purchase order:', error);
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
        updatePurchaseOrder,
        approvePurchaseOrder,
        rejectPurchaseOrder,
        submitTeamLeaderPurchaseOrder,
        rejectTeamLeaderPurchaseOrder,
      }}
    >
      {children}
    </PurchaseOrderContext.Provider>
  );
}
