-- ============================================================================
-- REMOVE CHECK CONSTRAINT FROM variant_type COLUMN
-- ============================================================================
-- This migration removes the old CHECK constraint on the variant_type column
-- that restricts values to only 'flavor', 'battery', 'POSM'.
-- With variant_type_id as the primary reference and the sync trigger in place,
-- this constraint is no longer needed and prevents custom variant types.
-- ============================================================================

-- Drop the CHECK constraint on variant_type
-- The constraint is typically named "variants_variant_type_check"
ALTER TABLE variants DROP CONSTRAINT IF EXISTS variants_variant_type_check;

-- Verify the trigger exists (should have been created by create_variant_types_table.sql)
-- This trigger syncs variant_type from variant_type_id automatically
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'sync_variant_type_trigger'
    ) THEN
        RAISE NOTICE 'Warning: sync_variant_type_trigger does not exist. Run create_variant_types_table.sql first.';
    END IF;
END $$;

-- The variant_type column will now accept any value
-- The trigger sync_variant_type_from_id() will automatically populate it from variant_type_id
-- This allows custom variant types defined in the variant_types table

COMMENT ON COLUMN variants.variant_type IS 'Legacy variant type string - automatically synced from variant_type_id by trigger';
