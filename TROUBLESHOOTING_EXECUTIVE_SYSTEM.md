# Troubleshooting Executive Account System

## Issue 1: Executive Tab Not Showing

### Quick Fixes (Try in Order):

#### 1. **Restart Development Server**
```bash
# Stop your current server (Ctrl+C), then:
npm run dev
# or
yarn dev
# or
pnpm dev
```

#### 2. **Clear Browser Cache**
- Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- Or open DevTools (F12) → Network tab → Check "Disable cache"

#### 3. **Check You're Logged in as System Administrator**
- Navigate to: `http://localhost:5173/system-admin`
- Your user role must be `system_administrator`
- If you see "Access Denied", you need to update your user role in the database

#### 4. **Check Browser Console for Errors**
1. Open Developer Tools (F12)
2. Go to Console tab
3. Look for red errors
4. Common errors to fix:
   - "Cannot find module" → Missing import
   - "undefined is not a function" → Component not exported
   - Network errors → Backend issue

#### 5. **Verify Database Migration Ran Successfully**
The tab won't work if the database isn't updated. Check in Supabase SQL Editor:

```sql
-- Check if executive role exists
SELECT * FROM pg_constraint WHERE conname = 'profiles_role_check';

-- Check if executive_company_assignments table exists
SELECT * FROM executive_company_assignments LIMIT 1;
```

If these queries fail, run the migration:
```sql
-- Run the entire file:
supabase/migrations/add_executive_role.sql
```

### Debugging Steps:

#### Step A: Check File Structure
Verify these files exist:
```
src/features/system-admin/
├── SystemAdminPage.tsx       ✓ (modified)
└── ExecutiveAccountsTab.tsx  ✓ (new file)
```

#### Step B: Verify Import in SystemAdminPage.tsx
Check line 30:
```typescript
import { ExecutiveAccountsTab } from './ExecutiveAccountsTab';
```

#### Step C: Check Tabs Rendering
Search for this code in SystemAdminPage.tsx (around line 214):
```typescript
<Tabs defaultValue="companies" className="w-full">
    <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="companies">Companies</TabsTrigger>
        <TabsTrigger value="executives">Executive Accounts</TabsTrigger>
    </TabsList>
```

#### Step D: Add Debug Logging
Temporarily add this to ExecutiveAccountsTab.tsx (top of component):
```typescript
export function ExecutiveAccountsTab() {
    console.log('🔍 ExecutiveAccountsTab is rendering!');
    // ... rest of code
```

If you see this log, the component is loading but might have a runtime error.

---

## Issue 2: Create-Executive Edge Function Errors

### For Deno/Edge Function Errors:

#### 1. **Check Specific Error Messages**
When you see "4 errors", check:
- VS Code Problems panel (Ctrl+Shift+M)
- Terminal output
- What line numbers are mentioned?

#### 2. **Common Edge Function Issues:**

**Issue: "Cannot find module"**
```typescript
// ❌ Wrong (using Node.js style)
import { createClient } from '@supabase/supabase-js'

// ✅ Correct (using Deno CDN)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
```

**Issue: "Type error with error.message"**
```typescript
// ❌ Wrong
} catch (error: any) {
    error: error?.message

// ✅ Correct
} catch (error) {
    error: error.message
```

**Issue: "Semicolon expected or unexpected"**
- Deno prefers **no semicolons**
- Remove all semicolons at end of lines

**Issue: "Cannot use 'throw' in async context"**
```typescript
// ❌ Wrong (throws error)
if (!authHeader) {
    throw new Error('Missing header')
}

// ✅ Correct (returns Response)
if (!authHeader) {
    return new Response(
        JSON.stringify({ error: 'Missing header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    )
}
```

#### 3. **Verify Edge Function Structure**
Your `create-executive/index.ts` should match this pattern:
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // ... your code
        return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
```

#### 4. **Test Edge Function Locally**
```bash
# Test if it deploys without errors
supabase functions deploy create-executive --no-verify-jwt

# Check deployment logs
supabase functions logs create-executive
```

---

## Complete Checklist

### Database Setup:
- [ ] Run migration: `add_executive_role.sql`
- [ ] Verify executive role exists in profiles constraint
- [ ] Verify executive_company_assignments table exists
- [ ] Check RLS policies are enabled

### Frontend Setup:
- [ ] ExecutiveAccountsTab.tsx file exists
- [ ] SystemAdminPage.tsx imports the tab
- [ ] Tabs component renders correctly
- [ ] No TypeScript errors in project
- [ ] Dev server restarted
- [ ] Browser cache cleared
- [ ] Logged in as system_administrator

### Backend Setup:
- [ ] create-executive/index.ts has no Deno errors
- [ ] Edge function uses correct imports (Deno CDN)
- [ ] No semicolons in Edge function
- [ ] Returns Response objects (not throwing errors)
- [ ] Edge function deployed successfully

---

## Still Having Issues?

### 1. Check Specific Error Messages
Take a screenshot of:
- VS Code Problems panel
- Browser console errors
- Terminal output

### 2. Verify User Role
```sql
-- Check your user's role
SELECT id, email, full_name, role 
FROM profiles 
WHERE email = 'your-email@example.com';

-- If not system_administrator, update it:
UPDATE profiles 
SET role = 'system_administrator' 
WHERE email = 'your-email@example.com';
```

### 3. Test Individual Components

**Test if Tabs work:**
```typescript
// Add this temporarily to SystemAdminPage.tsx
console.log('Companies count:', companies.length);
console.log('User role:', user?.role);
```

**Test if Executive tab loads:**
```typescript
// In ExecutiveAccountsTab.tsx, add at the top:
console.log('ExecutiveAccountsTab loaded!');
```

### 4. Check Network Requests
When you click "Add Executive":
1. Open DevTools → Network tab
2. Click the button
3. Look for a request to `/functions/v1/create-executive`
4. Check if it's 404, 401, or 400
5. Look at the response body for error details

---

## Quick Test Script

Run this in Supabase SQL Editor to verify everything:

```sql
-- Test 1: Check if executive role is valid
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conname = 'profiles_role_check';
-- Should include 'executive' in the list

-- Test 2: Check if table exists
SELECT COUNT(*) as count 
FROM information_schema.tables 
WHERE table_name = 'executive_company_assignments';
-- Should return 1

-- Test 3: Check if functions exist
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname LIKE '%executive%';
-- Should show: get_executive_company_ids, get_my_executive_company_ids, is_executive

-- Test 4: Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'executive_company_assignments';
-- rowsecurity should be 't' (true)
```

If all 4 tests pass, the database is ready! ✅
