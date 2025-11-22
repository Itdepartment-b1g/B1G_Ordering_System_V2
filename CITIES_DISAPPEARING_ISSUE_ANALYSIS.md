# Cities Disappearing Issue - Root Cause Analysis

## Problem Summary
Cities are disappearing from the dropdown/select without user intervention. Cities that were visible yesterday are now gone today.

## How Cities Work in the System

### 1. **Cities are NOT stored in a separate table**
- Cities are stored as a **field** (`city`) in the `clients` table
- The cities dropdown is populated by extracting unique cities from active clients

### 2. **City Extraction Logic**
In `ClientsPage.tsx` (lines 562-571):
```typescript
const getUniqueCities = () => {
  const cities = new Set<string>();
  clients.forEach(client => {
    if (client.city && client.city.trim() !== '') {
      cities.add(client.city);
    }
  });
  return Array.from(cities).sort();
};
```

This function extracts cities from the `clients` array in memory.

### 3. **Client Filtering**
In `ClientsPage.tsx` (line 306):
```typescript
.neq('status', 'inactive')
```

**This is the root cause!** The `fetchClients()` function filters out all clients with `status = 'inactive'`. 

## Why Cities Disappear

Cities will disappear from the dropdown if:
1. **Clients are set to inactive** - When clients are voided/deleted (soft delete), they're set to `status = 'inactive'` and filtered out
2. **Clients are hard deleted** - In `MyClientsPage.tsx`, there's a hard delete that removes clients entirely
3. **Clients' city field is cleared** - If the `city` field is set to `null` or empty string

## Potential Causes (Without User Intervention)

### 1. **Automatic Client Deactivation**
- Check if there are any database triggers that automatically set clients to inactive
- Check if there are any scheduled jobs or cron tasks
- Check if there are any Edge Functions that might be deactivating clients

### 2. **Cascading Deletes**
- Check if deleting other records (agents, orders, etc.) might cascade to clients
- However, no foreign key constraints with `ON DELETE CASCADE` were found on the clients table

### 3. **Data Migration/Script Execution**
- Check if `delete_all_data_except_profiles.sql` was accidentally run
- Check if any migration script was run that might have affected clients
- Check Supabase logs for any SQL queries that modified clients

### 4. **Real-time Subscription Issues**
- The app uses real-time subscriptions to update the clients list
- If there's a bug in the real-time handler, it might be incorrectly filtering clients

### 5. **Client Transfer Operations**
- When clients are transferred between agents, the `updateAgentCities()` function updates agent cities
- However, this shouldn't affect the clients themselves

## Investigation Steps

### Step 1: Check Database for Inactive Clients
Run this query in Supabase SQL Editor:
```sql
-- Check how many clients are inactive
SELECT 
  status,
  COUNT(*) as count,
  COUNT(DISTINCT city) as unique_cities
FROM clients
GROUP BY status;

-- Check clients with cities that are inactive
SELECT 
  id,
  name,
  city,
  status,
  agent_id,
  updated_at
FROM clients
WHERE status = 'inactive' 
  AND city IS NOT NULL 
  AND city != ''
ORDER BY updated_at DESC
LIMIT 50;
```

### Step 2: Check Recent Client Updates
```sql
-- Check clients that were recently updated (might have been set to inactive)
SELECT 
  id,
  name,
  city,
  status,
  updated_at,
  created_at
FROM clients
WHERE updated_at > NOW() - INTERVAL '2 days'
ORDER BY updated_at DESC;
```

### Step 3: Check for Hard Deletes
```sql
-- Check if there are any deleted clients (if you have audit logging)
-- This depends on your events/audit table structure
SELECT *
FROM events
WHERE target_type = 'client'
  AND action = 'deleted'
  AND created_at > NOW() - INTERVAL '2 days'
ORDER BY created_at DESC;
```

### Step 4: Check Database Triggers
```sql
-- List all triggers on the clients table
SELECT 
  trigger_name,
  event_manipulation,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'clients'
  AND event_object_schema = 'public';
```

### Step 5: Check Supabase Logs
1. Go to Supabase Dashboard → Logs → Postgres Logs
2. Search for queries containing `UPDATE clients` or `DELETE FROM clients`
3. Look for queries from the last 24-48 hours

## Recommended Fixes

### Fix 1: Include Inactive Clients in City Extraction (Quick Fix)
Modify `getUniqueCities()` to also check inactive clients:

```typescript
const getUniqueCities = () => {
  const cities = new Set<string>();
  // Check active clients
  clients.forEach(client => {
    if (client.city && client.city.trim() !== '') {
      cities.add(client.city);
    }
  });
  
  // Also fetch inactive clients to get their cities
  // This would require a separate query or including inactive clients in the fetch
  return Array.from(cities).sort();
};
```

**Better approach:** Fetch all clients (active + inactive) for city extraction, but only display active clients in the table.

### Fix 2: Create a Separate Cities Table (Long-term Solution)
Create a `cities` table to store cities independently:
```sql
CREATE TABLE cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Then maintain this table when clients are created/updated/deleted.

### Fix 3: Use a Database View for Cities
Create a view that extracts unique cities from all clients (active + inactive):
```sql
CREATE OR REPLACE VIEW unique_cities AS
SELECT DISTINCT city
FROM clients
WHERE city IS NOT NULL 
  AND city != ''
ORDER BY city;
```

## Immediate Action Items

1. **Run the diagnostic queries above** to identify what happened
2. **Check Supabase logs** for any suspicious queries
3. **Verify if any migrations were run** recently
4. **Check if any users have admin access** who might have bulk-deleted clients
5. **Review the `delete_all_data_except_profiles.sql` script** - was it accidentally executed?

## Prevention

1. **Add audit logging** for all client deletions/deactivations
2. **Add confirmation dialogs** for bulk operations
3. **Implement soft deletes** consistently (already done in `ClientsPage.tsx`, but `MyClientsPage.tsx` uses hard delete)
4. **Create a cities table** to decouple cities from clients
5. **Add database constraints** to prevent accidental mass updates/deletes

