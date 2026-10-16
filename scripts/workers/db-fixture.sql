-- Local isolated PostgreSQL/PGlite fixture only. Never run against production.
CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true),''),'authenticated');
$$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
CREATE TABLE public.organizations(id uuid PRIMARY KEY, nome text);
CREATE TABLE public.org_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, user_id uuid NOT NULL, role text NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.user_capabilities(org_id uuid NOT NULL, user_id uuid NOT NULL, capability text NOT NULL);
CREATE FUNCTION public.is_org_member(_user_id uuid,_org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM public.org_members WHERE user_id=_user_id AND org_id=_org_id AND is_active);
$$;
CREATE FUNCTION public.get_user_org_role(_user_id uuid,_org_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.org_members WHERE user_id=_user_id AND org_id=_org_id AND is_active LIMIT 1;
$$;
CREATE FUNCTION public.has_capability(_user_id uuid,_org_id uuid,_capability text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(public.get_user_org_role(_user_id,_org_id) IN ('admin','gestor','operador'),false)
    OR EXISTS(SELECT 1 FROM public.user_capabilities WHERE user_id=_user_id AND org_id=_org_id AND capability IN (_capability,'full_access'));
$$;
-- Same authorization semantics as 20260805023923: operator does not inherit sales.
CREATE FUNCTION public.map_has_explicit_capability(_org_id uuid,_capability text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT auth.role()='service_role' OR (public.is_org_member(auth.uid(),_org_id) AND (
    public.get_user_org_role(auth.uid(),_org_id) IN ('admin','gestor')
    OR EXISTS (SELECT 1 FROM public.user_capabilities c WHERE c.user_id=auth.uid() AND c.org_id=_org_id AND c.capability IN (_capability,'map.admin','full_access'))));
$$;
CREATE TABLE public.map_projects(id uuid PRIMARY KEY,org_id uuid NOT NULL);
CREATE TABLE public.public_map_links(id uuid PRIMARY KEY,org_id uuid NOT NULL,project_id uuid NOT NULL,slug text NOT NULL,display_name text NOT NULL,scope_kind text NOT NULL,sort_order integer NOT NULL DEFAULT 0,is_active boolean NOT NULL DEFAULT false,token text,token_hash text);
CREATE TABLE public.public_map_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),link_id uuid NOT NULL,event_type text NOT NULL,session_id text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),duration_seconds integer,metadata jsonb NOT NULL DEFAULT '{}');

INSERT INTO auth.users SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,7) n;
INSERT INTO public.organizations VALUES ('10000000-0000-4000-8000-000000000001','Fenasoja fixture'),('10000000-0000-4000-8000-000000000002','Outra organização fixture');
INSERT INTO public.org_members(org_id,user_id,role) VALUES
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','admin'),
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','gestor'),
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','operador'),
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','leitura'),
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005','leitura'),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006','admin'),
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007','leitura');
INSERT INTO public.user_capabilities VALUES
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','map.analytics.view'),
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005','map.analytics.view'),
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005','map.manage_sales'),
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007','map.manage_sales');
INSERT INTO public.map_projects VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
INSERT INTO public.public_map_links(id,org_id,project_id,slug,display_name,scope_kind,token,token_hash) VALUES
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','area-fixture-1','Área autorizada','PAVILION','NEVER_RETURN_TOKEN','NEVER_RETURN_HASH'),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','area-fixture-2','Área de outra org','SEGMENT','OTHER_TOKEN','OTHER_HASH');
INSERT INTO public.public_map_events(link_id,event_type,session_id,metadata) VALUES
  ('30000000-0000-4000-8000-000000000001','area_visit','private-session-1','{"email":"NEVER_RETURN_EMAIL"}'),
  ('30000000-0000-4000-8000-000000000001','lot_selected','private-session-1','{}'),
  ('30000000-0000-4000-8000-000000000002','area_visit','private-session-2','{}');

CREATE FUNCTION public.workers_test_assert(condition boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; END $$;
CREATE FUNCTION public.workers_test_denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR foreign_key_violation OR invalid_parameter_value OR program_limit_exceeded OR object_not_in_prerequisite_state THEN RETURN;
  END;
  RAISE EXCEPTION 'EXPECTED DENIAL: %',label;
END $$;
GRANT EXECUTE ON FUNCTION public.workers_test_assert(boolean,text),public.workers_test_denied(text,text) TO authenticated,anon;
