-- Empty Financeiro 2028 tables for running the versioned scenario RPC
-- against the same synthetic orders as the map. No allocations by default.
CREATE TABLE financial_editions (id uuid, org_id uuid, code integer, status text);
CREATE TABLE financial_scenario_sources (org_id uuid, edition_id uuid, project_id uuid);
CREATE TABLE financial_scenario_pavilions (project_id uuid, entity_id uuid, category text);
CREATE TABLE financial_obligations (id uuid, org_id uuid, edition_id uuid, source_type text,
  source_id uuid, direction text, settlement_inconsistent boolean);
CREATE TABLE financial_movement_allocations (org_id uuid, obligation_id uuid, movement_id uuid, amount_cents bigint);
CREATE TABLE financial_movements (id uuid, org_id uuid, edition_id uuid, created_at timestamptz);
CREATE TABLE financial_scenario_revenue_links (org_id uuid, edition_id uuid, revenue_id uuid, origin_id uuid, origin_kind text, category text);
CREATE TABLE financial_revenues (id uuid, org_id uuid, edition_id uuid, status text,
  confirmed_cents bigint, projected_cents bigint, updated_at timestamptz);
CREATE TABLE financial_sponsorships (id uuid, org_id uuid, edition_id uuid, negotiation_status text,
  confirmed_free_cents bigint, confirmed_rouanet_cents bigint, projected_free_cents bigint,
  projected_rouanet_cents bigint, updated_at timestamptz);
CREATE TABLE expenses (id uuid, org_id uuid, financial_edition_id uuid, financial_status text,
  committed_cents bigint, planned_cents bigint, financial_updated_at timestamptz);
CREATE TABLE financial_scenarios (org_id uuid, edition_id uuid, schema_version integer, scenario_key text,
  version integer, reference_key text, assumptions jsonb);
CREATE TABLE financial_scenario_observations (edition_id uuid, basis text, bucket timestamptz, observed_on date,
  amounts jsonb, coverage_complete boolean);

CREATE FUNCTION public.financial_require(p_org uuid, p_capability text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.map_has_explicit_capability(p_org, p_capability) IS NOT TRUE THEN RAISE EXCEPTION 'FINANCIAL_PERMISSION_DENIED'; END IF;
END;
$$;

INSERT INTO financial_editions SELECT '00000000-0000-4000-a000-000000002028', org_id, 2028, 'operacional' FROM map_projects;
INSERT INTO financial_scenario_sources SELECT e.org_id, e.id, p.id FROM financial_editions e JOIN map_projects p ON p.org_id = e.org_id;
INSERT INTO user_capabilities SELECT '00000000-0000-4000-a000-000000000010', org_id, 'financial_access' FROM financial_editions;
