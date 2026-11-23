import { CheckCircle2, ChevronDown, Clock, RotateCcw, ShoppingCart, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { Order } from '../OrderContext';
import {
  formatClientReturnPeso,
  formatClientReturnReason,
  formatClientReturnType,
  getClientReturnRefundAmount,
  getClientReturnStockFateQty,
  getPreviewReturnLineQty,
  type PreviewClientReturn,
} from './clientReturnPreview';
import {
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  fetchClientOrderReturnsForOrder,
} from './clientReturnApi';
import { BrandReturnedTable, groupLinesByBrand } from './ClientReturnBrandTable';
import { ClientReturnPayoutProofButton } from './ClientReturnPayoutProofDialog';

export const ORDER_PIPELINE_TIMELINE_QUERY_KEY = 'order-pipeline-timeline';

type DetailCell = { label: string; value: string };

type OrderRemittanceMeta = {
  id: string;
  remittedAt: string;
  remittanceDate: string | null;
  remittedByName: string | null;
  remittedToName: string | null;
  batchOrdersCount: number;
  batchTotalRevenue: number;
  batchItems: number;
  batchUnits: number;
  signatureUrl: string | null;
  orderRemittanceAmount: number;
};

type OrderDepositMeta = {
  id: string;
  status: string | null;
  depositDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  bankAccount: string | null;
  referenceNumber: string | null;
  amount: number | null;
  depositType: string | null;
  notes: string | null;
  depositSlipUrl: string | null;
  agentName: string | null;
  recordedByName: string | null;
  orderRemittanceAmount: number;
};

type OrderPipelineMeta = {
  remittance: OrderRemittanceMeta | null;
  deposit: OrderDepositMeta | null;
};

function nestedName(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value[0] as { full_name?: string } | undefined;
    return first?.full_name ? String(first.full_name) : null;
  }
  if (value && typeof value === 'object' && 'full_name' in value) {
    const name = (value as { full_name?: string }).full_name;
    return name ? String(name) : null;
  }
  return null;
}

/** Cash + cheque portion for this order (what physically remits/deposits). */
function getOrderCashChequeAmount(order: Order): number {
  const total = Number(order.total) || 0;
  if (Math.abs(total) < 0.01) return 0;
  if (order.paymentMode === 'SPLIT' && Array.isArray(order.paymentSplits)) {
    return order.paymentSplits.reduce((sum, split) => {
      if (split.method === 'CASH' || split.method === 'CHEQUE') {
        return sum + (Number(split.amount) || 0);
      }
      return sum;
    }, 0);
  }
  if (order.paymentMethod === 'CASH' || order.paymentMethod === 'CHEQUE') return total;
  return 0;
}

/** Bank Transfer / GCash go straight to finance — mobile sales do not remit those. */
function orderHasCashOrChequeToRemit(order: Order): boolean {
  return getOrderCashChequeAmount(order) > 0;
}

/** Electronic payment portion (Bank Transfer / GCash) — shown as payment proof on timeline. */
function getOrderElectronicAmount(order: Order): number {
  const total = Number(order.total) || 0;
  if (Math.abs(total) < 0.01) return 0;
  if (order.paymentMode === 'SPLIT' && Array.isArray(order.paymentSplits)) {
    return order.paymentSplits.reduce((sum, split) => {
      if (split.method === 'BANK_TRANSFER' || split.method === 'GCASH') {
        return sum + (Number(split.amount) || 0);
      }
      return sum;
    }, 0);
  }
  if (order.paymentMethod === 'BANK_TRANSFER' || order.paymentMethod === 'GCASH') return total;
  return 0;
}

function orderHasElectronicPayment(order: Order): boolean {
  return getOrderElectronicAmount(order) > 0;
}

function getOrderPaymentProofUrl(order: Order): string | null {
  if (order.paymentProofUrl) return order.paymentProofUrl;
  if (order.paymentMode === 'SPLIT' && Array.isArray(order.paymentSplits)) {
    const withProof = order.paymentSplits.find(
      (s) =>
        (s.method === 'BANK_TRANSFER' || s.method === 'GCASH') &&
        (s.proofUrl || (s as { proof_url?: string }).proof_url)
    );
    if (withProof) {
      return (
        withProof.proofUrl ||
        String((withProof as { proof_url?: string }).proof_url || '') ||
        null
      );
    }
  }
  return null;
}

