// TypeScript types for TL Stock Requests

export type TLRequestStatus = 
  | 'pending_admin'
  | 'admin_approved'
  | 'admin_rejected'
  | 'pending_source_tl'
  | 'source_tl_approved'
  | 'source_tl_rejected'
  | 'pending_receipt'
  | 'completed'
  | 'cancelled';

export interface TLStockRequest {
  id: string;
  company_id: string;
  request_number: string;
  requester_leader_id: string;
  source_leader_id: string;
  variant_id: string;
  requested_quantity: number;
  status: TLRequestStatus;
  
  // Admin approval stage
  admin_approved_at: string | null;
  admin_approved_by: string | null;
  admin_approved_quantity: number | null;
  admin_notes: string | null;
  
  // Source TL approval stage
  source_tl_approved_at: string | null;
  source_tl_approved_by: string | null;
  source_tl_signature_url: string | null;
  source_tl_signature_path: string | null;
  source_tl_notes: string | null;
  
  // Requester TL receipt stage
  received_at: string | null;
  received_by: string | null;
  received_quantity: number | null;
  received_signature_url: string | null;
  received_signature_path: string | null;
  
  // Rejection tracking
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  
  // Timestamps
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
  variant_id: string;
  requested_quantity: number;
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

// Response types from RPC functions
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
  error?: string;
}

// For cart/multi-item requests
export interface RequestCartItem {
  variant_id: string;
  variant_name: string;
  variant_type: string;
  brand_name: string;
  requested_quantity: number;
}
