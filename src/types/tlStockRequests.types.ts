// TypeScript types for TL Stock Requests / transfers

export type TLRequestStatus =
  | 'pending_admin'
  | 'admin_approved'
  | 'admin_rejected'
  | 'pending_source_tl'
  | 'source_tl_approved'
  | 'source_tl_rejected'
  | 'pending_receipt'
  | 'completed'
  | 'incomplete'
  | 'cancelled';

export type TLDispatchShortfallReason =
  | 'insufficient_stock'
  | 'reserved_for_team'
  | 'damaged_on_hand'
  | 'other';

export type TLReceiveShortfallReason =
  | 'missing_in_transit'
  | 'damaged'
  | 'wrong_item'
  | 'other';

export type TLDiscrepancyStatus =
  | 'open'
  | 'resolved_redeliver'
  | 'resolved_found_keep'
  | 'resolved_write_off'
  | 'resolved_write_off_replace'
  | 'cancelled';

export type TLDiscrepancyResolution =
  | 'redeliver'
  | 'found_keep'
  | 'write_off'
  | 'write_off_replace';

export interface TLStockRequest {
  id: string;
  request_id: string;
  company_id: string;
  request_number: string;
  requester_leader_id: string;
  source_leader_id: string;
  variant_id: string;
  requested_quantity: number;
  status: TLRequestStatus;

  admin_approved_at: string | null;
  admin_approved_by: string | null;
  admin_approved_quantity: number | null;
  admin_notes: string | null;
  requester_notes: string | null;

  source_tl_approved_at: string | null;
  source_tl_approved_by: string | null;
  source_tl_signature_url: string | null;
  source_tl_signature_path: string | null;
  source_tl_notes: string | null;
  dispatch_proof_urls: string[];

  dispatched_quantity: number | null;
  dispatched_at: string | null;
  dispatch_shortfall_reason: TLDispatchShortfallReason | null;
  written_off_quantity: number;

  received_at: string | null;
  received_by: string | null;
  received_quantity: number | null;
  received_signature_url: string | null;
  received_signature_path: string | null;
  receive_shortfall_reason: TLReceiveShortfallReason | null;
  receive_shortfall_notes: string | null;
  receive_proof_urls: string[];

  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;

  tdr_number: string | null;
  tdrs?: {
    tdr_number: string;
    kind: 'dispatch' | 'redeliver' | 'replace';
    created_at: string;
    items?: {
      request_item_id: string;
      dispatched_quantity: number;
      received_quantity: number;
      variant?: {
        id?: string;
        name?: string | null;
        brand?: { name?: string | null } | null;
      } | null;
    }[];
  }[];

  created_at: string;
  updated_at: string;
}

export interface TLRequestWithDetails extends TLStockRequest {
  requester: {
    id: string;
    full_name: string;
    region: string | null;
    email: string;
  };
  source: {
    id: string;
    full_name: string;
    region: string | null;
    email: string;
  };
  variant: {
    id: string;
    name: string;
    type: string;
    brand_name: string;
    brand_id: string;
  };
  manager?: {
    id: string;
    full_name: string;
  };
}

export interface CreateTLRequestPayload {
  company_id: string;
  source_leader_id: string;
  items: { variant_id: string; quantity: number }[];
  notes?: string;
}

export interface AdminApprovalPayload {
  request_id: string;
  approved_quantity: number;
  notes?: string;
}

export interface AdminRejectionPayload {
  request_id: string;
  reason: string;
}

export interface SourceTLApprovalPayload {
  request_id: string;
  signature_url: string;
  signature_path: string;
  notes?: string;
}

export interface SourceTLRejectionPayload {
  request_id: string;
  reason: string;
}

export interface RequesterReceiptPayload {
  request_id: string;
  signature_url: string;
  signature_path: string;
}

export interface RPCResponse<T = any> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface SubmitRequestResponse {
  success: boolean;
  request_id?: string;
  request_number?: string;
  error?: string;
}

export interface ApproveRequestResponse {
  success: boolean;
  request_id?: string;
  approved_quantity?: number;
  available_quantity?: number;
  error?: string;
}

export interface TransferResponse {
  success: boolean;
  request_id?: string;
  transferred_quantity?: number;
  shortfall_quantity?: number;
  status?: string;
  error?: string;
}

export interface RequestCartItem {
  variant_id: string;
  variant_name: string;
  variant_type: string;
  brand_name: string;
  requested_quantity: number;
  available_quantity?: number;
}

export interface TLStockRequestDiscrepancy {
  id: string;
  company_id: string;
  request_id: string;
  request_item_id: string | null;
  variant_id: string;
  quantity: number;
  reason: TLReceiveShortfallReason;
  reporter_notes: string | null;
  status: TLDiscrepancyStatus;
  reported_by: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}
