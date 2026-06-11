# Key Account User Creation Guide
## Phase 1: Where and How to Create Users

---

## Overview

When `company_account_type = 'Key Accounts'`, the company creation flow creates a **Sales Admin** instead of a Super Admin. This Sales Admin then manages the Key Account hierarchy.

---

## User Creation Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    KEY ACCOUNT USER CREATION FLOW                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  SYSTEM ADMINISTRATOR (System-level)                                    │
│  ├─ Creates Key Account Company via SysAdDashboardPage.tsx              │
│  │  ├─ company_name: "ABC Key Accounts Inc"                             │
│  │  ├─ company_account_type: "Key Accounts"                              │
│  │  └─ super_admin_name/email: Creates SALES_ADMIN (not super_admin)     │
│  │                                                                         │
│  │  Calls Edge Function: create-company                                  │
│  │  └─ Sets profiles.role = 'sales_admin'                                │
│  │                                                                         │
│  └─ Can also impersonate company via ManagementPortal.tsx               │
│     └─ Create users directly within the company                         │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  SALES ADMIN (Company-level)                                            │
│  ├─ Role: 'sales_admin'                                                 │
│  ├─ Created automatically when Key Account company is created           │
│  │                                                                         │
│  ├─ Responsibilities:                                                   │
│  │  ├─ Create Sales Directors                                           │
│  │  ├─ Create Key Account Managers                                       │
│  │  ├─ Assign KAMs to Directors (kam_director_assignments)               │
│  │  ├─ Assign Clients to KAMs (kam_client_assignments)                  │
│  │  ├─ Manage parent clients (key_account_clients)                      │
│  │  └─ Approve/reject orders (final approval)                           │
│  │                                                                         │
│  └─ User Creation Location:                                             │
│     ├─ Option 1: Company Settings page (similar to ExecutiveAccountsTab) │
│     └─ Option 2: New "Key Account Management" page                       │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  SALES DIRECTOR (Company-level)                                         │
│  ├─ Role: 'sales_director'                                               │
│  ├─ Created by Sales Admin                                               │
│  │                                                                         │
│  ├─ Responsibilities:                                                   │
│  │  ├─ View all KAMs assigned to them                                   │
│  │  ├─ View all clients assigned to their KAMs                          │
│  │  ├─ Review and approve orders from their KAMs                       │
│  │  └─ Monitor custom pricing                                           │
│  │                                                                         │
│  └─ Can also create orders for any client under their KAMs              │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  KEY ACCOUNT MANAGER (Company-level)                                    │
│  ├─ Role: 'key_account_manager'                                          │
│  ├─ Created by Sales Admin                                               │
│  ├─ Assigned to Sales Director (kam_director_assignments)               │
│  │                                                                         │
│  ├─ Responsibilities:                                                   │
│  │  ├─ View only their assigned clients (kam_client_assignments)        │
│  │  ├─ Manage client shops and delivery addresses                      │
│  │  ├─ Create purchase orders with custom pricing                      │
│  │  └─ Track order status and delivery                                  │
│  │                                                                         │
│  └─ Cannot:                                                              │
│     ├─ See other KAMs' clients                                         │
│     ├─ Approve orders (only Director can)                               │
│     └─ Create company-level configurations                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### 1. System Admin Creates Key Account Company

**File:** `src/features/dashboard/systemadmin/SysAdDashboardPage.tsx`

**Current Flow:**
```typescript
const [newCompany, setNewCompany] = useState({
  company_name: '',
  company_email: '',
  super_admin_name: '',  // This becomes Sales Admin name for Key Accounts
  super_admin_email: '', // This becomes Sales Admin email for Key Accounts
  super_admin_password: 'tempPassword123!',
  company_account_type: 'Standard Accounts' as 'Key Accounts' | 'Standard Accounts',
});
```

**Edge Function:** `supabase/functions/create-company/index.ts`

The edge function needs to check `company_account_type`:
- If 'Standard Accounts' → Create user with `role = 'super_admin'`
- If 'Key Accounts' → Create user with `role = 'sales_admin'`

---

### 2. Sales Admin Creates Users

**Recommended Location:** New page within company context

**Option A: Extend Management Portal**
```
src/features/system-admin/
├── ManagementPortal.tsx (existing)
├── portal/
│   ├── PortalClients.tsx (existing)
│   ├── PortalUsers.tsx (NEW - for user management)
│   └── ...
└── key-account/
    ├── KeyAccountUserManagement.tsx (NEW)
    ├── DirectorKAMAssignment.tsx (NEW)
    └── ClientAssignment.tsx (NEW)
```

**Option B: Sales Admin Dashboard**
```
src/features/key-accounts/
├── SalesAdminDashboard.tsx (NEW)
├── components/
│   ├── UserCreationForm.tsx (NEW)
│   ├── DirectorKAMAssignment.tsx (NEW)
│   └── ClientKAMAssignment.tsx (NEW)
└── ...
```

