import type { PoReceiveLine } from '@/features/orders/components/PoBuyerReceiveDialog';
import type {
  PurchaseOrderHistoryEvent,
  PurchaseOrderHistoryItem,
} from '@/features/orders/purchaseOrderHistoryTypes';

export type TlPoReceiveStatus =
  | 'pending_receive'
  | 'fully_received'
  | 'shortfall_investigation';

export const TL_PO_STATUS_LABELS: Record<TlPoReceiveStatus, string> = {
  pending_receive: 'Pending receive',
  fully_received: 'Fully received',
  shortfall_investigation: 'Shortfall · under investigation',
};

export type TlReceiveProof = {
  at: string;
  notes?: string;
  proofImageDataUrl: string;
  signatureDataUrl: string;
};

export type TlPendingReceive = {
  deliveryId: string;
  drNumber: string | null;
  companyId: string;
  warehouseLocationId: string | null;
  warehouseLocationName: string | null;
  lines: PoReceiveLine[];
};

export type TlReceiveListItem = {
  id: string;
  po_number: string;
  order_date: string;
  expected_delivery_date: string;
  item_count: number;
  total_amount: number;
  status: TlPoReceiveStatus;
  companyId?: string;
  drNumber: string | null;
  warehouseCompanyName: string | null;
  warehouseLocationName: string | null;
  /** Company of the Super Admin (or creator) who assigned this PO. */
  allocatedByCompanyName: string | null;
  /** Super Admin (or creator) who assigned this PO to the TL. */
  allocatedByName: string | null;
  items: PurchaseOrderHistoryItem[];
  history: PurchaseOrderHistoryEvent[];
  receiveNotes?: string | null;
  receiveProofs?: TlReceiveProof[];
  pendingReceive?: TlPendingReceive;
  /** Raw PO fields for receive receipt PDF / history. */
  poSnapshot?: {
    status: string;
    notes: string;
    created_by: string;
    created_at: string;
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    discount: number;
  };
};
