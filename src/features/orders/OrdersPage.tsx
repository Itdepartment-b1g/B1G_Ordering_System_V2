import { useEffect, useMemo, useState, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Search, CheckCircle, XCircle, Eye, Package, ChevronLeft, ChevronRight, CheckSquare, FileText, AlertCircle, Filter, Download, Upload, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useOrders, type Order } from './OrderContext';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { exportClientsToExcel } from '@/lib/excel.helpers';
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
import * as XLSX from 'xlsx';

//orderpage
export default function OrdersPage() {
  const { getAllOrders, updateOrderStatus } = useOrders();
  const orders = getAllOrders();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("all");
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [orderToApprove, setOrderToApprove] = useState<Order | null>(null);
  const [orderToReject, setOrderToReject] = useState<Order | null>(null);
  const { toast } = useToast();

  // Client details for View dialog
  const [clientDetails, setClientDetails] = useState<any | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);

  // Rejection reason dialog
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectingForRole, setRejectingForRole] = useState<'leader' | 'admin' | null>(null);

  // Role flags and leader team state
  // Role flags
  const isAdmin = user?.role === 'admin' || user?.role === 'finance' || user?.role === 'super_admin';
  const isFinance = user?.role === 'finance';
  const isLeader = user?.role === 'team_leader';
  
  // Team member IDs for leader filtering
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);
  const [loadingTeamMembers, setLoadingTeamMembers] = useState(false);
  // Team agents with names for summary display
  const [teamAgents, setTeamAgents] = useState<Array<{ id: string; name: string }>>([]);

  // Bulk approval states
  const [bulkApproveDialogOpen, setBulkApproveDialogOpen] = useState(false);
  const [selectedAgentForBulk, setSelectedAgentForBulk] = useState<string>('');
  const [agentOrders, setAgentOrders] = useState<Order[]>([]);
  const [viewingOrderInBulk, setViewingOrderInBulk] = useState<Order | null>(null);
  const [bulkViewDialogOpen, setBulkViewDialogOpen] = useState(false);
  const [bulkClientDetails, setBulkClientDetails] = useState<any | null>(null);
  const [loadingBulkClient, setLoadingBulkClient] = useState(false);
  const [processingBulkApproval, setProcessingBulkApproval] = useState(false);

  // Import orders preview state
  type ImportOrder = {
    order_number: string;
    order_date: string;
    agent_id: string | null;
    agent_name: string | null;
    client_id: string | null;
    client_name: string | null;
    subtotal: number;
    tax: number;
    discount: number;
    total_amount: number;
    status: string;
    stage: string;
    payment_method: string | null;
    bank_type: string | null;
    deposit_id: string | null;
    notes: string | null;
  };

  type ImportOrderItem = {
    order_number: string;
    item_brand_name: string | null;
    item_variant_name: string | null;
    item_variant_type: string | null;
    item_quantity: number;
    item_unit_price: number;
    item_pricing_strategy: string | null;
  };

  const [importOrders, setImportOrders] = useState<ImportOrder[]>([]);
  const [importOrderItems, setImportOrderItems] = useState<ImportOrderItem[]>([]);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importingOrders, setImportingOrders] = useState(false);

  // Normalize free-text names from CSV / DB so we are resilient to
  // casing and spacing differences (e.g. double spaces).
  const normalizeName = (value: string | null | undefined): string => {
    return (value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  // Normalize variant type values from CSV / DB so we accept
  // different casings like "flavor" / "Flavor" or "battery" / "Battery".
  const normalizeVariantType = (value: string | null | undefined): string => {
    const t = (value ?? '').trim().toLowerCase();
    if (t === 'flavor' || t === 'flavour') return 'flavor';
    if (t === 'battery') return 'battery';
    return t;
  };

  // Import / export references
  const importOrdersInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch team member IDs and names for leaders
  useEffect(() => {
    const fetchTeamMembers = async () => {
      if (!isLeader || !user?.id) {
        setTeamMemberIds([]);
        setTeamAgents([]);
        return;
      }

      try {
        setLoadingTeamMembers(true);
        const { data: teamData, error: teamError } = await supabase
          .from('leader_teams')
          .select(`
            agent_id,
            profiles!leader_teams_agent_id_fkey(
              id,
              full_name
            )
          `)
          .eq('leader_id', user.id);

        if (teamError) throw teamError;

        const memberIds = (teamData || []).map(t => t.agent_id);
        setTeamMemberIds(memberIds);

        // Build team agents array with names (include team leader's own name)
        const agents = (teamData || []).map((teamMember: any) => ({
          id: teamMember.agent_id,
          name: teamMember.profiles?.full_name || 'Unknown'
        }));
        
        // Add team leader's own entry to the agents list
        if (user?.id && user?.full_name) {
          agents.push({
            id: user.id,
            name: user.full_name
          });
        }
        
        setTeamAgents(agents);
      } catch (error) {
        console.error('Error fetching team members:', error);
        setTeamMemberIds([]);
        setTeamAgents([]);
      } finally {
        setLoadingTeamMembers(false);
      }
    };

    fetchTeamMembers();
  }, [isLeader, user?.id]);

  // Restrict visible orders based on role
  const visibleOrders = useMemo(() => {
    if (isAdmin) return orders;
    if (isLeader) {
      // Include team leader's own orders + team member orders
      const allAgentIds = user?.id ? [...teamMemberIds, user.id] : teamMemberIds;
      if (allAgentIds.length > 0) {
        return orders.filter(o => allAgentIds.includes(o.agentId));
      }
    }
    return [] as Order[];
  }, [orders, isAdmin, isLeader, teamMemberIds, user?.id]);

  // Team summary logic removed
  // Build team agent list (leaders only) from visible orders
  const teamAgentsSummary = useMemo(() => {
    if (!isLeader) return [] as { agentId: string; agentName: string; orders: number }[];
    const countByAgent: Record<string, number> = {};
    for (const o of visibleOrders) {
      countByAgent[o.agentId] = (countByAgent[o.agentId] || 0) + 1;
    }
    const list = teamAgents.map(a => ({ agentId: a.id, agentName: a.name, orders: countByAgent[a.id] || 0 }));
    return list.sort((a, b) => a.agentName.localeCompare(b.agentName));
  }, [visibleOrders, isLeader, teamAgents]);

  // Pending orders count (role-based) - matches the filterOrders logic
  const pendingOrdersCount = useMemo(() => {
    return visibleOrders.filter(o => o.stage === 'finance_pending' || o.status === 'pending').length;
  }, [visibleOrders]);

  // Approved orders (role-based) without search filters
  const approvedOrdersAll = useMemo(() => {
    return visibleOrders.filter(o => o.status === 'approved' || o.stage === 'admin_approved');
  }, [visibleOrders]);

  // Approved this month count based on system date
  const approvedThisMonthCount = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return approvedOrdersAll.filter(o => {
      const d = new Date(o.date);
      return d >= start && d < end;
    }).length;
  }, [approvedOrdersAll]);

  // Map legacy status + stage to a clearer label for display
  const getStatusLabel = (order: Order) => {
    if (order.stage === 'finance_pending' || order.status === 'pending') return 'Pending Finance Review';
    if (order.stage === 'admin_approved' || order.status === 'approved') return 'Approved';
    if (order.stage === 'admin_rejected' || order.status === 'rejected') return 'Rejected';
    return order.status;
  };

  const getStatusVariant = (order: Order) => {
    const label = getStatusLabel(order);
    if (label.startsWith('Approved')) return 'default';
    if (label.startsWith('Pending')) return 'secondary';
    return 'destructive';
  };

  const handleViewOrder = async (order: Order) => {
    setViewingOrder(order);
    setViewDialogOpen(true);
    // Fetch full client details using clientId
    if (!order.clientId) {
      setClientDetails(null);
      return;
    }
    try {
      setLoadingClient(true);
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, email, phone, company, address')
        .eq('id', order.clientId)
        .maybeSingle();
      if (error) throw error;
      setClientDetails(data || null);
    } catch (e) {
      console.error('Error loading client details:', e);
      setClientDetails(null);
    } finally {
      setLoadingClient(false);
    }
  };

  const handleOpenApprove = (order: Order) => {
    setOrderToApprove(order);
    setApproveDialogOpen(true);
  };

  const handleConfirmApprove = async () => {
    if (!orderToApprove) return;

    // Safety check: Block approval of cash/cheque orders (FULL or SPLIT) without deposit OR without bank details recorded
    let hasCashOrCheque = false;
    if (orderToApprove.paymentMode === 'SPLIT' && orderToApprove.paymentSplits) {
      hasCashOrCheque = orderToApprove.paymentSplits.some(s => s.method === 'CASH' || s.method === 'CHEQUE');
    } else {
      hasCashOrCheque = orderToApprove.paymentMethod === 'CASH' || orderToApprove.paymentMethod === 'CHEQUE';
    }

    if (hasCashOrCheque && (!orderToApprove.depositId || !orderToApprove.depositBankAccount)) {
      toast({
        title: 'Cannot Approve',
        description: orderToApprove.depositId
          ? 'The team leader must record the deposit details (bank account and reference number) before this order can be approved.'
          : 'Cash and Cheque orders require a deposit to be recorded by the team leader before they can be approved.',
        variant: 'destructive',
        duration: 7000
      });
      setApproveDialogOpen(false);
      setOrderToApprove(null);
      return;
    }

    try {
      if (isAdmin) {
        await updateOrderStatus(orderToApprove.id, 'approved');

        // Show appropriate success message
        const successMessage = hasCashOrCheque && orderToApprove.depositId
          ? 'Order approved and deposit verified.'
          : 'Order approval complete.';

        toast({
          title: 'Approved',
          description: successMessage
        });
      } else {
        throw new Error('Not authorized to approve');
      }
      setApproveDialogOpen(false);
      setOrderToApprove(null);
    } catch (error: any) {
      console.error('Error approving order:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve order.',
        variant: 'destructive',
        duration: 7000
      });
    }
  };

  const handleOpenReject = (order: Order) => {
    setOrderToReject(order);
    setRejectionReason('');
    setRejectingForRole('admin');
    setReasonDialogOpen(true);
  };

  const handleConfirmRejectWithReason = async () => {
    if (!orderToReject || !rejectingForRole) return;
    try {
      if (isAdmin) {
        await updateOrderStatus(orderToReject.id, 'rejected', rejectionReason);
        toast({ title: 'Rejected', description: 'Order rejected. Sales agent will be notified.' });
      }
      setReasonDialogOpen(false);
      setOrderToReject(null);
      setRejectingForRole(null);
    } catch (error: any) {
      console.error('Reject error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to reject', variant: 'destructive' });
    }
  };

  // Helper: does an order use the given payment method?
  // Includes BOTH full payments and split payments.
  const orderMatchesPaymentMethod = (order: Order, method: string) => {
    if (!method || method === 'all') return true;

    // Full payment (or legacy orders without paymentMode)
    if (order.paymentMode !== 'SPLIT') {
      return order.paymentMethod === method;
    }

    // Split payment – check any split method
    if (Array.isArray(order.paymentSplits)) {
      return order.paymentSplits.some((s) => s.method === method);
    }

    return false;
  };

  const filterOrders = (status?: Order['status']) => {
    let filtered = visibleOrders;
    if (status) {
      if (status === 'pending') {
        filtered = filtered.filter(o => o.stage === 'finance_pending' || o.status === 'pending');
      } else if (status === 'approved') {
        filtered = filtered.filter(o => o.status === 'approved' || o.stage === 'admin_approved');
      } else if (status === 'rejected') {
        filtered = filtered.filter(o => o.status === 'rejected' || o.stage === 'admin_rejected');
      }
    }
    if (selectedPaymentMethod && selectedPaymentMethod !== "all") {
      filtered = filtered.filter(o => orderMatchesPaymentMethod(o, selectedPaymentMethod));
    }
    if (searchQuery) {
      filtered = filtered.filter(o =>
        o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.agentName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return filtered;
  };

  // -------------------------
  // Import / Export Handlers
  // -------------------------

  const handleDownloadOrderTemplate = () => {
    const header =
      'order_number,order_item_index,agent_id,agent_name,client_id,client_name,order_date,subtotal,tax,discount,total_amount,status,stage,payment_method,bank_type,deposit_id,notes,item_brand_name,item_variant_name,item_variant_type,item_quantity,item_unit_price,item_pricing_strategy\n';
    const blob = new Blob([header], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'orders_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportOrders = async () => {
    if (!visibleOrders.length) {
      toast({
        title: 'No Data',
        description: 'There are no orders to export.',
        variant: 'destructive',
      });
      return;
    }

    // One row per order item, including brand/variant, quantity, and pricing strategy
    const exportData = visibleOrders.flatMap((o) => {
      // Format payment method for export
      let paymentMethodStr = o.paymentMethod || '';
      if (o.paymentMode === 'SPLIT' && o.paymentSplits) {
        const parts = o.paymentSplits.map(s => {
          if (s.method === 'BANK_TRANSFER') return s.bank ? `Bank Transfer (${s.bank})` : 'Bank Transfer';
          if (s.method === 'GCASH') return 'GCash';
          if (s.method === 'CASH') return 'Cash';
          if (s.method === 'CHEQUE') return 'Cheque';
          return s.method;
        });
        paymentMethodStr = `Split: ${parts.join(' + ')}`;
      } else if (o.paymentMethod === 'BANK_TRANSFER' && o.bankType) {
        paymentMethodStr = `Bank Transfer (${o.bankType})`;
      } else if (o.paymentMethod === 'GCASH') {
        paymentMethodStr = 'GCash';
      } else if (o.paymentMethod === 'CASH') {
        paymentMethodStr = 'Cash';
      } else if (o.paymentMethod === 'CHEQUE') {
        paymentMethodStr = 'Cheque';
      }

      return o.items.map((item, index) => ({
        order_number: o.orderNumber,
        order_item_index: index + 1,
        agent_id: o.agentId,
        agent_name: o.agentName,
        client_id: o.clientId,
        client_name: o.clientName,
        order_date: o.date,
        subtotal: o.subtotal,
        tax: o.tax,
        discount: o.discount,
        total_amount: o.total,
        status: o.status,
        stage: o.stage || '',
        payment_method: paymentMethodStr,
        bank_type: o.bankType || '',
        deposit_id: o.depositId || '',
        notes: o.notes || '',
        item_brand_name: item.brandName,
        item_variant_name: item.variantName,
        item_variant_type: item.variantType,
        item_quantity: item.quantity,
        item_unit_price: item.unitPrice,
        item_pricing_strategy: o.pricingStrategy || '',
      }));
    });

    await exportClientsToExcel(
      exportData,
      undefined,
      `orders_export_${new Date().toISOString().split('T')[0]}.csv`,
    );

    toast({
      title: 'Export Successful',
      description: `Successfully exported ${visibleOrders.length} order(s).`,
    });
  };

  const handleImportOrders = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!user?.company_id) {
      toast({
        title: 'Import failed',
        description: 'User company_id not found. Please re-login and try again.',
        variant: 'destructive',
      });
      event.target.value = '';
      return;
    }

    // Only admin / finance / super_admin can import historical orders
    if (!isAdmin && !isFinance) {
      toast({
        title: 'Not authorized',
        description: 'Only admin or finance can import orders.',
        variant: 'destructive',
      });
      event.target.value = '';
      return;
    }

    try {
      const fileName = file.name.toLowerCase();
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

      let headers: string[] = [];
      let rows: string[][] = [];

      if (isExcel) {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array' });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) {
          toast({ title: 'No data', description: 'The Excel file has no sheets.', variant: 'destructive' });
          event.target.value = '';
          return;
        }
        const sheet = wb.Sheets[firstSheet];
        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
        if (!raw.length) {
          toast({ title: 'No data', description: 'The sheet is empty.', variant: 'destructive' });
          event.target.value = '';
          return;
        }
        headers = (raw[0] as unknown[]).map((h: unknown) => String(h ?? '').trim().toLowerCase());
        rows = raw.slice(1).map((row: unknown[]) =>
          (row || []).map((c: unknown) => (c == null ? '' : String(c)).trim()),
        );
      } else {
        const text = await file.text();
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length <= 1) {
          toast({ title: 'No data', description: 'The file appears to be empty.', variant: 'destructive' });
          event.target.value = '';
          return;
        }

        const [headerLine, ...lineRows] = lines;
        headers = headerLine.split(',').map((h) => h.trim().toLowerCase());
        rows = lineRows.map((row) => row.split(',').map((c) => c.trim()));
      }

      // Helper to normalize order_date into YYYY-MM-DD, handling:
      // - Already-formatted strings like "2026-02-08"
      // - Excel serial numbers like "46060"
      // - Other parseable date strings
      const normalizeOrderDate = (raw: string): string | null => {
        const value = String(raw ?? '').trim();
        if (!value) return null;

        // Exact YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return value;
        }

        // Excel serial number (days since 1899-12-30)
        if (/^\d+$/.test(value)) {
          const serial = Number(value);
          if (!Number.isFinite(serial)) return null;
          const base = new Date(Date.UTC(1899, 11, 30)); // 1899-12-30
          base.setUTCDate(base.getUTCDate() + serial);
          if (isNaN(base.getTime())) return null;
          return base.toISOString().split('T')[0];
        }

        // Fallback: let JS parse
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }

        return null;
      };

      // IMPORTANT: We expect the exact headers from order_list_import.xlsx.
      // All headers were already lowercased when building `headers`.
      console.log('[Order Import] Raw headers:', headers);

      const orderNumberIdx = headers.indexOf('order_number');
      const orderDateIdx = headers.indexOf('order_date');
      const agentIdIdx = headers.indexOf('agent_id');
      const agentNameIdx = headers.indexOf('agent_name');
      const clientIdIdx = headers.indexOf('client_id');
      const clientNameIdx = headers.indexOf('client_name');
      const subtotalIdx = headers.indexOf('subtotal');
      const taxIdx = headers.indexOf('tax');
      const discountIdx = headers.indexOf('discount');
      const totalAmountIdx = headers.indexOf('total_amount');
      const statusIdx = headers.indexOf('status');
      const stageIdx = headers.indexOf('stage');
      const paymentMethodIdx = headers.indexOf('payment_method');
      const bankTypeIdx = headers.indexOf('bank_type');
      const depositIdIdx = headers.indexOf('deposit_id');
      const notesIdx = headers.indexOf('notes');
      const itemBrandIdx = headers.indexOf('item_brand_name');
      const itemVariantIdx = headers.indexOf('item_variant_name');
      const itemVariantTypeIdx = headers.indexOf('item_variant_type');
      const itemQuantityIdx = headers.indexOf('item_quantity');
      const itemUnitPriceIdx = headers.indexOf('item_unit_price');
      const itemPricingStrategyIdx = headers.indexOf('item_pricing_strategy');

      console.log('[Order Import] Indexes:', {
        orderNumberIdx,
        orderDateIdx,
        agentIdIdx,
        agentNameIdx,
        clientIdIdx,
        clientNameIdx,
        subtotalIdx,
        taxIdx,
        discountIdx,
        totalAmountIdx,
        statusIdx,
        stageIdx,
        paymentMethodIdx,
        bankTypeIdx,
        depositIdIdx,
        notesIdx,
      });

      if (orderNumberIdx === -1 || orderDateIdx === -1) {
        toast({
          title: 'Invalid template',
          description: 'The template must include at least "order_number" and "order_date" columns.',
          variant: 'destructive',
        });
        event.target.value = '';
        return;
      }

      // Group rows by order_number for order headers
      const ordersMap = new Map<string, ImportOrder>();
      // Collect raw item rows (one per CSV/XLSX row)
      const itemRows: ImportOrderItem[] = [];

      for (const cols of rows) {
        const orderNumber = cols[orderNumberIdx] ?? '';
        if (!orderNumber) continue;

        // Collect item row if present
        const getString = (idx: number) => (idx >= 0 ? (cols[idx] ?? '') || null : null);
        const parseNumber = (idx: number) => {
          if (idx < 0) return 0;
          const v = parseFloat(cols[idx] ?? '');
          return Number.isFinite(v) ? v : 0;
        };

        const rawItemBrand = getString(itemBrandIdx);
        const rawItemVariant = getString(itemVariantIdx);
        const rawItemQty = parseNumber(itemQuantityIdx);
        const rawItemUnitPrice = parseNumber(itemUnitPriceIdx);

        if (rawItemBrand || rawItemVariant || rawItemQty > 0 || rawItemUnitPrice > 0) {
          itemRows.push({
            order_number: orderNumber,
            item_brand_name: rawItemBrand,
            item_variant_name: rawItemVariant,
            item_variant_type: getString(itemVariantTypeIdx),
            item_quantity: rawItemQty,
            item_unit_price: rawItemUnitPrice,
            item_pricing_strategy: getString(itemPricingStrategyIdx),
          });
        }

        if (!ordersMap.has(orderNumber)) {
          const order_date_raw = cols[orderDateIdx] ?? '';
          const normalizedDate = normalizeOrderDate(order_date_raw);
          if (!normalizedDate) {
            console.warn('[Order Import] Invalid order_date detected, aborting import', {
              orderNumber,
              raw: order_date_raw,
            });
            toast({
              title: 'Invalid order date',
              description: `Order "${orderNumber}" has an invalid order_date value: "${order_date_raw}". Please fix it in the file (use YYYY-MM-DD or a valid Excel date) and try again.`,
              variant: 'destructive',
            });
            event.target.value = '';
            return;
          }

          const status = (getString(statusIdx) || 'approved') as string;
          const stage = (getString(stageIdx) || 'admin_approved') as string;

          ordersMap.set(orderNumber, {
            order_number: orderNumber,
            order_date: normalizedDate,
            agent_id: getString(agentIdIdx),
            agent_name: getString(agentNameIdx),
            client_id: getString(clientIdIdx),
            client_name: getString(clientNameIdx),
            subtotal: parseNumber(subtotalIdx),
            tax: parseNumber(taxIdx),
            discount: parseNumber(discountIdx),
            total_amount: parseNumber(totalAmountIdx),
            status,
            stage,
            payment_method: getString(paymentMethodIdx),
            bank_type: getString(bankTypeIdx),
            deposit_id: getString(depositIdIdx),
            notes: getString(notesIdx),
          });
        }
      }

      if (ordersMap.size === 0) {
        toast({
          title: 'No valid rows',
          description: 'No valid orders were found in the file.',
          variant: 'destructive',
        });
        event.target.value = '';
        return;
      }

      // Store parsed orders + items and open preview dialog; actual DB insert happens on confirm
      const ordersArray = Array.from(ordersMap.values());
      setImportOrders(ordersArray);
      setImportOrderItems(itemRows);
      setImportPreviewOpen(true);
    } catch (err: any) {
      console.error('Error importing orders:', err);
      toast({
        title: 'Import failed',
        description: err.message || 'An unexpected error occurred while importing orders.',
        variant: 'destructive',
      });
    } finally {
      // Reset input so the same file can be selected again later
      event.target.value = '';
    }
  };

  const handleConfirmImportOrders = async () => {
    if (!user?.company_id) {
      toast({
        title: 'Import failed',
        description: 'User company_id not found. Please re-login and try again.',
        variant: 'destructive',
      });
      return;
    }

    if (!isAdmin && !isFinance) {
      toast({
        title: 'Not authorized',
        description: 'Only admin or finance can import orders.',
        variant: 'destructive',
      });
      return;
    }

    if (!importOrders.length) {
      toast({
        title: 'Nothing to import',
        description: 'There are no parsed orders to import.',
      });
      return;
    }

    try {
      setImportingOrders(true);

      // Ensure all orders have a client_id and prefetch their account_type
      const ordersArray = importOrders;
      const missingClientIdOrders = ordersArray.filter((o) => !o.client_id);
      if (missingClientIdOrders.length > 0) {
        const sample = missingClientIdOrders.slice(0, 5).map((o) => o.order_number).join(', ');
        toast({
          title: 'Missing client_id',
          description: `The following order(s) have no client_id: ${sample}${
            missingClientIdOrders.length > 5 ? '...' : ''
          }. Please fill in client_id for all orders and try again.`,
          variant: 'destructive',
        });
        return;
      }

      const clientIds = Array.from(
        new Set(ordersArray.map((o) => o.client_id).filter(Boolean) as string[]),
      );

      const { data: clientRows, error: clientsError } = await supabase
        .from('clients')
        .select('id, account_type')
        .eq('company_id', user.company_id)
        .in('id', clientIds);

      if (clientsError) {
        console.error('Error fetching clients for import:', clientsError);
        toast({
          title: 'Import failed',
          description: clientsError.message || 'Failed to fetch clients for order import.',
          variant: 'destructive',
        });
        return;
      }

      const clientAccountTypeMap = new Map<string, string>();
      (clientRows || []).forEach((c: any) => {
        clientAccountTypeMap.set(c.id, c.account_type || 'Standard Accounts');
      });

      const missingClients = clientIds.filter((id) => !clientAccountTypeMap.has(id));
      if (missingClients.length > 0) {
        const sample = missingClients.slice(0, 5).join(', ');
        toast({
          title: 'Unknown clients',
          description: `Some client_id values from the file do not exist for this company: ${sample}${
            missingClients.length > 5 ? '...' : ''
          }. Please verify the client IDs before importing.`,
          variant: 'destructive',
        });
        return;
      }

      const companyOrderNumbers = ordersArray.map((o) => o.order_number);
      const orderDateMap = new Map<string, string>();
      ordersArray.forEach((o) => {
        if (o.order_number && o.order_date) {
          orderDateMap.set(o.order_number, o.order_date);
        }
      });

      // Skip orders that already exist for this company_id
      const { data: existingOrders, error: existingError } = await supabase
        .from('client_orders')
        .select('order_number')
        .eq('company_id', user.company_id)
        .in('order_number', companyOrderNumbers);

      if (existingError) {
        console.error('Error checking existing orders:', existingError);
        toast({
          title: 'Import failed',
          description: existingError.message || 'Failed to check existing orders.',
          variant: 'destructive',
        });
        return;
      }

      const existingSet = new Set((existingOrders || []).map((o: any) => o.order_number));

      const payload = ordersArray
        .filter((o) => !existingSet.has(o.order_number))
        .map((o) => ({
          company_id: user.company_id,
          agent_id: o.agent_id,
          client_id: o.client_id,
          order_number: o.order_number,
          order_date: o.order_date,
          // Align with actual client_orders schema: subtotal, tax_amount, discount, total_amount
          subtotal: o.subtotal,
          tax_amount: o.tax,
          discount: o.discount,
          total_amount: o.total_amount,
          client_account_type: clientAccountTypeMap.get(o.client_id as string) || 'Standard Accounts',
          status: o.status,
          notes: o.notes,
          payment_method: o.payment_method,
          bank_type: o.bank_type,
          deposit_id: o.deposit_id,
          stage: o.stage,
          // Ensure created_at/updated_at align with the original order date
          created_at: o.order_date,
          updated_at: o.order_date,
        }));

      if (!payload.length) {
        toast({
          title: 'Nothing to import',
          description: 'All orders in the file already exist for this company.',
        });
        return;
      }

      const { data: insertedOrders, error: orderInsertError } = await supabase
        .from('client_orders')
        .insert(payload as any[])
        .select('id, order_number');

      if (orderInsertError) {
        console.error('Order import error:', orderInsertError);
        toast({
          title: 'Import failed',
          description: orderInsertError.message || 'Failed to import orders.',
          variant: 'destructive',
        });
        return;
      }

      // Map order_number -> client_order_id for newly inserted orders
      const orderIdMap = new Map<string, string>();
      (insertedOrders || []).forEach((o: any) => {
        if (o.order_number && o.id) {
          orderIdMap.set(o.order_number, o.id as string);
        }
      });

      // Build variant lookup from existing brands + variants
      const distinctCombos = new Map<
        string,
        { brandName: string; variantName: string; variantType: string | null }
      >();

      importOrderItems.forEach((item) => {
        const brandNameRaw = (item.item_brand_name || '').trim();
        const variantNameRaw = (item.item_variant_name || '').trim();
        const rawVariantType = (item.item_variant_type || '').trim();
        const normalizedVariantType = normalizeVariantType(rawVariantType);
        if (!brandNameRaw || !variantNameRaw) return;

        const brandNameKey = normalizeName(brandNameRaw);
        const variantNameKey = normalizeName(variantNameRaw);
        const key = `${brandNameKey}||${variantNameKey}||${normalizedVariantType}`;
        if (!distinctCombos.has(key)) {
          // Store the original variant type text (for display) but use the
          // normalized form for matching against DB variants.
          const storedVariantType = rawVariantType || null;
          distinctCombos.set(key, {
            brandName: brandNameRaw,
            variantName: variantNameRaw,
            variantType: storedVariantType,
          });
        }
      });

      let variantIdMap = new Map<string, string>();

      if (distinctCombos.size > 0) {
        const { data: brands, error: brandsError } = await supabase
          .from('brands')
          .select('id, name')
          .eq('company_id', user.company_id);

        if (brandsError) {
          console.error('Error fetching brands for order import:', brandsError);
          toast({
            title: 'Import failed',
            description: brandsError.message || 'Failed to fetch brands for order items.',
            variant: 'destructive',
          });
          return;
        }

        const { data: variants, error: variantsError } = await supabase
          .from('variants')
          .select('id, name, variant_type, brand_id')
          .eq('company_id', user.company_id);

        if (variantsError) {
          console.error('Error fetching variants for order import:', variantsError);
          toast({
            title: 'Import failed',
            description: variantsError.message || 'Failed to fetch variants for order items.',
            variant: 'destructive',
          });
          return;
        }

        const brandNameToId = new Map<string, string>();
        (brands || []).forEach((b: any) => {
          if (b.name && b.id) {
            const key = normalizeName(String(b.name));
            brandNameToId.set(key, b.id as string);
          }
        });

        const variantKeyToId = new Map<string, string>();
        (variants || []).forEach((v: any) => {
          const brandId = v.brand_id as string;
          const nameKey = normalizeName(String(v.name || ''));
          const type = normalizeVariantType(v.variant_type as string | null);
          const key = `${brandId}||${nameKey}||${type}`;
          if (brandId && nameKey) {
            variantKeyToId.set(key, v.id as string);
          }
        });

        const missingCombos: string[] = [];

        distinctCombos.forEach(({ brandName, variantName, variantType }) => {
          const brandId = brandNameToId.get(normalizeName(brandName));
          if (!brandId) {
            missingCombos.push(`${brandName} / ${variantName} (${variantType || 'unknown type'})`);
            return;
          }
          const normalizedType = normalizeVariantType(variantType);
          const key = `${brandId}||${normalizeName(variantName)}||${normalizedType}`;
          const variantId = variantKeyToId.get(key);
          if (!variantId) {
            missingCombos.push(`${brandName} / ${variantName} (${variantType || 'unknown type'})`);
            return;
          }
          const comboKey = `${normalizeName(brandName)}||${normalizeName(variantName)}||${normalizedType}`;
          variantIdMap.set(comboKey, variantId);
        });

        if (missingCombos.length > 0) {
          const sample = missingCombos.slice(0, 5).join('; ');
          toast({
            title: 'Unknown variants',
            description: `Some brand/variant/type combinations from the file do not exist: ${sample}${
              missingCombos.length > 5 ? '...' : ''
            }. Please ensure all items exist in Brands & Variants before importing.`,
            variant: 'destructive',
          });
          return;
        }
      }

      // Build client_order_items payload (does NOT touch inventory)
        const itemPayload = importOrderItems
          .map((item) => {
            const orderId = orderIdMap.get(item.order_number);
            if (!orderId) return null; // order may have been skipped as duplicate

            const brandNameRaw = (item.item_brand_name || '').trim();
            const variantNameRaw = (item.item_variant_name || '').trim();
            const variantTypeRaw = (item.item_variant_type || '').trim();
            if (!brandNameRaw || !variantNameRaw) return null;

            const normalizedType = normalizeVariantType(variantTypeRaw);
            const comboKey = `${normalizeName(brandNameRaw)}||${normalizeName(
              variantNameRaw
            )}||${normalizedType}`;
            const variantId = variantIdMap.get(comboKey);
            if (!variantId) return null;

            const quantity = item.item_quantity || 0;
            const unitPrice = item.item_unit_price || 0;
            const totalPrice = quantity * unitPrice;

            const pricingStrategy = (item.item_pricing_strategy || '').toLowerCase();
            const rspPrice = pricingStrategy === 'rsp' ? unitPrice : 0;

            const orderDateForItem = orderDateMap.get(item.order_number);

            return {
              company_id: user.company_id,
              client_order_id: orderId,
              variant_id: variantId,
              quantity,
              unit_price: unitPrice,
              selling_price: 0,
              dsp_price: 0,
              rsp_price: rspPrice,
              total_price: totalPrice,
              // Align created_at date with the parent order's date when available
              ...(orderDateForItem ? { created_at: orderDateForItem } : {}),
            };
          })
          .filter(Boolean) as any[];

      if (itemPayload.length > 0) {
        const { error: itemInsertError } = await supabase
          .from('client_order_items')
          .insert(itemPayload);

        if (itemInsertError) {
          console.error('Order items import error:', itemInsertError);
          toast({
            title: 'Import warning',
            description:
              itemInsertError.message ||
              'Orders were created, but there was an error creating order items.',
            variant: 'destructive',
          });
        }
      }

      toast({
        title: 'Import complete',
        description: `${payload.length} order(s) imported successfully.`,
      });
    } finally {
      setImportingOrders(false);
      setImportPreviewOpen(false);
      setImportOrders([]);
    }
  };

  // Bulk approval handlers
  const handleOpenBulkApprove = () => {
    setSelectedAgentForBulk('');
    setAgentOrders([]);
    setBulkApproveDialogOpen(true);
  };

  const handleSelectAgentForBulk = (agentId: string) => {
    setSelectedAgentForBulk(agentId);
    // Filter orders for this agent that are pending finance approval
    const filtered = orders.filter(
      (o) => o.agentId === agentId &&
        (o.stage === 'finance_pending' || (o.status === 'pending' && isAdmin))
    );
    setAgentOrders(filtered);
  };

  const handleViewOrderInBulk = async (order: Order) => {
    setViewingOrderInBulk(order);
    setBulkViewDialogOpen(true);

    // Fetch client details
    setLoadingBulkClient(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, email, phone, company, address')
        .eq('id', order.clientId)
        .single();

      if (error) throw error;
      setBulkClientDetails(data);
    } catch (error) {
      console.error('Error fetching client details:', error);
      setBulkClientDetails(null);
    } finally {
      setLoadingBulkClient(false);
    }
  };

  const handleBulkApprove = async () => {
    if (agentOrders.length === 0) return;

    // Check for cash/cheque orders (FULL or SPLIT) without deposits OR without bank details recorded
    const ordersWithoutDeposit = agentOrders.filter(order => {
      let hasCashOrCheque = false;
      if (order.paymentMode === 'SPLIT' && order.paymentSplits) {
        hasCashOrCheque = order.paymentSplits.some(s => s.method === 'CASH' || s.method === 'CHEQUE');
      } else {
        hasCashOrCheque = order.paymentMethod === 'CASH' || order.paymentMethod === 'CHEQUE';
      }
      return hasCashOrCheque && (!order.depositId || !order.depositBankAccount);
    });

    if (ordersWithoutDeposit.length > 0) {
      toast({
        title: 'Cannot Approve',
        description: `${ordersWithoutDeposit.length} cash/cheque order(s) cannot be approved. The team leader must record the deposit details (bank account and reference number) first.`,
        variant: 'destructive',
        duration: 7000
      });
      return;
    }

    setProcessingBulkApproval(true);
    try {
      let successCount = 0;
      let failCount = 0;
      let skippedCash = 0;

      for (const order of agentOrders) {
        try {
          // Double-check cash/cheque orders before approval (safety net)
          let hasCashOrCheque = false;
          if (order.paymentMode === 'SPLIT' && order.paymentSplits) {
            hasCashOrCheque = order.paymentSplits.some(s => s.method === 'CASH' || s.method === 'CHEQUE');
          } else {
            hasCashOrCheque = order.paymentMethod === 'CASH' || order.paymentMethod === 'CHEQUE';
          }

          if (hasCashOrCheque && (!order.depositId || !order.depositBankAccount)) {
            console.warn(`Skipping cash/cheque order ${order.orderNumber} - deposit not recorded or bank details missing`);
            skippedCash++;
            continue;
          }

          await updateOrderStatus(order.id, 'approved');
          successCount++;
        } catch (error) {
          console.error(`Failed to approve order ${order.orderNumber}:`, error);
          failCount++;
        }
      }

      toast({
        title: 'Bulk Approval Complete',
        description: `Successfully approved ${successCount} order(s).${skippedCash > 0 ? ` Skipped ${skippedCash} cash order(s) without deposit.` : ''}${failCount > 0 ? ` Failed: ${failCount}` : ''}`,
      });

      setBulkApproveDialogOpen(false);
      setSelectedAgentForBulk('');
      setAgentOrders([]);
    } catch (error) {
      console.error('Bulk approval error:', error);
      toast({
        title: 'Error',
        description: 'Failed to process bulk approval',
        variant: 'destructive',
      });
    } finally {
      setProcessingBulkApproval(false);
    }
  };

  const OrderTable = ({ orderList }: { orderList: Order[] }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const ordersPerPage = 10;

    // Reset to page 1 when order list changes
    useEffect(() => {
      setCurrentPage(1);
    }, [orderList.length]);

    const totalPages = Math.ceil(orderList.length / ordersPerPage);
    const startIndex = (currentPage - 1) * ordersPerPage;
    const endIndex = startIndex + ordersPerPage;
    const paginatedOrders = orderList.slice(startIndex, endIndex);

    return (
      <>
        {orderList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg bg-muted/20">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No orders found</p>
            <p className="text-sm text-muted-foreground">Orders will appear here once created by your sales agents.</p>
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden space-y-3">
              {paginatedOrders.map((order) => (
                <div key={order.id} className="rounded-lg border bg-background p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Order #</div>
                      <div className="font-mono font-semibold">{order.orderNumber}</div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <Badge variant={getStatusVariant(order) as any}>
                        {getStatusLabel(order)}
                      </Badge>
                      {(order.stage === 'finance_pending' || order.status === 'pending') && (
                        (order.paymentMethod === 'CASH' || order.paymentMethod === 'CHEQUE' || (order.paymentMode === 'SPLIT' && order.paymentSplits?.some(s => s.method === 'CASH' || s.method === 'CHEQUE')))
                      ) && (
                        order.depositId && order.depositBankAccount ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                            Deposit Recorded
                          </Badge>
                        ) : order.depositId ? (
                          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
                            Awaiting Desposit slip
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                            Awaiting Remittance
                          </Badge>
                        )
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Client</div>
                      <div className="truncate">{order.clientName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Agent</div>
                      <div className="truncate">{order.agentName}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Date</div>
                      <div>{new Date(order.date).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Items</div>
                      <div>{order.items.reduce((sum, item) => sum + (item.quantity || 0), 0)}</div>
                    </div>
                    <div className="col-span-2 flex justify-between border-t pt-2 font-medium">
                      <span>Amount</span>
                      <span>₱{order.total.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
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
                    <TableHead>Order #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Sales Agent</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono font-medium">{order.orderNumber}</TableCell>
                      <TableCell>{order.clientName}</TableCell>
                      <TableCell>{order.agentName}</TableCell>
                      <TableCell>{new Date(order.date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">{order.items.reduce((sum, item) => sum + (item.quantity || 0), 0)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        ₱{order.total.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={getStatusVariant(order) as any}>{getStatusLabel(order)}</Badge>
                          {(order.stage === 'finance_pending' || order.status === 'pending') && (
                            (order.paymentMethod === 'CASH' || order.paymentMethod === 'CHEQUE' || (order.paymentMode === 'SPLIT' && order.paymentSplits?.some(s => s.method === 'CASH' || s.method === 'CHEQUE')))
                          ) && (
                            order.depositId && order.depositBankAccount ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                                Deposit Recorded
                              </Badge>
                            ) : order.depositId ? (
                              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
                                Awaiting Deposit Slip 
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                            Awaiting Remittance
                            </Badge>
                            )
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewOrder(order)}
                          title="View Order Details"
                          className="hover:bg-gray-100"
                        >
                          <Eye className="h-4 w-4 text-gray-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} to {Math.min(endIndex, orderList.length)} of {orderList.length} orders
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className="min-w-[40px]"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </>
    );
  };
  if (!user || (user.role !== 'admin' && user.role !== 'finance' && user.role !== 'super_admin' && user.role !== 'team_leader')) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Order Management</h1>
          <p className="text-muted-foreground">
            {isLeader 
              ? 'View and monitor orders from your team members' 
              : 'Review and approve purchase orders from sales agents'}
          </p>
        </div>
        {(isAdmin || isFinance) && (
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <Button variant="outline" onClick={handleDownloadOrderTemplate} className="gap-2">
              <Download className="h-4 w-4" />
              Template
            </Button>
            <div className="relative">
              <input
                type="file"
                ref={importOrdersInputRef}
                onChange={handleImportOrders}
                accept=".csv,.xlsx,.xls"
                className="hidden"
              />
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => importOrdersInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Import
              </Button>
            </div>
            <Button variant="outline" onClick={handleExportOrders} className="gap-2">
              <FileText className="h-4 w-4" />
              Export
            </Button>
            {isFinance && (
              <Button onClick={handleOpenBulkApprove} className="gap-2">
                <CheckSquare className="h-4 w-4" />
                Bulk Approve Orders
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Pending Orders</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pendingOrdersCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Approved This Month</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedThisMonthCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Total Value</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₱{visibleOrders.reduce((sum, o) => sum + o.total, 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leader: Team Agents panel */}
      {isLeader && teamAgentsSummary.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <h2 className="text-xl font-semibold">My Team Agents</h2>
              <p className="text-sm text-muted-foreground">Agents under you with order counts</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {teamAgentsSummary.map(a => (
                <div key={a.agentId} className="p-3 border rounded-lg">
                  <div className="font-medium">{a.agentName}</div>
                  <div className="text-sm mt-1">Orders: <span className="font-semibold">{a.orders}</span></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {/* Team Agents panel removed */}

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders by number, client, or agent..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={selectedPaymentMethod}
              onValueChange={setSelectedPaymentMethod}
            >
              <SelectTrigger className="w-full md:w-[200px]">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Filter Method" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payment Methods</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
                <SelectItem value="GCASH">GCash</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1 bg-muted">
              <TabsTrigger value="pending" className="data-[state=active]:bg-background">
                <div className="flex flex-col items-center gap-1 py-1">
                  <span className="font-semibold text-sm">Pending (Finance Review)</span>
                  <span className="text-xs text-muted-foreground">({filterOrders('pending').length})</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="approved" className="data-[state=active]:bg-background">
                <div className="flex flex-col items-center gap-1 py-1">
                  <span className="font-semibold text-sm">Approved</span>
                  <span className="text-xs text-muted-foreground">({filterOrders('approved').length})</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="rejected" className="data-[state=active]:bg-background">
                <div className="flex flex-col items-center gap-1 py-1">
                  <span className="font-semibold text-sm">Rejected</span>
                  <span className="text-xs text-muted-foreground">({filterOrders('rejected').length})</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="all" className="data-[state=active]:bg-background">
                <div className="flex flex-col items-center gap-1 py-1">
                  <span className="font-semibold text-sm">All Orders</span>
                  <span className="text-xs text-muted-foreground">({filterOrders().length})</span>
                </div>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="mt-4">
              <OrderTable orderList={filterOrders('pending')} />
            </TabsContent>
            <TabsContent value="approved" className="mt-4">
              <OrderTable orderList={filterOrders('approved')} />
            </TabsContent>
            <TabsContent value="rejected" className="mt-4">
              <OrderTable orderList={filterOrders('rejected')} />
            </TabsContent>
            <TabsContent value="all" className="mt-4">
              <OrderTable orderList={filterOrders()} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Import Orders Preview Dialog */}
      <Dialog open={importPreviewOpen} onOpenChange={(open) => !importingOrders && setImportPreviewOpen(open)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Import Orders Preview</DialogTitle>
            <DialogDescription>
              Review the data below. The first table shows what will be inserted into the{' '}
              <span className="font-semibold">client_orders</span> table, and the second shows what will be inserted
              into the <span className="font-semibold">client_order_items</span> table.
            </DialogDescription>
          </DialogHeader>

          {/* Client Orders (headers) */}
          <h3 className="mt-4 text-sm font-semibold text-muted-foreground">
            Client Orders (`client_orders`)
          </h3>
          <div className="mt-2 max-h-[40vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importOrders.map((o) => (
                  <TableRow key={o.order_number}>
                    <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                    <TableCell>{o.order_date}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{o.client_name || '—'}</span>
                        <span className="text-xs text-muted-foreground">{o.client_id}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{o.agent_name || '—'}</span>
                        <span className="text-xs text-muted-foreground">{o.agent_id}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">₱{o.subtotal.toLocaleString()}</TableCell>
                    <TableCell className="text-right">₱{o.tax.toLocaleString()}</TableCell>
                    <TableCell className="text-right">₱{o.discount.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-semibold">₱{o.total_amount.toLocaleString()}</TableCell>
                    <TableCell>{o.status}</TableCell>
                    <TableCell>{o.stage}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{o.payment_method || '—'}</span>
                        {o.bank_type && (
                          <span className="text-xs text-muted-foreground">{o.bank_type}</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!importOrders.length && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-sm text-muted-foreground">
                      No orders parsed from file.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Client Order Items (line items) */}
          <h3 className="mt-6 text-sm font-semibold text-muted-foreground">
            Order Items (`client_order_items`)
          </h3>
          <div className="mt-2 max-h-[40vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total Price</TableHead>
                  <TableHead>Pricing Strategy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importOrderItems.map((item, idx) => {
                  const qty = item.item_quantity || 0;
                  const unit = item.item_unit_price || 0;
                  const total = qty * unit;
                  return (
                    <TableRow key={`${item.order_number}-${idx}`}>
                      <TableCell className="font-mono text-xs">{item.order_number}</TableCell>
                      <TableCell>{item.item_brand_name || '—'}</TableCell>
                      <TableCell>{item.item_variant_name || '—'}</TableCell>
                      <TableCell>{item.item_variant_type || '—'}</TableCell>
                      <TableCell className="text-right">{qty}</TableCell>
                      <TableCell className="text-right">₱{unit.toLocaleString()}</TableCell>
                      <TableCell className="text-right">₱{total.toLocaleString()}</TableCell>
                      <TableCell>{item.item_pricing_strategy || '—'}</TableCell>
                    </TableRow>
                  );
                })}
                {!importOrderItems.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                      No order items parsed from file. Only order headers will be imported.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => !importingOrders && setImportPreviewOpen(false)}
              disabled={importingOrders}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmImportOrders} disabled={importingOrders || !importOrders.length}>
              {importingOrders ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                'Confirm Import'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Order Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>Review details and take action on this order.</DialogDescription>
          </DialogHeader>
          {viewingOrder && (
            <div className="space-y-6 py-4">
              {/* Order Header */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <Label className="text-muted-foreground">Order Number</Label>
                  <p className="text-2xl font-mono font-bold">{viewingOrder.orderNumber}</p>
                </div>
                <Badge
                  variant={getStatusVariant(viewingOrder) as any}
                  className="text-lg px-4 py-2"
                >
                  {getStatusLabel(viewingOrder)}
                </Badge>
              </div>

              {/* Client & Agent Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Client</Label>
                  <p className="font-semibold text-lg">{clientDetails?.name || viewingOrder.clientName}</p>
                  <div className="text-sm text-muted-foreground">
                    {loadingClient ? 'Loading client details…' : (
                      <>
                        <div>Email: {clientDetails?.email || '—'}</div>
                        <div>Phone: {clientDetails?.phone || '—'}</div>
                        <div>Shop Name: {clientDetails?.company || '—'}</div>
                        <div>Address: {clientDetails?.address || '—'}</div>
                      </>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Sales Agent</Label>
                  <p className="font-semibold text-lg">{viewingOrder.agentName}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                    <div>
                      <Label className="text-muted-foreground">Order Date</Label>
                      <p className="font-medium">{new Date(viewingOrder.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Total Items</Label>
                      <p className="font-medium">{viewingOrder.items.reduce((sum, item) => sum + (item.quantity || 0), 0)} item(s)</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="space-y-3">
                <Label className="text-lg font-semibold">Order Items</Label>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[30%]">Product</TableHead>
                        <TableHead className="w-[30%]">Variant</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        // Group items by Brand Name
                        const grouped = viewingOrder.items.reduce((acc, item) => {
                          const key = item.brandName;
                          if (!acc[key]) acc[key] = [];
                          acc[key].push(item);
                          return acc;
                        }, {} as Record<string, typeof viewingOrder.items>);

                        return Object.entries(grouped).map(([brandName, groupItems]) => (
                          <>
                            {/* Product Group Header */}
                            <TableRow key={`group-${brandName}`} className="hover:bg-muted/10">
                              <TableCell className="font-bold text-sm align-top pt-3 pb-1">
                                {brandName}
                              </TableCell>
                              <TableCell colSpan={4} className="p-0"></TableCell>
                            </TableRow>

                            {/* Variant Items */}
                            {groupItems.map((item, index) => (
                              <TableRow key={`${brandName}-${index}`} className="border-0 hover:bg-transparent">
                                <TableCell className="py-1"></TableCell>
                                <TableCell className="py-1 align-top">
                                  <div className="text-sm font-medium">{item.variantName}</div>
                                  {item.variantType && (
                                    <div className="text-xs text-muted-foreground capitalize">
                                      {item.variantType}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right py-1 align-top text-sm">
                                  {item.quantity}
                                </TableCell>
                                <TableCell className="text-right py-1 align-top text-sm">
                                  ₱{item.unitPrice.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right py-1 align-top font-medium text-sm">
                                  ₱{item.total.toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))}
                            {/* Spacer Row */}
                            <TableRow className="h-2 border-0 hover:bg-transparent"><TableCell colSpan={5} className="p-0" /></TableRow>
                          </>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Order Total */}
              {/* Order Total */}
              <div className="space-y-3 p-4 bg-primary/5 rounded-lg border-2 border-primary/20">
                {/* Split Payment Breakdown */}
                {viewingOrder.paymentMode === 'SPLIT' && viewingOrder.paymentSplits && (
                  <div className="mb-2 pb-2 border-b border-primary/10 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Payment Breakdown</p>
                    {viewingOrder.paymentSplits.map((split, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {split.method === 'GCASH' ? 'GCash' : 
                           split.method === 'BANK_TRANSFER' ? `Bank (${split.bank || 'Transfer'})` :
                           split.method === 'CHEQUE' ? 'Cheque' : 'Cash'}
                        </span>
                        <span className="font-medium">₱{split.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center text-xl">
                  <Label className="font-semibold">Order Total:</Label>
                  <p className="font-bold text-primary">₱{viewingOrder.total.toLocaleString()}</p>
                </div>
              </div>

              {/* Payment Information */}
              {viewingOrder && (
                viewingOrder.paymentMode === 'SPLIT' && viewingOrder.paymentSplits && viewingOrder.paymentSplits.length > 0 ? (
                  <div className="space-y-3 p-4 bg-muted rounded-lg border">
                    <Label className="text-lg font-semibold">Payment Information</Label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-muted-foreground">Payment Mode</Label>
                          <p className="font-medium">Split Payment ({viewingOrder.paymentSplits.length} methods)</p>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        {viewingOrder.paymentSplits.map((split, index) => (
                          <div key={index} className="border rounded-lg p-3 bg-background space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-muted-foreground text-xs">Method</Label>
                                <p className="font-medium text-sm">
                                  {split.method === 'GCASH'
                                    ? 'GCash'
                                    : split.method === 'BANK_TRANSFER'
                                    ? split.bank
                                      ? `Bank Transfer (${split.bank})`
                                      : 'Bank Transfer'
                                    : split.method === 'CHEQUE'
                                    ? 'Cheque'
                                    : 'Cash'}
                                </p>
                              </div>
                              <div className="text-right">
                                <Label className="text-muted-foreground text-xs">Amount</Label>
                                <p className="font-semibold text-sm">₱{split.amount.toLocaleString()}</p>
                              </div>
                            </div>

                            {split.proofUrl && (
                              <div>
                                <Label className="text-muted-foreground text-xs">Payment Proof</Label>
                                <div className="mt-1 border rounded-md overflow-hidden bg-white">
                                  <img
                                    src={split.proofUrl}
                                    alt={`Payment Proof ${index + 1}`}
                                    className="w-full h-auto max-h-64 object-contain"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src =
                                        'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2YjcyODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : viewingOrder.paymentMethod ? (
                  <div className="space-y-3 p-4 bg-muted rounded-lg border">
                    <Label className="text-lg font-semibold">Payment Information</Label>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-muted-foreground">Payment Method</Label>
                        <p className="font-medium">
                          {viewingOrder.paymentMethod === 'GCASH' ? 'GCash' :
                            viewingOrder.paymentMethod === 'BANK_TRANSFER' ? (
                              viewingOrder.bankType ? `Bank Transfer (${viewingOrder.bankType})` : 'Bank Transfer'
                            ) : viewingOrder.paymentMethod === 'CHEQUE' ? 'Cheque' : 'Cash'}
                        </p>
                      </div>
                      {viewingOrder.paymentProofUrl && (
                        <div>
                          <Label className="text-muted-foreground">Payment Proof</Label>
                          <div className="mt-2 border rounded-lg overflow-hidden bg-white">
                            <img
                              src={viewingOrder.paymentProofUrl}
                              alt="Payment Proof"
                              className="w-full h-auto max-h-96 object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2YjcyODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* CASH/CHEQUE Orders: Show deposit slip if recorded */}
                      {(viewingOrder.paymentMethod === 'CASH' || viewingOrder.paymentMethod === 'CHEQUE') && viewingOrder.depositSlipUrl && (
                        <div className="pt-3 border-t">
                          <Label className="text-muted-foreground">{viewingOrder.paymentMethod === 'CHEQUE' ? 'Cheque Deposit Image' : 'Cash Deposit Slip'}</Label>
                          {viewingOrder.depositReferenceNumber && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Reference: {viewingOrder.depositReferenceNumber}
                            </p>
                          )}
                          {viewingOrder.depositNotes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Notes: {viewingOrder.depositNotes}
                            </p>
                          )}
                          <div className="mt-2 border rounded-lg overflow-hidden bg-white">
                            <img
                              src={viewingOrder.depositSlipUrl}
                              alt="Deposit Slip"
                              className="w-full h-auto max-h-96 object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2YjcyODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
                              }}
                            />
                          </div>
                          <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Deposit slip uploaded by team leader
                          </p>
                        </div>
                      )}

                      {/* CASH/CHEQUE Orders: Show message if deposit not recorded yet */}
                      {(viewingOrder.paymentMethod === 'CASH' || viewingOrder.paymentMethod === 'CHEQUE') && !viewingOrder.depositSlipUrl && viewingOrder.depositId && (
                        <div className="pt-3 border-t">
                          <Label className="text-muted-foreground">{viewingOrder.paymentMethod === 'CHEQUE' ? 'Cheque Deposit Image' : 'Cash Deposit Slip'}</Label>
                          <p className="text-sm text-amber-700 mt-2 flex items-center gap-1">
                            <AlertCircle className="h-4 w-4" />
                            Waiting for team leader to upload deposit image
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null
              )}

              {isFinance && (viewingOrder.stage === 'finance_pending' || viewingOrder.status === 'pending') && (
                (() => {
                  const hasCashOrChequeComponent = viewingOrder.paymentMode === 'SPLIT' && viewingOrder.paymentSplits
                    ? viewingOrder.paymentSplits.some(s => s.method === 'CASH' || s.method === 'CHEQUE')
                    : viewingOrder.paymentMethod === 'CASH' || viewingOrder.paymentMethod === 'CHEQUE';

                  const needsDeposit = hasCashOrChequeComponent && !viewingOrder.depositId;
                  const needsBankDetails = hasCashOrChequeComponent && viewingOrder.depositId && !viewingOrder.depositBankAccount;
                  const depositReady = hasCashOrChequeComponent && viewingOrder.depositId && viewingOrder.depositBankAccount;

                  return (
                    <>
                      {/* Show warning if CASH/CHEQUE component without deposit */}
                      {needsDeposit && (
                        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-semibold text-amber-900">Deposit Required (Cash/Cheque)</p>
                            <p className="text-sm text-amber-700 mt-1">
                              This order contains a cash/cheque payment component. It cannot be approved until the team leader has deposited the payment and recorded it in the system.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Show warning if CASH/CHEQUE component with deposit but bank details not recorded yet */}
                      {needsBankDetails && (
                        <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                          <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-semibold text-orange-900">Deposit Details Pending</p>
                            <p className="text-sm text-orange-700 mt-1">
                              The team leader must record the deposit details (bank account and reference number) for the cash/cheque portion before this order can be approved.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Show info if CASH/CHEQUE component with deposit AND bank details recorded */}
                      {depositReady && (
                        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <CheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-semibold text-blue-900">Deposit Recorded</p>
                            <p className="text-sm text-blue-700 mt-1">
                              Team leader has deposited the payment to {viewingOrder.depositBankAccount}. Approving this order will also verify the deposit.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-3 pt-4 border-t">
                        <Button
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => {
                            setViewDialogOpen(false);
                            handleOpenApprove(viewingOrder);
                          }}
                          disabled={needsDeposit || needsBankDetails}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          {depositReady
                            ? 'Approve Order & Verify Deposit'
                            : 'Finance Approve'}
                        </Button>
                        <Button
                          variant="destructive"
                          className="flex-1 bg-red-600 hover:bg-red-700"
                          onClick={() => {
                            setViewDialogOpen(false);
                            handleOpenReject(viewingOrder);
                          }}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Finance Deny
                        </Button>
                      </div>
                    </>
                  );
                })()
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve order <strong>{orderToApprove?.orderNumber}</strong> from{' '}
              <strong>{orderToApprove?.clientName}</strong>?
              <br /><br />
              Order total: <strong>₱{orderToApprove?.total.toLocaleString()}</strong>
              <br />
              <br />
              ⚠️ This action will:
              <br />
              • Deduct stock quantities from inventory
              <br />
              • Create inventory transaction records
              <br />
              • Mark the order as approved
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmApprove}>
              Approve Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Reason Dialog */}
      <AlertDialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Order</AlertDialogTitle>
            <AlertDialogDescription>
              {rejectingForRole === 'admin' ? (
                <>Please provide a reason. The order will return to the leader for review.</>
              ) : (
                <>You can optionally provide a reason for rejection.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Rejection Reason</Label>
            <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder={rejectingForRole === 'admin' ? 'Required for admin rejection' : 'Optional'} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRejectWithReason} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Deny Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Approve Dialog */}
      <Dialog open={bulkApproveDialogOpen} onOpenChange={setBulkApproveDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Approve Orders by Agent</DialogTitle>
            <DialogDescription>
              Select an agent to view and approve all their pending orders at once
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Agent Selector */}
            <div className="space-y-2">
              <Label htmlFor="agent-select">Select Agent</Label>
              <Select value={selectedAgentForBulk} onValueChange={handleSelectAgentForBulk}>
                <SelectTrigger id="agent-select">
                  <SelectValue placeholder="Choose an agent..." />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set(orders
                    .filter(o => o.stage === 'finance_pending' || (o.status === 'pending' && isAdmin))
                    .map(o => o.agentId)))
                    .map(agentId => {
                      const order = orders.find(o => o.agentId === agentId);
                      return (
                        <SelectItem key={agentId} value={agentId}>
                          {order?.agentName || 'Unknown Agent'}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>

            {/* Orders List */}
            {selectedAgentForBulk && agentOrders.length > 0 && (
              <>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order Number</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agentOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono font-medium">{order.orderNumber}</TableCell>
                          <TableCell>{order.clientName}</TableCell>
                          <TableCell>{new Date(order.date).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right font-semibold">
                            ₱{order.total.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewOrderInBulk(order)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Summary */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Orders</p>
                    <p className="text-2xl font-bold">{agentOrders.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-2xl font-bold">
                      ₱{agentOrders.reduce((sum, o) => sum + o.total, 0).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Approve All Button */}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setBulkApproveDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleBulkApprove}
                    disabled={processingBulkApproval}
                    className="gap-2"
                  >
                    {processingBulkApproval ? (
                      <>Processing...</>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Approve All {agentOrders.length} Orders
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}

            {selectedAgentForBulk && agentOrders.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No pending orders found for this agent</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Order View Dialog */}
      <Dialog open={bulkViewDialogOpen} onOpenChange={setBulkViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details - {viewingOrderInBulk?.orderNumber}</DialogTitle>
          </DialogHeader>

          {viewingOrderInBulk && (
            <div className="space-y-6">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Client Name</Label>
                  <p className="text-sm font-medium">{viewingOrderInBulk.clientName}</p>
                </div>
                <div>
                  <Label>Agent Name</Label>
                  <p className="text-sm font-medium">{viewingOrderInBulk.agentName}</p>
                </div>
                <div>
                  <Label>Order Date</Label>
                  <p className="text-sm">{new Date(viewingOrderInBulk.date).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge variant={viewingOrderInBulk.stage === 'admin_approved' ? 'default' : 'secondary'}>
                    {viewingOrderInBulk.stage}
                  </Badge>
                </div>
              </div>

              {/* Client Details */}
              {bulkClientDetails && (
                <div className="border rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold">Client Information</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {bulkClientDetails.email && (
                      <div>
                        <span className="text-muted-foreground">Email:</span>{' '}
                        {bulkClientDetails.email}
                      </div>
                    )}
                    {bulkClientDetails.phone && (
                      <div>
                        <span className="text-muted-foreground">Phone:</span>{' '}
                        {bulkClientDetails.phone}
                      </div>
                    )}
                    {bulkClientDetails.company && (
                      <div>
                        <span className="text-muted-foreground">Shop Name:</span>{' '}
                        {bulkClientDetails.company}
                      </div>
                    )}
                    {bulkClientDetails.city && (
                      <div>
                        <span className="text-muted-foreground">City:</span>{' '}
                        {bulkClientDetails.city}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Order Items */}
              <div>
                <h3 className="font-semibold mb-2">Order Items</h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewingOrderInBulk.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.brandName}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.variantName} ({item.variantType})
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">₱{item.unitPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-semibold">
                            ₱{item.total.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Payment Details */}
              {viewingOrderInBulk.paymentMethod && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold">Payment Information</h3>
                  <div>
                    <Label>Payment Method</Label>
                    <p className="text-sm font-medium">
                      {viewingOrderInBulk.paymentMethod === 'GCASH' ? 'GCash' :
                        viewingOrderInBulk.paymentMethod === 'BANK_TRANSFER' ? (
                          viewingOrderInBulk.bankType ? `Bank Transfer (${viewingOrderInBulk.bankType})` : 'Bank Transfer'
                        ) :
                          viewingOrderInBulk.paymentMethod === 'CASH' ? 'Cash' :
                            viewingOrderInBulk.paymentMethod}
                    </p>
                  </div>
                  {viewingOrderInBulk.paymentProofUrl && (
                    <div>
                      <Label>Payment Proof</Label>
                      <img
                        src={viewingOrderInBulk.paymentProofUrl}
                        alt="Payment Proof"
                        className="mt-2 max-w-full h-auto rounded border"
                      />
                    </div>
                  )}

                  {/* CASH Orders: Show deposit slip if recorded */}
                  {viewingOrderInBulk.paymentMethod === 'CASH' && viewingOrderInBulk.depositSlipUrl && (
                    <div className="pt-3 border-t">
                      <Label>Cash Deposit Slip</Label>
                      {viewingOrderInBulk.depositReferenceNumber && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Reference: {viewingOrderInBulk.depositReferenceNumber}
                        </p>
                      )}
                      {viewingOrderInBulk.depositNotes && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Notes: {viewingOrderInBulk.depositNotes}
                        </p>
                      )}
                      <img
                        src={viewingOrderInBulk.depositSlipUrl}
                        alt="Deposit Slip"
                        className="mt-2 max-w-full h-auto rounded border"
                      />
                      <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Deposit slip uploaded by team leader
                      </p>
                    </div>
                  )}

                  {/* CASH Orders: Show message if deposit not recorded yet */}
                  {viewingOrderInBulk.paymentMethod === 'CASH' && !viewingOrderInBulk.depositSlipUrl && viewingOrderInBulk.depositId && (
                    <div className="pt-3 border-t">
                      <Label>Cash Deposit Slip</Label>
                      <p className="text-sm text-amber-700 mt-2 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        Waiting for team leader to upload deposit slip
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Signature */}
              {viewingOrderInBulk.signatureUrl && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold">Client Signature</h3>
                  <img
                    src={viewingOrderInBulk.signatureUrl}
                    alt="Client Signature"
                    className="max-w-md h-auto border rounded bg-white p-2"
                  />
                </div>
              )}

              {/* Total Summary */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span>Total Amount:</span>
                  <span>₱{viewingOrderInBulk.total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

