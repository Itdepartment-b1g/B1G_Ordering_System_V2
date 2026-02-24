-- Migration: Add soft delete columns to brands and variants
-- This allows "deleting" items while preserving PO data integrity

-- Add is_active column to brands (default true for existing rows)
ALTER TABLE brands ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add is_active column to variants (default true for existing rows)
ALTER TABLE variants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create indexes for faster filtering
CREATE INDEX IF NOT EXISTS idx_brands_is_active ON brands(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_variants_is_active ON variants(is_active) WHERE is_active = true;
