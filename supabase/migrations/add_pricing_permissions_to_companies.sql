-- ============================================================================
-- ADD PRICING PERMISSIONS TO COMPANIES
-- ============================================================================
-- Allow super admins to configure which pricing columns each role can see
-- when creating orders. Unit price is NEVER shown to sales roles.
--
-- Pricing Columns:
--   - selling_price: Custom/Special pricing (flexible)
--   - dsp_price: Distributor Selling Price (standard distributor rate)
--   - rsp_price: Recommended Selling Price (standard retail rate)
--   - unit_price: NEVER included (cost price, admin/finance only)
-- ============================================================================

-- Add pricing permission columns to companies table
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS team_leader_allowed_pricing JSONB DEFAULT '["selling_price", "dsp_price", "rsp_price"]',
ADD COLUMN IF NOT EXISTS mobile_sales_allowed_pricing JSONB DEFAULT '["rsp_price"]';

-- Drop existing constraint if it exists
ALTER TABLE companies
DROP CONSTRAINT IF EXISTS valid_pricing_columns;

-- Add constraint to ensure only valid pricing columns
ALTER TABLE companies
ADD CONSTRAINT valid_pricing_columns 
CHECK (
  (team_leader_allowed_pricing IS NULL OR 
   (jsonb_typeof(team_leader_allowed_pricing) = 'array' AND
    team_leader_allowed_pricing <@ '["selling_price", "dsp_price", "rsp_price"]'::jsonb))
  AND
  (mobile_sales_allowed_pricing IS NULL OR 
   (jsonb_typeof(mobile_sales_allowed_pricing) = 'array' AND
    mobile_sales_allowed_pricing <@ '["selling_price", "dsp_price", "rsp_price"]'::jsonb))
);

-- Add comments for documentation
COMMENT ON COLUMN companies.team_leader_allowed_pricing IS 
'Array of allowed pricing columns for team leaders when creating orders. Options: selling_price (custom), dsp_price (distributor), rsp_price (retail). Unit price is never included for security.';

COMMENT ON COLUMN companies.mobile_sales_allowed_pricing IS 
'Array of allowed pricing columns for mobile sales when creating orders. Options: selling_price (custom), dsp_price (distributor), rsp_price (retail). Unit price is never included for security. Default is rsp_price only for field sales.';

-- Update existing companies with default values
UPDATE companies 
SET 
  team_leader_allowed_pricing = '["selling_price", "dsp_price", "rsp_price"]'::jsonb,
  mobile_sales_allowed_pricing = '["rsp_price"]'::jsonb
WHERE team_leader_allowed_pricing IS NULL 
   OR mobile_sales_allowed_pricing IS NULL;

-- Make columns NOT NULL after setting defaults
ALTER TABLE companies
ALTER COLUMN team_leader_allowed_pricing SET NOT NULL,
ALTER COLUMN mobile_sales_allowed_pricing SET NOT NULL;
