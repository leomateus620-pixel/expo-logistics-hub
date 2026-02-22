

# Fix: All Menu Items Failing with RLS Error

## Root Cause

There are zero organizations and zero org_members in the database. Every table (vehicles, electric_carts, transports, guests, events, tasks, schedules) has RLS policies that check `is_org_member(auth.uid(), org_id)`. Without an org membership, nothing can be created anywhere.

## Solution

### Step 1: SQL Migration - Create atomic org+member function and add comissao field

Create the `create_org_with_member` RPC function (SECURITY DEFINER) that:
- Creates an organization
- Adds the calling user as admin member
- Returns the org_id
- Bypasses the RLS chicken-and-egg problem

Also add the `comissao` column to `electric_carts` for the plan's next steps.

```sql
CREATE OR REPLACE FUNCTION public.create_org_with_member(org_nome text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id uuid;
  caller_id uuid := auth.uid();
  caller_name text;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COALESCE(raw_user_meta_data->>'full_name', email)
    INTO caller_name FROM auth.users WHERE id = caller_id;
  INSERT INTO organizations (nome) VALUES (org_nome) RETURNING id INTO new_org_id;
  INSERT INTO org_members (org_id, user_id, role, nome_exibicao)
    VALUES (new_org_id, caller_id, 'admin', caller_name);
  RETURN new_org_id;
END; $$;

ALTER TABLE public.electric_carts ADD COLUMN IF NOT EXISTS comissao text;
```

### Step 2: Update useCurrentOrg.ts

Change `createOrgMutation` to call the RPC instead of doing two separate inserts:

```typescript
const { data, error } = await (supabase as any).rpc('create_org_with_member', { org_nome: nome });
if (error) throw error;
localStorage.setItem(ORG_KEY, data);
return { id: data };
```

### Step 3: Auto-create org on first load

Since the "Create Organization" screen was removed, update `OrgGuard.tsx` to automatically create a default org when the user has none, so the app works immediately after login.

### Step 4: Seed initial org for existing users

Insert a default organization and add the main admin user (fenasojalog@gmail.com) as admin, so the current logged-in user can immediately use all features.

## Expected Result

After these changes:
- The logged-in user will have an org membership
- All RLS policies will pass
- Vehicles, carts, transports, guests, events, tasks, and schedules will all work correctly
