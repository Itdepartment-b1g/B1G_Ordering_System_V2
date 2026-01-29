-- ============================================================================
-- ADD SAMPLE LOCATION DATA TO EXISTING CLIENTS
-- ============================================================================
-- This script adds sample GPS coordinates to existing clients in your database
-- so you can test the War Room map functionality.
--
-- NOTE: This uses sample coordinates in the Philippines. Replace with actual
-- client locations in production.
--
-- Run this script in your Supabase SQL Editor to add location data to clients
-- that don't have coordinates yet.
-- ============================================================================

-- Helper: Add location to a specific client by name (example)
-- Update this with your actual client names and real coordinates

-- Example 1: Update first 5 clients with Manila area coordinates
UPDATE clients
SET 
  location_latitude = 14.5995 + (random() * 0.2 - 0.1),  -- Random offset around Manila
  location_longitude = 120.9842 + (random() * 0.2 - 0.1),
  location_accuracy = 10 + (random() * 20),
  location_captured_at = NOW()
WHERE location_latitude IS NULL
  AND location_longitude IS NULL
LIMIT 5;

-- Example 2: Update next 3 clients with Cebu coordinates
UPDATE clients
SET 
  location_latitude = 10.3157 + (random() * 0.1 - 0.05),  -- Random offset around Cebu
  location_longitude = 123.8854 + (random() * 0.1 - 0.05),
  location_accuracy = 10 + (random() * 20),
  location_captured_at = NOW()
WHERE location_latitude IS NULL
  AND location_longitude IS NULL
LIMIT 3;

-- Example 3: Update next 2 clients with Davao coordinates
UPDATE clients
SET 
  location_latitude = 7.0731 + (random() * 0.1 - 0.05),  -- Random offset around Davao
  location_longitude = 125.6128 + (random() * 0.1 - 0.05),
  location_accuracy = 10 + (random() * 20),
  location_captured_at = NOW()
WHERE location_latitude IS NULL
  AND location_longitude IS NULL
LIMIT 2;

-- ============================================================================
-- VERIFY THE UPDATES
-- ============================================================================

-- Check how many clients now have location data
SELECT 
  COUNT(*) as total_clients,
  COUNT(location_latitude) as clients_with_location,
  COUNT(*) - COUNT(location_latitude) as clients_without_location
FROM clients
WHERE status = 'active';

-- View clients with their locations
SELECT 
  id,
  name,
  company,
  account_type,
  has_forge,
  location_latitude,
  location_longitude,
  location_accuracy,
  city,
  region
FROM clients
WHERE location_latitude IS NOT NULL
  AND status = 'active'
ORDER BY created_at DESC
LIMIT 20;

-- ============================================================================
-- PRODUCTION NOTES
-- ============================================================================
-- 
-- In production, client locations should be captured via:
-- 1. Mobile app using device GPS when visiting client
-- 2. Geocoding API to convert address to coordinates
-- 3. Manual entry by admin with map picker
--
-- DO NOT use random coordinates in production!
-- ============================================================================