---

### 3. Database Functions for User Creation

**SQL Function:** Create a wrapper around `create_user_profile` for Key Account roles

```sql
-- Function to create Key Account users (Sales Admin only)
CREATE OR REPLACE FUNCTION create_key_account_user(
    p_full_name text,
    p_email text,
    p_password text,
    p_role text,  -- 'sales_director' or 'key_account_manager'
    p_company_id uuid,
    p_created_by uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
    v_existing_user uuid;
BEGIN
    -- Validate role
    IF p_role NOT IN ('sales_director', 'key_account_manager') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid role for Key Account user');
    END IF;
    
    -- Check if email already exists
    SELECT id INTO v_existing_user FROM auth.users WHERE email = p_email;
    IF v_existing_user IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'Email already exists');
    END IF;
    
    -- Create auth user (requires supabase auth admin)
    -- This would typically be done via Edge Function
    
    -- Create profile using existing function
    PERFORM create_user_profile(
        v_user_id,
        p_full_name,
        p_email,
        p_role,
        'active',
        p_company_id,
        NULL, -- phone
        NULL, -- region
        NULL, -- address
        NULL, -- city
        NULL  -- country
    );
    
    RETURN json_build_object('success', true, 'user_id', v_user_id);
END;
$$;
```

---

### 4. Assignment Tables Management

**KAM to Director Assignment:**
```typescript
// src/features/key-accounts/hooks.ts
export const useAssignKAMToDirector = () => {
  return useMutation({
    mutationFn: async (data: {
      directorId: string;
      kamId: string;
      companyId: string;
    }) => {
      const { data: result, error } = await supabase
        .from('kam_director_assignments')
        .insert({
          director_id: data.directorId,
          kam_id: data.kamId,
          company_id: data.companyId,
          assigned_by: user.id,
          assigned_at: new Date().toISOString(),
        });
      
      if (error) throw error;
      return result;
    },
  });
};
```

**Client to KAM Assignment:**
```typescript
// Each client can only be assigned to ONE KAM
export const useAssignClientToKAM = () => {
  return useMutation({
    mutationFn: async (data: {
      kamId: string;
      clientId: string;
      companyId: string;
    }) => {
      const { data: result, error } = await supabase
        .from('kam_client_assignments')
        .insert({
          kam_id: data.kamId,
          client_id: data.clientId,
          company_id: data.companyId,
          assigned_by: user.id,
          assigned_at: new Date().toISOString(),
        });
      
      if (error) {
        // Handle unique constraint violation (client already assigned)
        if (error.code === '23505') {
          throw new Error('Client is already assigned to another KAM');
        }
        throw error;
      }
      return result;
    },
  });
};
```

---

## File Locations Summary

| Purpose | Location | Notes |
|---------|----------|-------|
| System Admin creates company | `src/features/dashboard/systemadmin/SysAdDashboardPage.tsx` | Modify to handle Key Accounts |
| Edge Function for company creation | `supabase/functions/create-company/index.ts` | Add role logic for Key Accounts |
| Sales Admin user management | `src/features/key-accounts/SalesAdminDashboard.tsx` | NEW file |
| KAM/Director assignment | `src/features/key-accounts/components/DirectorKAMAssignment.tsx` | NEW file |
| Client/KAM assignment | `src/features/key-accounts/components/ClientKAMAssignment.tsx` | NEW file |
| Data hooks | `src/features/key-accounts/hooks.ts` | Already created |
| TypeScript types | `src/types/database.types.ts` | Already updated |
| Database migrations | `supabase/migrations/20260505000000_key_account_phase1_roles_and_tables.sql` | Already created |

---

## Next Steps for User Creation Feature

### Phase 1b: User Creation UI (Recommended after Phase 1)

1. **Modify Edge Function** `create-company` to set `sales_admin` role for Key Account companies
2. **Create Sales Admin Dashboard** for managing Key Account users
3. **Create assignment components** for KAM→Director and Client→KAM relationships
4. **Add validation** to ensure 1:1 client-to-KAM assignment
5. **Test user creation flow** end-to-end

### Permissions Summary

| Role | Can Create | Can View | Can Approve Orders |
|------|------------|----------|-------------------|
| system_administrator | All companies, All users | All companies | N/A |
| sales_admin | Directors, KAMs, Clients, Shops, Addresses | All company data | Final approval |
| sales_director | N/A | Their assigned KAMs and clients | First approval |
| key_account_manager | Shops, Addresses under their clients | Only their assigned clients | Create only |

---

## Questions?

If you need clarification on:
- Where to add the user creation UI
- How to modify the Edge Function
- How to handle edge cases (reassigning clients, director changes, etc.)

Please ask and I can provide more specific code examples.
