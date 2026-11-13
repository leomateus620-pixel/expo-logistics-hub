-- Read-only release checks. Reports counts and authorization predicates, without account identities.
WITH scope AS MATERIALIZED (
  SELECT s.org_id, s.commission_id, s.enabled
  FROM soja_store_private.scopes s
  JOIN public.commissions c ON c.org_id = s.org_id AND c.id = s.commission_id
  WHERE s.institutional_access AND c.is_active AND c.unit_type = 'comissao' AND c.slug = 'soja-store'
), active_members AS MATERIALIZED (
  SELECT m.org_id, m.user_id, m.role::text AS role,
    EXISTS (
      SELECT 1 FROM public.commission_people p
      JOIN public.commission_responsibles r ON r.person_id = p.id AND r.org_id = p.org_id
      WHERE p.org_id = m.org_id AND p.user_id = m.user_id
        AND r.commission_id = s.commission_id AND r.active AND r.responsible_type = 'pessoa'
    ) AS is_team
  FROM scope s
  JOIN public.org_members m ON m.org_id = s.org_id AND m.is_active
)
SELECT
  (SELECT count(*) FROM scope) AS canonical_scope_count,
  (SELECT coalesce(bool_and(enabled), false) FROM scope) AS scope_enabled,
  (SELECT count(*) FROM active_members WHERE role = 'admin') AS active_admin_accounts,
  (SELECT count(*) FROM active_members WHERE is_team) AS active_team_accounts,
  (SELECT count(*) FROM active_members WHERE role = 'admin' OR is_team) AS eligible_accounts,
  EXISTS (
    SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.org_members'::regclass
      AND t.tgname = 'soja_store_guard_org_member_access' AND t.tgenabled IN ('O', 'A')
      AND t.tgfoid = 'soja_store_private.guard_org_member_access()'::regprocedure
  ) AS membership_guard_enabled,
  NOT has_schema_privilege('authenticated', 'soja_store_private', 'USAGE') AS store_tables_private,
  NOT has_table_privilege('authenticated', 'public.commission_people', 'INSERT,UPDATE,DELETE,TRUNCATE')
    AND NOT has_any_column_privilege('authenticated', 'public.commission_people', 'INSERT,UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.commission_responsibles', 'INSERT,UPDATE,DELETE,TRUNCATE')
    AND NOT has_any_column_privilege('authenticated', 'public.commission_responsibles', 'INSERT,UPDATE') AS team_client_writes_denied,
  NOT has_function_privilege('authenticated', 'soja_store_private.operational_capabilities()', 'EXECUTE')
    AND NOT has_table_privilege('authenticated', 'soja_store_private.operational_capability_registry', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'soja_store_private.operational_capability_registry'::regclass)
    AS registry_private,
  NOT (soja_store_private.operational_capabilities() && ARRAY['imports.view', 'imports.manage']) AS imports_excluded,
  has_function_privilege('authenticated', 'public.soja_store_access(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.soja_store_access(uuid,uuid)', 'EXECUTE') AS access_rpc_authenticated;
