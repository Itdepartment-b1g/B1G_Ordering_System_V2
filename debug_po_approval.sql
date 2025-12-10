-- ============================================================================
-- DEBUG: Check Purchase Order Approval Process
-- ============================================================================

-- 1. Check if the function exists
SELECT 
    routine_name,
    routine_type,
    data_type as return_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'approve_purchase_order';

-- 2. Check recent purchase orders
SELECT 
    po_number,
    status,
    approved_by,
    approved_at,
    created_at
FROM purchase_orders
ORDER BY created_at DESC
LIMIT 5;

-- 3. Check if any items were added to main_inventory recently
SELECT 
    mi.id,
    mi.variant_id,
    v.name as variant_name,
    b.name as brand_name,
    mi.stock,
    mi.created_at,
    mi.updated_at
FROM main_inventory mi
JOIN variants v ON mi.variant_id = v.id
JOIN brands b ON v.brand_id = b.id
ORDER BY mi.updated_at DESC
LIMIT 10;

-- 4. Check inventory transactions related to purchase orders
SELECT 
    it.id,
    it.transaction_type,
    it.quantity,
    it.reference_type,
    it.reference_id,
    it.notes,
    it.created_at,
    v.name as variant_name
FROM inventory_transactions it
JOIN variants v ON it.variant_id = v.id
WHERE it.transaction_type = 'purchase_order_received'
ORDER BY it.created_at DESC
LIMIT 10;

-- 5. Test the function with a dry run (if you have a pending PO)
-- Replace 'YOUR_PO_ID' and 'YOUR_USER_ID' with actual values
-- SELECT approve_purchase_order('YOUR_PO_ID'::uuid, 'YOUR_USER_ID'::uuid);

