-- LOCAL TEST FIXTURE ONLY. Never run against a saved or published Supabase database.
-- The financial view is loaded separately from the actual checked-in migration.
-- Minimal table columns retain the real PK, FK, UNIQUE and RLS expressions.
-- Auth helper implementations below use synthetic JWT claims instead of the
-- application's membership/capability tables; this is not production auth proof.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE dashboard_authenticator LOGIN NOINHERIT;
GRANT authenticated, anon TO dashboard_authenticator;

CREATE FUNCTION public.test_claims() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
CREATE FUNCTION public.map_has_explicit_capability(org uuid, capability text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(public.test_claims()->'capabilities' ? capability, false)
$$;
CREATE FUNCTION public.can_view_commercial_map(org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(public.test_claims()->'capabilities' ? 'map.view', false)
    AND public.test_claims()->>'org_id' = org::text
$$;
CREATE FUNCTION public.map_can_access_segment(segment uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(public.test_claims()->'segments' ? segment::text, false)
$$;

CREATE TABLE public.map_projects (id uuid PRIMARY KEY, org_id uuid NOT NULL);
CREATE TABLE public.map_segments (id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES public.map_projects);
CREATE TABLE public.map_entities (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES public.map_projects,
  segment_id uuid REFERENCES public.map_segments, public_identifier text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, is_archived boolean NOT NULL DEFAULT false
);
CREATE TABLE public.commercial_lots (
  id uuid PRIMARY KEY, entity_id uuid NOT NULL UNIQUE CONSTRAINT commercial_lots_entity_id_fkey REFERENCES public.map_entities,
  project_id uuid NOT NULL REFERENCES public.map_projects, public_identifier text NOT NULL,
  block text, lot_number text, status text NOT NULL, official_area_sqm numeric(14,4),
  area_validation_status text NOT NULL DEFAULT 'VALIDATED', archived_at timestamptz
);
CREATE TABLE public.lot_sales (
  id uuid PRIMARY KEY, lot_id uuid NOT NULL REFERENCES public.commercial_lots,
  status text NOT NULL, negotiated_value numeric(14,2), buyer_name text, sale_date date,
  salesperson_name text, contract_number text, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.lot_prices (
  id uuid PRIMARY KEY, lot_id uuid NOT NULL REFERENCES public.commercial_lots,
  is_active boolean, pricing_mode text, base_price numeric, price_per_sqm numeric,
  asking_price numeric, minimum_price numeric
);
CREATE TABLE public.lot_reservations (
  id uuid PRIMARY KEY, lot_id uuid NOT NULL REFERENCES public.commercial_lots,
  status text, company_name text, expires_at timestamptz, responsible_name text
);
CREATE TABLE public.lot_negotiations (id uuid PRIMARY KEY, lot_id uuid NOT NULL REFERENCES public.commercial_lots, status text, company_name text);
CREATE TABLE public.lot_contracts (id uuid PRIMARY KEY, lot_id uuid NOT NULL REFERENCES public.commercial_lots, is_active boolean, contract_number text);
CREATE TABLE public.commercial_lot_corner_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lot_id uuid NOT NULL UNIQUE REFERENCES public.commercial_lots,
  project_id uuid NOT NULL REFERENCES public.map_projects, classification text NOT NULL
);
CREATE TABLE public.commercial_price_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), stage text NOT NULL, is_active boolean NOT NULL DEFAULT true,
  exercise int NOT NULL DEFAULT 2028, scope_type text NOT NULL DEFAULT 'BLOCK', project_id uuid REFERENCES public.map_projects,
  pavilion_identifier text, block text, range_start int, range_end int, is_corner boolean,
  priority int NOT NULL DEFAULT 100, label text NOT NULL, price_per_sqm numeric(12,2)
);
CREATE TABLE public.commercial_lot_price_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lot_id uuid NOT NULL REFERENCES public.commercial_lots,
  stage text NOT NULL, total numeric(14,2) NOT NULL CHECK(total >= 0), UNIQUE(lot_id, stage)
);

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated, anon;
ALTER TABLE public.map_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_price_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_lot_corner_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_lot_price_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY map_projects_select ON public.map_projects FOR SELECT TO authenticated
  USING(public.can_view_commercial_map(org_id) OR EXISTS(SELECT 1 FROM public.map_segments s WHERE s.project_id = map_projects.id AND public.map_can_access_segment(s.id)));
CREATE POLICY map_entities_select ON public.map_entities FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.can_view_commercial_map(p.org_id)));
-- Existing expressions: 20260805011308 + 20260805024306 + 20260929211814.
CREATE POLICY map_entities_commission_segment_select ON public.map_entities FOR SELECT TO authenticated
  USING(is_archived = false AND segment_id IS NOT NULL AND public.map_can_access_segment(segment_id));
CREATE POLICY commercial_lots_select ON public.commercial_lots FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.map_projects p WHERE p.id = project_id AND public.can_view_commercial_map(p.org_id)));
CREATE POLICY commercial_lots_commission_segment_select ON public.commercial_lots FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.map_entities entity WHERE entity.id = commercial_lots.entity_id
    AND entity.project_id = commercial_lots.project_id AND entity.is_archived = false AND commercial_lots.archived_at IS NULL
    AND entity.segment_id IS NOT NULL AND public.map_can_access_segment(entity.segment_id)));
