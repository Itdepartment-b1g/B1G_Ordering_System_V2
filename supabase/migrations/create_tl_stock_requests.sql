-- Create TL Stock Requests Table
-- This table manages stock requests between Team Leaders

CREATE TABLE IF NOT EXISTS tl_stock_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  request_number TEXT NOT NULL UNIQUE,
  
  -- Parties involved
  requester_leader_id UUID NOT NULL REFERENCES profiles(id),
  source_leader_id UUID NOT NULL REFERENCES profiles(id),
  
  -- Request details
  variant_id UUID NOT NULL REFERENCES variants(id),
  requested_quantity INTEGER NOT NULL CHECK (requested_quantity > 0),
  
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'pending_admin' CHECK (status IN (
    'pending_admin', 
    'admin_approved', 
    'admin_rejected',
    'pending_source_tl', 
    'source_tl_approved',
    'source_tl_rejected', 
    'pending_receipt',
    'completed',
    'cancelled'
  )),
  
  -- Admin approval stage
  admin_approved_at TIMESTAMPTZ,
  admin_approved_by UUID REFERENCES profiles(id),
  admin_approved_quantity INTEGER, -- Can be less than requested if modified
  admin_notes TEXT,
  
  -- Source TL approval stage
  source_tl_approved_at TIMESTAMPTZ,
  source_tl_approved_by UUID REFERENCES profiles(id),
  source_tl_signature_url TEXT,
  source_tl_signature_path TEXT,
  source_tl_notes TEXT,
  
  -- Requester TL receipt stage
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES profiles(id),
  received_quantity INTEGER,
  received_signature_url TEXT,
  received_signature_path TEXT,
  
  -- Rejection tracking
  rejected_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES profiles(id),
  rejection_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT different_team_leaders CHECK (requester_leader_id != source_leader_id)
);

-- Create indexes for performance
CREATE INDEX idx_tl_requests_company ON tl_stock_requests(company_id);
CREATE INDEX idx_tl_requests_requester ON tl_stock_requests(requester_leader_id);
CREATE INDEX idx_tl_requests_source ON tl_stock_requests(source_leader_id);
CREATE INDEX idx_tl_requests_status ON tl_stock_requests(status);
CREATE INDEX idx_tl_requests_created_at ON tl_stock_requests(created_at DESC);

-- Enable Row Level Security
ALTER TABLE tl_stock_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Team Leaders can view their own requests (as requester or source)
CREATE POLICY "Team leaders can view their own requests"
ON tl_stock_requests FOR SELECT
USING (
  auth.uid() IN (requester_leader_id, source_leader_id)
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'super_admin')
    AND profiles.company_id = tl_stock_requests.company_id
  )
);

-- Team Leaders can create requests
CREATE POLICY "Team leaders can create requests"
ON tl_stock_requests FOR INSERT
WITH CHECK (
  auth.uid() = requester_leader_id
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'team_leader'
    AND profiles.company_id = tl_stock_requests.company_id
  )
);

-- Admins can view all requests in their company
CREATE POLICY "Admins can view all requests"
ON tl_stock_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'super_admin')
    AND profiles.company_id = tl_stock_requests.company_id
  )
);

-- Admins can update requests (for approval/rejection)
CREATE POLICY "Admins can update requests"
ON tl_stock_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'super_admin')
    AND profiles.company_id = tl_stock_requests.company_id
  )
);

-- Source TL can update their own requests (for approval/rejection)
CREATE POLICY "Source TL can update their requests"
ON tl_stock_requests FOR UPDATE
USING (
  auth.uid() = source_leader_id
  AND status = 'pending_source_tl'
);

-- Requester TL can update for receipt
CREATE POLICY "Requester TL can update for receipt"
ON tl_stock_requests FOR UPDATE
USING (
  auth.uid() = requester_leader_id
  AND status = 'pending_receipt'
);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_tl_stock_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tl_stock_requests_updated_at
BEFORE UPDATE ON tl_stock_requests
FOR EACH ROW
EXECUTE FUNCTION update_tl_stock_requests_updated_at();
