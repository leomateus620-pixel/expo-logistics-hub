
# Fix: Organization Creation Flow + Navigation Testing

## Problem Found

Two issues discovered during testing:

1. **403 on organization INSERT**: The `organizations` table INSERT succeeds, but the `.select('id')` call afterwards fails because the SELECT RLS policy requires the user to already be an org member. Since the org was just created and the member hasn't been added yet, the SELECT-back is blocked by RLS.

2. **406 on org_members query**: This is expected behavior (0 rows returned with `.single()` for a new user). The code already handles this correctly.

## Solution

Create a database function `create_org_with_member` (SECURITY DEFINER) that atomically:
- Creates the organization
- Adds the calling user as admin member
- Returns the org_id

Then update `useCurrentOrg.ts` to call this RPC instead of doing two separate inserts.

### Step 1: SQL Migration

Create a new `create_org_with_member` function:

```sql
CREATE OR REPLACE FUNCTION public.create_org_with_member(org_nome text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  caller_id uuid := auth.uid();
  caller_name text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get caller display name from auth metadata
  SELECT COALESCE(
    raw_user_meta_data->>'full_name',
    email
  ) INTO caller_name
  FROM auth.users WHERE id = caller_id;

  -- Create org
  INSERT INTO organizations (nome)
  VALUES (org_nome)
  RETURNING id INTO new_org_id;

  -- Add caller as admin
  INSERT INTO org_members (org_id, user_id, role, nome_exibicao)
  VALUES (new_org_id, caller_id, 'admin', caller_name);

  RETURN new_org_id;
END;
$$;
```

### Step 2: Update `useCurrentOrg.ts`

Change `createOrgMutation` to call the RPC:

```typescript
const { data, error } = await supabase.rpc('create_org_with_member', { org_nome: nome });
if (error) throw error;
localStorage.setItem(ORG_KEY, data);
return { id: data };
```

This eliminates the two-step INSERT problem entirely.

### Step 3: Verify Navigation

After the fix, re-test:
- Login -> Create Org -> Dashboard loads with bottom tabs
- Navigate to all 8 pages (Vehicles, Carts, Transports, Guests, Agenda, Checklist, Team, Settings)
- Verify mobile bottom tabs work correctly