function formatElectronicPaymentLabel(order: Order): string {
  if (order.paymentMode === 'SPLIT' && Array.isArray(order.paymentSplits)) {
    const parts = order.paymentSplits
      .filter((s) => s.method === 'BANK_TRANSFER' || s.method === 'GCASH')
      .map((split) => {
        if (split.method === 'BANK_TRANSFER') {
          return split.bank ? `Bank Transfer (${split.bank})` : 'Bank Transfer';
        }
        return 'GCash';
      });
    if (parts.length > 0) return parts.join(' + ');
  }
  if (order.paymentMethod === 'BANK_TRANSFER') {
    return order.bankType ? `Bank Transfer (${order.bankType})` : 'Bank Transfer';
  }
  if (order.paymentMethod === 'GCASH') return 'GCash';
  return 'Electronic payment';
}

function formatPeso(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `₱${Number(amount).toLocaleString()}`;
}

function formatOrderPaymentLabel(order: Order): string {
  if (order.paymentMode === 'SPLIT' && Array.isArray(order.paymentSplits) && order.paymentSplits.length > 0) {
    const parts = order.paymentSplits.map((split) => {
      if (split.method === 'BANK_TRANSFER') {
        return split.bank ? `Bank Transfer (${split.bank})` : 'Bank Transfer';
      }
      if (split.method === 'GCASH') return 'GCash';
      if (split.method === 'CASH') return 'Cash';
      if (split.method === 'CHEQUE') return 'Cheque';
      return String(split.method);
    });
    return `Split: ${parts.join(' + ')}`;
  }
  if (order.paymentMethod === 'BANK_TRANSFER') {
    return order.bankType ? `Bank Transfer (${order.bankType})` : 'Bank Transfer';
  }
  if (order.paymentMethod === 'GCASH') return 'GCash';
  if (order.paymentMethod === 'CASH') return 'Cash';
  if (order.paymentMethod === 'CHEQUE') return 'Cheque';
  return order.paymentMethod || order.paymentMode || '—';
}