CREATE POLICY lot_sales_restricted ON public.lot_sales FOR ALL TO authenticated
  USING(EXISTS(SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id
    WHERE l.id = lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_sales')))
  WITH CHECK(EXISTS(SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id
    WHERE l.id = lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_sales')));
CREATE POLICY lot_sales_commission_segment_select ON public.lot_sales FOR SELECT TO authenticated
  USING(status = 'CONFIRMED' AND EXISTS(SELECT 1 FROM public.commercial_lots lot JOIN public.map_entities entity ON entity.id = lot.entity_id
    WHERE lot.id = lot_sales.lot_id AND lot.project_id = entity.project_id AND lot.archived_at IS NULL
    AND entity.is_archived = false AND entity.segment_id IS NOT NULL AND public.map_can_access_segment(entity.segment_id)));
CREATE POLICY commercial_price_rules_select ON public.commercial_price_rules FOR SELECT TO authenticated
  USING(project_id IS NULL OR EXISTS(SELECT 1 FROM public.map_projects p WHERE p.id = commercial_price_rules.project_id AND public.can_view_commercial_map(p.org_id)));
CREATE POLICY "Commission segment reads price rules" ON public.commercial_price_rules FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.map_segments s WHERE (commercial_price_rules.project_id IS NULL OR s.project_id = commercial_price_rules.project_id) AND public.map_can_access_segment(s.id)));
CREATE POLICY commercial_lot_corner_audit_select ON public.commercial_lot_corner_audit FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.map_projects p WHERE p.id = commercial_lot_corner_audit.project_id AND public.can_view_commercial_map(p.org_id)));
CREATE POLICY "Commission segment reads corner audit" ON public.commercial_lot_corner_audit FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.commercial_lots l JOIN public.map_entities e ON e.id = l.entity_id
    WHERE l.id = commercial_lot_corner_audit.lot_id AND e.segment_id IS NOT NULL AND public.map_can_access_segment(e.segment_id)));
CREATE POLICY "Map viewers read price overrides" ON public.commercial_lot_price_overrides FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id WHERE l.id = lot_id AND public.can_view_commercial_map(p.org_id)));
CREATE POLICY "Commission segment reads price overrides" ON public.commercial_lot_price_overrides FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.commercial_lots l JOIN public.map_entities e ON e.id = l.entity_id WHERE l.id = commercial_lot_price_overrides.lot_id
    AND l.archived_at IS NULL AND NOT e.is_archived AND e.segment_id IS NOT NULL AND public.map_can_access_segment(e.segment_id)));

INSERT INTO public.map_projects VALUES
 ('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002');
INSERT INTO public.map_segments VALUES
 ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
 ('50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001'),
 ('50000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002');
INSERT INTO public.map_entities(id,project_id,segment_id,public_identifier,is_archived)
 SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  CASE WHEN n BETWEEN 1206 AND 1208 OR n=1210 THEN '30000000-0000-4000-8000-000000000002'::uuid ELSE '30000000-0000-4000-8000-000000000001'::uuid END,
  CASE WHEN n BETWEEN 1206 AND 1208 OR n=1210 THEN '50000000-0000-4000-8000-000000000003'::uuid WHEN n <= 1100 THEN '50000000-0000-4000-8000-000000000001'::uuid ELSE '50000000-0000-4000-8000-000000000002'::uuid END,
  'FIXTURE-'||n,n=1210 FROM generate_series(1,1210) n;
INSERT INTO public.commercial_lots(id,entity_id,project_id,public_identifier,block,lot_number,status,official_area_sqm,archived_at)
 SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  CASE WHEN n BETWEEN 1206 AND 1208 OR n=1210 THEN '30000000-0000-4000-8000-000000000002'::uuid ELSE '30000000-0000-4000-8000-000000000001'::uuid END,
  'FIXTURE-'||n,CASE WHEN n IN(2,3) THEN 'T' WHEN n=4 THEN 'U' ELSE 'R' END,n::text,
  CASE WHEN n<=5 THEN 'SALE_OPEN' WHEN n=6 THEN 'SOLD' ELSE 'AVAILABLE' END,
  CASE WHEN n=5 THEN NULL ELSE 100 END,CASE WHEN n=1209 THEN '2026-01-01'::timestamptz ELSE NULL END FROM generate_series(1,1210) n;
INSERT INTO public.commercial_price_rules(stage,block,label,price_per_sqm) VALUES
 ('RENOVACAO','R','Renewal R',10),('SEGUNDA_ETAPA','R','Second R',20),
 ('RENOVACAO','T','Tie T renewal A',11),('RENOVACAO','T','Tie T renewal B',12),('SEGUNDA_ETAPA','T','Second T',20),
 ('RENOVACAO','U','Tie U renewal A',11),('RENOVACAO','U','Tie U renewal B',12),
 ('SEGUNDA_ETAPA','U','Tie U second A',21),('SEGUNDA_ETAPA','U','Tie U second B',22);
INSERT INTO public.commercial_lot_price_overrides(lot_id,stage,total) VALUES
 ('10000000-0000-4000-8000-000000000004','RENOVACAO',50),('10000000-0000-4000-8000-000000000004','SEGUNDA_ETAPA',0),
 ('10000000-0000-4000-8000-000000000006','SEGUNDA_ETAPA',0);
INSERT INTO public.lot_sales(id,lot_id,status,negotiated_value,created_at) VALUES
 ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','OPEN',1250,'2026-01-01'),
 ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','OPEN',1000,'2026-01-01'),
 ('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','OPEN',1000,'2026-01-01'),
 ('60000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','OPEN',0,'2026-01-01'),
 ('60000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004','REVERTED',999,'2026-01-01'),
 ('60000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000005','CONFIRMED',1500,'2026-01-01'),
 ('60000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000006','CONFIRMED',800,'2026-01-01');
