-- ============================================================================
-- MANUAL TEST: Approve a Purchase Order
-- ============================================================================
-- Use this to manually test if the approve_purchase_order function works

-- Step 1: Find a pending purchase order
SELECT 
    id,
    po_number,
    status,
    supplier_id,
    total_amount,
    created_by
FROM purchase_orders
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 5;

-- Step 2: Get the items in that purchase order (replace PO_ID with actual ID from above)
-- SELECT 
--     poi.variant_id,
--     v.name as variant_name,
--     b.name as brand_name,
--     poi.quantity,
--     poi.unit_price
-- FROM purchase_order_items poi
-- JOIN variants v ON poi.variant_id = v.id
-- JOIN brands b ON v.brand_id = b.id
-- WHERE poi.purchase_order_id = 'YOUR_PO_ID_HERE';

-- Step 3: Check current main_inventory before approval
SELECT 
    mi.variant_id,
    v.name as variant_name,
    b.name as brand_name,
    mi.stock,
    mi.company_id
FROM main_inventory mi
JOIN variants v ON mi.variant_id = v.id
JOIN brands b ON v.brand_id = b.id
ORDER BY mi.updated_at DESC
LIMIT 10;

-- Step 4: Test the approval function
-- Replace 'YOUR_PO_ID' with actual PO ID from Step 1
-- Replace 'YOUR_USER_ID' with your user ID
-- SELECT approve_purchase_order(
--     'YOUR_PO_ID_HERE'::uuid,
--     'YOUR_USER_ID_HERE'::uuid
-- );

-- Step 5: Verify the purchase order was approved
-- SELECT 
--     id,
--     po_number,
--     status,
--     approved_by,
--     approved_at
-- FROM purchase_orders
-- WHERE id = 'YOUR_PO_ID_HERE';

-- Step 6: Check if items were added to main_inventory
-- SELECT 
--     mi.variant_id,
--     v.name as variant_name,
--     b.name as brand_name,
--     mi.stock,
--     mi.updated_at
-- FROM main_inventory mi
-- JOIN variants v ON mi.variant_id = v.id
-- JOIN brands b ON v.brand_id = b.id
-- ORDER BY mi.updated_at DESC
-- LIMIT 10;

-- Step 7: Check inventory transactions
-- SELECT 
--     it.transaction_type,
--     it.quantity,
--     it.reference_id,
--     it.notes,
--     it.created_at,
--     v.name as variant_name
-- FROM inventory_transactions it
-- JOIN variants v ON it.variant_id = v.id
-- WHERE it.reference_type = 'purchase_order'
-- ORDER BY it.created_at DESC
-- LIMIT 10;

