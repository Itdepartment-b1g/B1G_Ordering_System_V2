-- ============================================================================
-- CASH DEPOSITS SCHEMA AND FUNCTIONS
-- ============================================================================

-- 1. Create cash_deposits table
CREATE TABLE IF NOT EXISTS cash_deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES profiles(id),
    performed_by UUID NOT NULL REFERENCES profiles(id),
    amount DECIMAL(10,2) NOT NULL,
    bank_account TEXT NOT NULL,
    reference_number TEXT,
    deposit_slip_url TEXT,
    deposit_date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'verified', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_cash_deposits_company_id ON cash_deposits(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_deposits_agent_id ON cash_deposits(agent_id);
CREATE INDEX IF NOT EXISTS idx_cash_deposits_date ON cash_deposits(deposit_date);

-- Enable RLS
ALTER TABLE cash_deposits ENABLE ROW LEVEL SECURITY;

-- Add RLS policies (using existing helper logic pattern)
DO $$
BEGIN
    -- View policy
    EXECUTE 'CREATE POLICY "Users can view cash_deposits in their company" ON cash_deposits FOR SELECT USING (company_id = get_my_company_id())';
    
    -- Insert policy
    EXECUTE 'CREATE POLICY "Users can insert cash_deposits in their company" ON cash_deposits FOR INSERT WITH CHECK (company_id = get_my_company_id())';
    
    -- Update policy
    EXECUTE 'CREATE POLICY "Users can update cash_deposits in their company" ON cash_deposits FOR UPDATE USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id())';

EXCEPTION 
    WHEN duplicate_object THEN NULL;
END $$;


-- 2. Update client_orders table
-- Add deposit_id to link orders to a specific deposit
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_orders' AND column_name = 'deposit_id') THEN
        ALTER TABLE client_orders 
        ADD COLUMN deposit_id UUID REFERENCES cash_deposits(id) ON DELETE SET NULL;
        
        CREATE INDEX idx_client_orders_deposit_id ON client_orders(deposit_id);
    END IF;
END $$;


-- 3. Create RPC function to confirm deposit and link orders
CREATE OR REPLACE FUNCTION confirm_cash_deposit(
    p_agent_id UUID,
    p_amount DECIMAL,
    p_bank_account TEXT,
    p_reference_number TEXT,
    p_deposit_slip_url TEXT,
    p_deposit_date DATE,
    p_order_ids UUID[]
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id UUID;
    v_deposit_id UUID;
    v_user_id UUID;
BEGIN
    -- Get current user context
    v_user_id := auth.uid();
    
    -- Get company_id from user profile
    SELECT company_id INTO v_company_id
    FROM profiles
    WHERE id = v_user_id;

    IF v_company_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'User company not found');
    END IF;

    -- 1. Create Cash Deposit Record
    INSERT INTO cash_deposits (
        company_id,
        agent_id,
        performed_by,
        amount,
        bank_account,
        reference_number,
        deposit_slip_url,
        deposit_date,
        status
    ) VALUES (
        v_company_id,
        p_agent_id,
        v_user_id,
        p_amount,
        p_bank_account,
        p_reference_number,
        p_deposit_slip_url,
        p_deposit_date,
        'verified' -- Auto-verify for now as leader is creating it
    ) RETURNING id INTO v_deposit_id;

    -- 2. Update Client Orders
    IF p_order_ids IS NOT NULL AND array_length(p_order_ids, 1) > 0 THEN
        UPDATE client_orders
        SET 
            deposit_id = v_deposit_id,
            payment_proof_url = p_deposit_slip_url, -- Also link proof to individual orders for visibility
            updated_at = NOW()
        WHERE id = ANY(p_order_ids)
        AND company_id = v_company_id;
    END IF;

    -- 3. Create Financial Transaction (Revenue)
    INSERT INTO financial_transactions (
        company_id,
        transaction_date,
        transaction_type,
        category,
        amount,
        reference_type,
        reference_id,
        agent_id,
        description,
        status,
        created_by
    ) VALUES (
        v_company_id,
        p_deposit_date,
        'revenue',
        'cash_deposit', 
        p_amount,
        'cash_deposit',
        v_deposit_id,
        p_agent_id,
        format('Cash Deposit: %s - Ref: %s - Bank: %s', p_bank_account, p_reference_number, p_bank_account),
        'completed',
        v_user_id
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Cash deposit recorded successfully',
        'deposit_id', v_deposit_id
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION confirm_cash_deposit(UUID, DECIMAL, TEXT, TEXT, TEXT, DATE, UUID[]) TO authenticated;