async function fetchOrderPipelineMeta(order: Order): Promise<OrderPipelineMeta> {
  const orderRemittanceAmount = getOrderCashChequeAmount(order);
  // Pure Bank Transfer / GCash: agent does not remit cash — skip remittance/deposit timeline
  const tracksCashRemittance = orderHasCashOrChequeToRemit(order);

  const [remittanceResult, depositResult] = await Promise.all([
    tracksCashRemittance
      ? supabase
          .from('remittances_log')
          .select(
            `
        id,
        remitted_at,
        remittance_date,
        orders_count,
        total_revenue,
        items_remitted,
        total_units,
        signature_url,
        agent:profiles!remittances_log_agent_id_fkey(full_name),
        leader:profiles!remittances_log_leader_id_fkey(full_name)
      `
          )
          .contains('order_ids', [order.id])
          .order('remitted_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    tracksCashRemittance && order.depositId
      ? supabase
          .from('cash_deposits')
          .select(
            `
            id,
            status,
            deposit_date,
            created_at,
            updated_at,
            bank_account,
            reference_number,
            amount,
            deposit_type,
            notes,
            deposit_slip_url,
            agent:profiles!cash_deposits_agent_id_fkey(full_name),
            performer:profiles!cash_deposits_performed_by_fkey(full_name)
          `
          )
          .eq('id', order.depositId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (remittanceResult.error) {
    console.warn('Order timeline remittance lookup failed:', remittanceResult.error.message);
  }
  if (depositResult.error) {
    console.warn('Order timeline deposit lookup failed:', depositResult.error.message);
  }

  const remittanceRow = remittanceResult.data as Record<string, unknown> | null;
  const depositRow = depositResult.data as Record<string, unknown> | null;

  return {
    remittance: remittanceRow
      ? {
          id: String(remittanceRow.id),
          remittedAt: String(remittanceRow.remitted_at || ''),
          remittanceDate: remittanceRow.remittance_date
            ? String(remittanceRow.remittance_date)
            : null,
          remittedByName: nestedName(remittanceRow.agent),
          remittedToName: nestedName(remittanceRow.leader),
          batchOrdersCount: Number(remittanceRow.orders_count) || 0,
          batchTotalRevenue: Number(remittanceRow.total_revenue) || 0,
          batchItems: Number(remittanceRow.items_remitted) || 0,
          batchUnits: Number(remittanceRow.total_units) || 0,
          signatureUrl: remittanceRow.signature_url
            ? String(remittanceRow.signature_url)
            : null,
          orderRemittanceAmount,
        }
      : null,
    deposit: depositRow
      ? {
          id: String(depositRow.id),
          status: depositRow.status == null ? null : String(depositRow.status),
          depositDate: depositRow.deposit_date ? String(depositRow.deposit_date) : null,
          createdAt: depositRow.created_at ? String(depositRow.created_at) : null,
          updatedAt: depositRow.updated_at ? String(depositRow.updated_at) : null,
          bankAccount: depositRow.bank_account ? String(depositRow.bank_account) : null,
          referenceNumber: depositRow.reference_number
            ? String(depositRow.reference_number)
            : null,
          amount: depositRow.amount == null ? null : Number(depositRow.amount),
          depositType: depositRow.deposit_type ? String(depositRow.deposit_type) : null,
          notes: depositRow.notes ? String(depositRow.notes) : null,
          depositSlipUrl: depositRow.deposit_slip_url
            ? String(depositRow.deposit_slip_url)
            : null,
          agentName: nestedName(depositRow.agent),
          recordedByName: nestedName(depositRow.performer),
          orderRemittanceAmount,
        }
      : null,
  };
}

type TimelineEvent = {
  id: string;
  at: string;
  title: string;
  detail?: string;
  tone: 'neutral' | 'success' | 'danger' | 'return';
  returnId?: string;
  showItems?: boolean;
  actorLabel?: string;
  actorName?: string;
  extras?: string[];
  showPayoutPhotos?: boolean;
  detailRows?: DetailCell[];
  signatureUrl?: string | null;
  slipUrl?: string | null;
  slipLabel?: string;
};

function returnEvent(
  cr: PreviewClientReturn,
  id: string,
  at: string,
  title: string,
  tone: TimelineEvent['tone'],
  options?: {
    showItems?: boolean;
    actorLabel?: string;
    actorName?: string;
    extras?: string[];
    showPayoutPhotos?: boolean;
  }
): TimelineEvent {
  return {
    id: `${cr.id}:${id}`,
    returnId: cr.id,
    at,
    title: `${title} · ${cr.returnNumber}`,
    tone,
    showItems: options?.showItems,
    actorLabel: options?.actorLabel,
    actorName: options?.actorName,
    extras: options?.extras,
    showPayoutPhotos: options?.showPayoutPhotos,
  };
}

function queueEvent(
  cr: PreviewClientReturn,
  id: string,
  at: string,
  waiting: boolean,
  pendingTitle: string,
  sentTitle: string,
  waitingExtra?: string
): TimelineEvent {
  return returnEvent(cr, id, at, waiting ? pendingTitle : sentTitle, 'return', {
    extras: waiting && waitingExtra ? [waitingExtra] : undefined,
  });
}

function buildReturnTimelineEvents(cr: PreviewClientReturn): TimelineEvent[] {
  const kind = formatClientReturnType(cr.returnType);
  const events: TimelineEvent[] = [
    returnEvent(cr, 'filed', cr.createdAt, `${kind} filed`, 'return', {
      showItems: true,
      actorLabel: 'Filed by',
      actorName: cr.returnedByName,
    }),
  ];

  if (cr.returnType === 'refund') {
    const waitingSa = cr.status === 'pending_super_admin';
    const saApproved = !!(cr.saApprovedAt || cr.saApprovedByName);
    const waitingFinance = cr.status === 'pending_finance';
    const financeApproved = cr.status === 'posted';
    const reachedFinance =
      waitingFinance ||
      financeApproved ||
      (saApproved && (cr.status === 'rejected' || cr.status === 'cancelled'));

    events.push(
      queueEvent(
        cr,
        'queue-sa',
        cr.createdAt,
        waitingSa,
        'Refund pending Super Admin',
        'Sent to Super Admin'
      )
    );

    if (saApproved) {
      events.push(
        returnEvent(cr, 'sa', cr.saApprovedAt || cr.createdAt, 'Refund approved by Super Admin', 'success', {
          actorLabel: 'Approved by',
          actorName: cr.saApprovedByName || 'Super Admin',
        })
      );
    }

    if (reachedFinance) {
      events.push(
        queueEvent(
          cr,
          'queue-finance',
          cr.saApprovedAt || cr.createdAt,
          waitingFinance,
          'Refund pending Finance',
          'Sent to Finance',
          'Waiting for Finance'
        )
      );
    }

    if (financeApproved) {
      events.push(
        returnEvent(cr, 'finance', cr.approvedAt || cr.createdAt, 'Refund approved by Finance', 'success', {
          actorLabel: 'Approved by',
          actorName: cr.approvedByName || 'Finance',
          extras: ['Refund amount posted', ...stockFateExtras(cr)],
          showPayoutPhotos: true,
        })
      );
    }
  } else {
    const waitingTl = cr.status === 'pending_leader';
    events.push(
      queueEvent(cr, 'queue-tl', cr.createdAt, waitingTl, 'Change item pending TL', 'Sent to TL')
    );

    if (cr.status === 'posted') {
      events.push(
        returnEvent(
          cr,
          'posted',
          cr.approvedAt || cr.createdAt,
          'Change item approved by Team Leader',
          'success',
          {
            actorLabel: 'Approved by',
            actorName: cr.approvedByName || 'Team leader',
            extras: stockFateExtras(cr),
          }
        )
      );
    }
  }

  if (cr.status === 'rejected') {
    events.push(
      returnEvent(cr, 'rejected', cr.rejectedAt || cr.createdAt, `${kind} rejected`, 'danger', {
        actorLabel: 'Rejected by',
        actorName: cr.rejectedByName || 'Reviewer',
      })
    );
  } else if (cr.status === 'cancelled') {
    events.push(returnEvent(cr, 'cancelled', cr.rejectedAt || cr.createdAt, `${kind} cancelled`, 'danger'));
  }

  return events;
}

function formatWhen(value: string | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'MMM d, yyyy h:mm a');
}

function formatDepositStatus(status: string | null | undefined): string {
  if (!status) return '—';
  if (status === 'pending_verification') return 'Pending verification';
  if (status === 'verified') return 'Verified';
  return status;
}

/** Remittance creates a cash_deposits stub with this bank_account until TL records a real deposit. */
function isRemittancePlaceholderBank(bankAccount: string | null | undefined): boolean {
  if (!bankAccount || !bankAccount.trim()) return true;
  return (
    bankAccount.includes('Cash Remittance') || bankAccount.includes('Cheque Remittance')
  );
}

/** True only after team leader records a real bank deposit (not the remittance stub). */
function isTeamLeaderDepositRecorded(
  bankAccount: string | null | undefined,
  hasDepositRow: boolean
): boolean {
  return hasDepositRow && !!bankAccount && !isRemittancePlaceholderBank(bankAccount);
}

function orderIsApproved(order: Order): boolean {
  return order.stage === 'admin_approved' || order.status === 'approved';
}

function orderIsRejected(order: Order): boolean {
  return (
    order.stage === 'admin_rejected' ||
    order.stage === 'leader_rejected' ||
    order.status === 'rejected'
  );
}

function orderStillOpen(order: Order): boolean {
  return !orderIsApproved(order) && !orderIsRejected(order) && order.stage !== 'needs_revision';
}

function buildPipelineTimelineEvents(
  order: Order,
  pipeline: OrderPipelineMeta | null
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: 'created',
      at: order.createdAt || order.date,
      title: 'Order created',
      detail: `${order.orderNumber} · ${order.agentName || 'Agent'}`,
      tone: 'neutral',
    },
  ];

  const nowAt = new Date().toISOString();
  const cashChequeAmount = getOrderCashChequeAmount(order);
  // Remit → TL deposit → finance ONLY for CASH / CHEQUE (or cash/cheque split portion)
  const hasCashOrCheque = orderHasCashOrChequeToRemit(order);
  const hasElectronic = orderHasElectronicPayment(order);
  const stillOpen = orderStillOpen(order);

  // Bank Transfer / GCash: no remittance / cash-deposit steps — proof goes to finance
  if (hasElectronic) {
    const proofUrl = getOrderPaymentProofUrl(order);
    const submittedAt = order.createdAt || order.date;
    const electronicAmount = getOrderElectronicAmount(order);
    const methodLabel = formatElectronicPaymentLabel(order);
    events.push({
      id: 'payment-proof-submitted',
      at: submittedAt,
      title: 'Payment proof submitted',
      tone: 'success',
      slipUrl: proofUrl,
      slipLabel: 'Payment proof',
      detailRows: [
        { label: 'Submitted by', value: order.agentName || '—' },
        { label: 'Date & time', value: formatWhen(submittedAt) },
        { label: 'Payment method', value: methodLabel },
        { label: 'Amount', value: formatPeso(electronicAmount) },
        { label: 'Order total', value: formatPeso(order.total) },
        { label: 'Client', value: order.clientName || '—' },
        { label: 'Order #', value: order.orderNumber || '—' },
        {
          label: 'Status',
          value: orderIsApproved(order) ? 'Verified by finance' : 'Awaiting finance review',
        },
        { label: 'Payment proof', value: proofUrl ? 'Attached' : 'None' },
      ],
    });
  }

  // Cash / cheque remittance pipeline only — skip entirely for Bank Transfer / GCash-only
  if (hasCashOrCheque) {
    const remittance = pipeline?.remittance;
    const deposit = pipeline?.deposit;
    const hasRemitted =
      !!remittance || order.remitted === true || !!order.depositId || !!deposit;
    // Prefer real TL bank from order mapping; fall back to raw deposit only if not a remittance stub
    const rawDepositBank = deposit?.bankAccount || null;
    const realDepositBank =
      order.depositBankAccount ||
      (rawDepositBank && !isRemittancePlaceholderBank(rawDepositBank) ? rawDepositBank : null);
    const depositFullyRecorded = isTeamLeaderDepositRecorded(
      realDepositBank,
      !!(deposit || order.depositId)
    );
    const depositStatus = deposit?.status || order.depositStatus || null;
    const depositVerified = depositStatus === 'verified';
    const remittedAt = remittance?.remittedAt || order.createdAt || order.date;
    const depositAt =
      deposit?.updatedAt ||
      deposit?.createdAt ||
      (deposit?.depositDate ? `${deposit.depositDate}T00:00:00` : null) ||
      remittedAt;

    // Cumulative cash pipeline — never drop completed steps:
    // Remitted → Pending Cash Deposit → Cash deposited → Pending Finance → Finance approved

    // 1) Awaiting Remittance (current only)
    if (!hasRemitted && stillOpen) {
      events.push({
        id: 'awaiting-remittance',
        at: order.createdAt || order.date,
        title: 'Awaiting Remittance',
        tone: 'return',
        detailRows: [
          { label: 'Status', value: 'Pending Mobile Sales' },
          { label: 'Waiting on', value: order.agentName || 'Mobile Sales' },
          { label: 'Cash/cheque to remit', value: formatPeso(cashChequeAmount) },
          { label: 'Payment', value: formatOrderPaymentLabel(order) },
          { label: 'Client', value: order.clientName || '—' },
          { label: 'Order #', value: order.orderNumber || '—' },
          { label: 'Order total', value: formatPeso(order.total) },
        ],
      });
    }

    // 2) Remitted (keep forever once done)
    if (hasRemitted) {
      if (remittance) {
        events.push({
          id: 'remitted',
          at: remittance.remittedAt,
          title: 'Remitted',
          tone: 'success',
          signatureUrl: remittance.signatureUrl,
          detailRows: [
            { label: 'Remitted by', value: remittance.remittedByName || order.agentName || '—' },
            { label: 'Remitted to', value: remittance.remittedToName || '—' },
            { label: 'Date & time', value: formatWhen(remittance.remittedAt) },
            { label: 'Remittance date', value: remittance.remittanceDate || '—' },
            { label: 'Cash/cheque remitted', value: formatPeso(remittance.orderRemittanceAmount) },
            { label: 'Payment', value: formatOrderPaymentLabel(order) },
            { label: 'Client', value: order.clientName || '—' },
            { label: 'Order #', value: order.orderNumber || '—' },
            { label: 'Batch orders', value: String(remittance.batchOrdersCount || 0) },
            { label: 'Batch total', value: formatPeso(remittance.batchTotalRevenue) },
            {
              label: 'Batch items',
              value: `${remittance.batchItems} items · ${remittance.batchUnits} units`,
            },
            { label: 'Signature', value: remittance.signatureUrl ? 'Attached' : 'None' },
          ],
        });
      } else {
        events.push({
          id: 'remitted',
          at: remittedAt,
          title: 'Remitted',
          tone: 'success',
          detailRows: [
            { label: 'Remitted by', value: order.agentName || '—' },
            { label: 'Date & time', value: formatWhen(remittedAt) },
            { label: 'Cash/cheque remitted', value: formatPeso(cashChequeAmount) },
            { label: 'Payment', value: formatOrderPaymentLabel(order) },
            { label: 'Client', value: order.clientName || '—' },
            { label: 'Order #', value: order.orderNumber || '—' },
          ],
        });
      }
    }

    // 3) Pending Cash Deposit (current only — after remit, before TL bank deposit)
    if (hasRemitted && !depositFullyRecorded && stillOpen) {
      events.push({
        id: 'pending-cash-deposit',
        at: remittedAt,
        title: 'Pending Cash Deposit',
        tone: 'return',
        detailRows: [
          { label: 'Status', value: 'Awaiting Team Leader to deposit cash' },
          { label: 'Waiting on', value: remittance?.remittedToName || 'Team Leader' },
          { label: 'Agent', value: remittance?.remittedByName || order.agentName || '—' },
          { label: 'Cash/cheque to deposit', value: formatPeso(cashChequeAmount) },
          { label: 'Payment', value: formatOrderPaymentLabel(order) },
          { label: 'Client', value: order.clientName || '—' },
          { label: 'Order #', value: order.orderNumber || '—' },
          { label: 'Remitted at', value: formatWhen(remittedAt) },
          {
            label: 'Deposit',
            value: deposit
              ? 'Remittance stub only — Team Leader has not recorded bank deposit yet'
              : 'Not started',
          },
          { label: 'Deposit amount', value: formatPeso(deposit?.amount ?? cashChequeAmount) },
        ],
      });
    }

    // 4) Cash deposited (keep forever once TL recorded a real bank deposit)
    if (depositFullyRecorded) {
      const slipUrl = deposit?.depositSlipUrl || order.depositSlipUrl || null;
      const depositDetailRows: DetailCell[] = [
        { label: 'Recorded by', value: deposit?.recordedByName || '—' },
        { label: 'Agent', value: deposit?.agentName || order.agentName || '—' },
        { label: 'Date & time', value: formatWhen(depositAt) },
        { label: 'Deposit date', value: deposit?.depositDate || '—' },
        {
          label: 'Cash/cheque in this order',
          value: formatPeso(deposit?.orderRemittanceAmount ?? cashChequeAmount),
        },
        { label: 'Deposit amount', value: formatPeso(deposit?.amount) },
        { label: 'Type', value: deposit?.depositType || '—' },
        { label: 'Bank account', value: realDepositBank || '—' },
        {
          label: 'Reference #',
          value:
            (deposit?.referenceNumber &&
            !String(deposit.referenceNumber).startsWith('REMIT-CASH-') &&
            !String(deposit.referenceNumber).startsWith('REMIT-CHEQUE-')
              ? deposit.referenceNumber
              : null) ||
            order.depositReferenceNumber ||
            '—',
        },
        { label: 'Deposit status', value: formatDepositStatus(depositStatus) },
        { label: 'Deposit slip', value: slipUrl ? 'Attached' : 'None' },
        { label: 'Notes', value: deposit?.notes?.trim() || order.depositNotes?.trim() || '—' },
      ];

      events.push({
        id: 'cash-deposited',
        at: depositAt,
        title: 'Cash deposited',
        tone: 'success',
        detailRows: depositDetailRows,
        slipUrl,
        slipLabel: 'Deposit slip',
      });

      // 5) Pending Finance (current only — after deposit, before finance approval)
      if (stillOpen) {
        events.push({
          id: 'pending-finance-review',
          at: depositAt,
          title: 'Pending Finance Review',
          tone: 'return',
          detailRows: [
            { label: 'Status', value: 'Awaiting finance verification' },
            { label: 'Payment', value: formatOrderPaymentLabel(order) },
            {
              label: 'Cash/cheque in this order',
              value: formatPeso(deposit?.orderRemittanceAmount ?? cashChequeAmount),
            },
            { label: 'Deposit amount', value: formatPeso(deposit?.amount) },
            { label: 'Bank account', value: realDepositBank || '—' },
            { label: 'Deposit status', value: formatDepositStatus(depositStatus) },
            { label: 'Client', value: order.clientName || '—' },
            { label: 'Order #', value: order.orderNumber || '—' },
            {
              label: 'Deposit verified',
              value: depositVerified ? 'Yes' : 'Not yet — finance will verify',
            },
          ],
          slipUrl,
          slipLabel: 'Deposit slip',
        });
      }
    }
  }

  // Bank Transfer / GCash / FOC waiting on finance (no cash remittance path)
  if (
    stillOpen &&
    !hasCashOrCheque &&
    (hasElectronic || Math.abs(Number(order.total) || 0) < 0.01) &&
    (order.stage === 'finance_pending' || order.status === 'pending')
  ) {
    events.push({
      id: 'pending-finance-review',
      at: nowAt,
      title: 'Pending Finance Review',
      tone: 'return',
      detailRows: [
        { label: 'Status', value: 'Awaiting finance verification' },
        { label: 'Payment', value: formatOrderPaymentLabel(order) },
        {
          label: 'Amount',
          value: formatPeso(hasElectronic ? getOrderElectronicAmount(order) : order.total),
        },
        { label: 'Client', value: order.clientName || '—' },
        { label: 'Order #', value: order.orderNumber || '—' },
        { label: 'Submitted by', value: order.agentName || '—' },
        {
          label: 'Payment proof',
          value: getOrderPaymentProofUrl(order) ? 'Attached' : 'None',
        },
      ],
      slipUrl: getOrderPaymentProofUrl(order),
      slipLabel: 'Payment proof',
    });
  }

  // 6) Finance approved (keep forever once done)
  if (orderIsApproved(order)) {
    events.push({
      id: 'finance-approved',
      at: order.approvedAt || order.createdAt || order.date,
      title: 'Finance approved',
      tone: 'success',
      detailRows: [
        { label: 'Approved by', value: order.approvedByName || '—' },
        { label: 'Date & time', value: formatWhen(order.approvedAt || order.createdAt || order.date) },
        { label: 'Payment', value: formatOrderPaymentLabel(order) },
        { label: 'Order #', value: order.orderNumber || '—' },
        { label: 'Client', value: order.clientName || '—' },
        { label: 'Order total', value: formatPeso(order.total) },
      ],
    });
  }

  if (orderIsRejected(order)) {
    events.push({
      id: 'rejected',
      at: order.approvedAt || order.createdAt || order.date,
      title: order.stage === 'leader_rejected' ? 'Rejected by team leader' : 'Rejected by finance',
      tone: 'danger',
      detailRows: [
        { label: 'Rejected by', value: order.approvedByName || '—' },
        { label: 'Date & time', value: formatWhen(order.approvedAt || order.createdAt || order.date) },
        { label: 'Order #', value: order.orderNumber || '—' },
      ],
    });
  }

  if (order.stage === 'needs_revision') {
    events.push({
      id: 'needs-revision',
      at: order.createdAt || order.date,
      title: 'Sent back for revision',
      detail: 'Order needs revision from agent',
      tone: 'return',
    });
  }

  return events;
}

function buildTimelineEvents(
  order: Order,
  returns: PreviewClientReturn[],
  pipeline: OrderPipelineMeta | null
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...buildPipelineTimelineEvents(order, pipeline),
  ];

  for (const cr of returns) {
    events.push(...buildReturnTimelineEvents(cr));
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function EventIcon({ tone }: { tone: TimelineEvent['tone'] }) {
  if (tone === 'success') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (tone === 'danger') return <XCircle className="h-3.5 w-3.5" />;
  if (tone === 'return') return <Clock className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

const TONE_CLASS: Record<TimelineEvent['tone'], { wrap: string; rail: string }> = {
  neutral: { wrap: 'border-muted-foreground/30 bg-muted text-muted-foreground', rail: 'bg-border' },
  success: { wrap: 'border-emerald-200 bg-emerald-50 text-emerald-700', rail: 'bg-emerald-200' },
  danger: { wrap: 'border-red-200 bg-red-50 text-red-700', rail: 'bg-red-200' },
  return: { wrap: 'border-amber-200 bg-amber-50 text-amber-700', rail: 'bg-amber-200' },
};

function TimelineMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground break-words">{value}</dd>
    </div>
  );
}

function PipelineEventMeta({
  rows,
  signatureUrl,
  slipUrl,
  slipLabel = 'Deposit slip',
}: {
  rows: DetailCell[];
  signatureUrl?: string | null;
  slipUrl?: string | null;
  slipLabel?: string;
}) {
  return (
    <div className="space-y-3">
      <dl className="mt-1.5 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2 text-xs">
        {rows.map((cell) => (
          <TimelineMetaRow key={`${cell.label}-${cell.value}`} label={cell.label} value={cell.value} />
        ))}
      </dl>
      {signatureUrl ? (
        <div className="rounded-md border bg-muted/30 p-2">
          <p className="mb-1 text-xs text-muted-foreground">Signature</p>
          <img
            src={signatureUrl}
            alt="Remittance signature"
            className="mx-auto max-h-28 object-contain"
          />
        </div>
      ) : null}
      {slipUrl ? (
        <div className="rounded-md border bg-muted/30 p-2">
          <p className="mb-1 text-xs text-muted-foreground">{slipLabel}</p>
          <a
            href={slipUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-primary hover:underline"
          >
            Open {slipLabel.toLowerCase()}
          </a>
          <img
            src={slipUrl}
            alt={slipLabel}
            className="mt-2 mx-auto max-h-36 object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}

function stockFateExtras(cr: PreviewClientReturn): string[] {
  const { restock, disposal } = getClientReturnStockFateQty(cr);
  const extras: string[] = [];
  if (restock > 0) extras.push(`Restock ${restock}`);
  if (disposal > 0) extras.push(`Disposal ${disposal}`);
  return extras;
}

function extraMetaCells(extras?: string[]): Array<{ label: string; value: string }> {
  return (extras || []).filter(Boolean).map((line) => {
    if (line === 'Refund amount posted') return { label: 'Refund', value: 'Posted' };
    if (line === 'Waiting for Finance') return { label: 'Status', value: 'Waiting for Finance' };
    if (line.startsWith('Restock ')) return { label: 'Restock', value: `${line.slice('Restock '.length)} qty` };
    if (line.startsWith('Disposal ')) return { label: 'Disposal', value: `${line.slice('Disposal '.length)} qty` };
    return { label: 'Detail', value: line };
  });
}

function ReturnEventMeta({
  cr,
  actorLabel,
  actorName,
  extras,
}: {
  cr: PreviewClientReturn;
  actorLabel?: string;
  actorName?: string;
  extras?: string[];
}) {
  const qty = getPreviewReturnLineQty(cr);
  const fateQty = getClientReturnStockFateQty(cr);
  const cells = [
    { label: 'Client name', value: cr.clientName || '—' },
    { label: 'Type', value: formatClientReturnType(cr.returnType) },
    { label: 'Unit', value: `${qty}` },
    {
      label: 'Price',
      value:
        cr.returnType === 'refund' ? formatClientReturnPeso(getClientReturnRefundAmount(cr)) : '—',
    },
    { label: 'Restock', value: fateQty.restock > 0 ? `${fateQty.restock}` : '—' },
    { label: 'Disposal', value: fateQty.disposal > 0 ? `${fateQty.disposal}` : '—' },
    { label: actorLabel || 'Approved by', value: actorName || '—' },
    { label: 'Note', value: cr.notes?.trim() || '—' },
    { label: 'Reason', value: formatClientReturnReason(cr.reason) },
    ...extraMetaCells(extras),
  ].slice(0, 12);

  return (
    <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
      {cells.map((cell) => (
        <TimelineMetaRow key={`${cell.label}-${cell.value}`} label={cell.label} value={cell.value} />
      ))}
    </dl>
  );
}

function ReturnEventPayoutPhotos({ cr }: { cr: PreviewClientReturn }) {
  if ((cr.payoutPhotos?.length ?? 0) === 0) {
    return <p className="pt-2 text-xs text-muted-foreground">No cash-sent proof attached.</p>;
  }

  return (
    <div className="pt-2">
      <ClientReturnPayoutProofButton row={cr} />
    </div>
  );
}

function ReturnEventItems({ cr }: { cr: PreviewClientReturn }) {
  const returnedGroups = groupLinesByBrand(cr.lines);
  const changeGroups = groupLinesByBrand(cr.changeLines || []);
  if (returnedGroups.length === 0 && changeGroups.length === 0) return null;

  return (
    <div className="space-y-2 pt-1">
      {returnedGroups.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold">Returned</p>
          {returnedGroups.map((group) => (
            <BrandReturnedTable
              key={`ret-${cr.id}-${group.brandName}`}
              brandName={group.brandName}
              variants={group.variants}
              showStockFate
            />
          ))}
        </div>
      ) : null}
      {changeGroups.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold">Change item</p>
          {changeGroups.map((group) => (
            <BrandReturnedTable
              key={`chg-${cr.id}-${group.brandName}`}
              brandName={group.brandName}
              variants={group.variants}
              qtyClassName="text-emerald-700"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type ClientOrderReturnTimelineProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
};

export function ClientOrderReturnTimeline({ open, onOpenChange, order }: ClientOrderReturnTimelineProps) {
  const { data: returns = [] } = useQuery({
    queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY, 'order', order?.id],
    enabled: open && !!order?.id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: () => fetchClientOrderReturnsForOrder(order!.id),
  });
  const { data: pipeline = null } = useQuery({
    queryKey: [ORDER_PIPELINE_TIMELINE_QUERY_KEY, order?.id, order?.depositId, order?.remitted],
    enabled: open && !!order?.id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: () => fetchOrderPipelineMeta(order!),
  });
  const events = order ? buildTimelineEvents(order, returns, pipeline) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[70]"
        className="max-w-2xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col z-[70]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            Order timeline
            <Badge variant="outline" className="font-normal">
              {events.length} event{events.length === 1 ? '' : 's'}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {order
              ? `${order.orderNumber} · ${order.clientName} — remittance, deposit, approval, and returns`
              : 'Order events'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No timeline events yet.</p>
          ) : (
            <ol className="space-y-0">
              {events.map((event, index) => {
                const tone = TONE_CLASS[event.tone];
                const isLast = index === events.length - 1;
                const cr = event.returnId
                  ? returns.find((row) => row.id === event.returnId)
                  : undefined;
                return (
                  <li key={event.id} className="relative flex gap-3">
                    <div className="flex flex-col items-center shrink-0 w-7">
                      <span
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-full border shrink-0',
                          tone.wrap
                        )}
                      >
                        <EventIcon tone={event.tone} />
                      </span>
                      {!isLast ? (
                        <span className={cn('mt-1 w-px flex-1 min-h-[18px]', tone.rail)} aria-hidden />
                      ) : null}
                    </div>
                    <div className={cn('min-w-0 flex-1 space-y-0.5', !isLast && 'pb-4')}>
                      <p className="text-sm font-medium leading-5">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{formatWhen(event.at)}</p>
                      {cr ? (
                        <details open className="mt-0.5 group">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1.5 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                            Details
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="pt-1">
                            <ReturnEventMeta
                              cr={cr}
                              actorLabel={event.actorLabel}
                              actorName={event.actorName}
                              extras={event.extras}
                            />
                            {event.showItems ? <ReturnEventItems cr={cr} /> : null}
                            {event.showPayoutPhotos ? <ReturnEventPayoutPhotos cr={cr} /> : null}
                          </div>
                        </details>
                      ) : event.detailRows && event.detailRows.length > 0 ? (
                        <details open className="mt-0.5 group">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1.5 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                            Details
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="pt-1">
                            <PipelineEventMeta
                              rows={event.detailRows}
                              signatureUrl={event.signatureUrl}
                              slipUrl={event.slipUrl}
                              slipLabel={event.slipLabel}
                            />
                          </div>
                        </details>
                      ) : event.detail ? (
                        <p className="text-xs text-muted-foreground leading-5">{event.detail}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
