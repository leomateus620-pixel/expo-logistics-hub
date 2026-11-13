BEGIN;

-- Apply explicitly after verifying the deployed create-user endpoint restricts account administration
-- and provisioning to authorized administrators of the target organization.
DO $$
DECLARE
  v_org uuid;
  v_commission uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.org_members'::regclass
      AND t.tgname = 'soja_store_guard_org_member_access' AND t.tgenabled IN ('O', 'A')
      AND t.tgfoid = 'soja_store_private.guard_org_member_access()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'SOJA_STORE_MEMBERSHIP_GUARD_REQUIRED';
  END IF;

  IF has_table_privilege('authenticated', 'public.commission_people', 'INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_any_column_privilege('authenticated', 'public.commission_people', 'INSERT,UPDATE')
    OR has_table_privilege('authenticated', 'public.commission_responsibles', 'INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_any_column_privilege('authenticated', 'public.commission_responsibles', 'INSERT,UPDATE') THEN
    RAISE EXCEPTION 'SOJA_STORE_TEAM_DIRECT_WRITES_FORBIDDEN';
  END IF;

  SELECT s.org_id, s.commission_id INTO STRICT v_org, v_commission
  FROM soja_store_private.scopes s
  JOIN public.commissions c ON c.id = s.commission_id AND c.org_id = s.org_id
  WHERE s.institutional_access AND c.is_active AND c.unit_type = 'comissao' AND c.slug = 'soja-store'
  FOR UPDATE OF s;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = v_org AND m.is_active AND m.role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'SOJA_STORE_ACTIVE_ADMIN_REQUIRED';
  END IF;

  UPDATE soja_store_private.scopes SET enabled = true
  WHERE org_id = v_org AND commission_id = v_commission;
EXCEPTION
  WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'SOJA_STORE_CANONICAL_SCOPE_UNRESOLVED';
END;
$$;

COMMIT;
