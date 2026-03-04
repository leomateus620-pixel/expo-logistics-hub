

# Fix Security Audit: Auth + RLS Issues

## Problems Identified

**Problem 1: Edge Function auth is broken.** Line 170 calls `callerClient.auth.getClaims(token)` which does not exist in the Supabase JS client. This causes the function to fail or return 401 for JWT-authenticated users.

**Problem 2: "Ver relatório completo" fails due to RLS.** The `security_audit_reports` table SELECT policy only allows `admin` role. Since operadores can now run audits, they cannot read their own reports back, causing "Erro ao carregar relatório".

## Fixes

### 1. Edge Function (`supabase/functions/security-audit-selfcheck/index.ts`)

Replace the broken `getClaims` auth flow (lines 164-177) with `getUser()`:

```typescript
const callerClient = createClient(supabaseUrl, anonKey, {
  global: { headers: { Authorization: authHeader } },
});
const { data: { user }, error: userError } = await callerClient.auth.getUser();
if (userError || !user) {
  return 401 error;
}
callerUserId = user.id;
```

### 2. Database Migration

Update the SELECT and INSERT RLS policies on `security_audit_reports` to allow both `admin` and `operador`:

```sql
DROP POLICY "audit_reports_select" ON security_audit_reports;
CREATE POLICY "audit_reports_select" ON security_audit_reports
  FOR SELECT TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) IN ('admin', 'operador'));

DROP POLICY "audit_reports_insert" ON security_audit_reports;
CREATE POLICY "audit_reports_insert" ON security_audit_reports
  FOR INSERT TO authenticated
  WITH CHECK (get_user_org_role(auth.uid(), org_id) IN ('admin', 'operador'));
```

### Files Changed
- `supabase/functions/security-audit-selfcheck/index.ts` — fix auth method
- Migration — update RLS policies

