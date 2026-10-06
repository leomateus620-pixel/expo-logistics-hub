-- LOCAL SYNTHETIC FIXTURE ONLY. Never execute against a saved Supabase database.
-- Venue tables, RLS, replay, transitions, audits and occupancy routines below
-- are loaded from the checked-in migrations. Auth/storage/commission prerequisites
-- are minimal local scaffolding; this does not prove the deployed schema or RLS.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TYPE public.org_role AS ENUM ('admin','gestor','operador','membro','viewer','leitura');
CREATE TYPE public.audit_action AS ENUM ('create','update','delete','status_change','import');
CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL DEFAULT 'Organização sintética');
CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id uuid NOT NULL, role public.org_role NOT NULL DEFAULT 'membro', is_active boolean NOT NULL DEFAULT true,
  nome_exibicao text, UNIQUE(org_id,user_id)
);
CREATE TABLE public.user_capabilities (org_id uuid NOT NULL, user_id uuid NOT NULL, capability text NOT NULL, PRIMARY KEY(org_id,user_id,capability));
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, actor_user_id uuid,
  entity text NOT NULL, entity_id uuid, action public.audit_action NOT NULL,
  before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
CREATE FUNCTION storage.foldername(_name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(_name,'/') $$;
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE FUNCTION public.is_org_member(_user uuid,_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM public.org_members WHERE user_id=_user AND org_id=_org AND is_active)
$$;
CREATE FUNCTION public.get_user_org_role(_user uuid,_org uuid) RETURNS public.org_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.org_members WHERE user_id=_user AND org_id=_org AND is_active
$$;
CREATE FUNCTION public.has_capability(_user uuid,_org uuid,_cap text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.is_org_member(_user,_org) AND (
    (public.get_user_org_role(_user,_org) IN ('admin','gestor','operador') AND NOT EXISTS(
      SELECT 1 FROM public.user_capabilities WHERE user_id=_user AND org_id=_org AND capability='restricted_scope'))
    OR EXISTS(SELECT 1 FROM public.user_capabilities WHERE user_id=_user AND org_id=_org AND capability IN (_cap,'full_access')))
$$;
CREATE FUNCTION public.cronograma_can_view_planning(_user uuid,_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_capabilities WHERE user_id=_user AND org_id=_org AND capability='cronograma_planning_access')
$$;
CREATE FUNCTION public.has_scoped_cronograma_access(_user uuid,_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_capabilities WHERE user_id=_user AND org_id=_org AND capability='cronograma_scoped_access')
$$;
GRANT USAGE ON SCHEMA public,auth,storage,extensions TO authenticated,anon,service_role;
GRANT SELECT ON public.org_members,public.user_capabilities TO authenticated;

\ir ../../supabase/migrations/20260709010100_create_cronograma_eventos.sql
ALTER TABLE public.cronograma_eventos ADD COLUMN lock_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN category_key text, ADD COLUMN start_time time, ADD COLUMN end_time time,
  ADD COLUMN pending_reason text, ADD COLUMN decision_needed text,
  ADD COLUMN planning_restricted boolean NOT NULL DEFAULT false,
  ADD COLUMN origin_source text NOT NULL DEFAULT 'agenda_central', ADD COLUMN origin_commission_id uuid,
  ADD COLUMN notify_all_commission_members boolean NOT NULL DEFAULT false;
ALTER TABLE public.cronograma_subeventos ADD COLUMN org_id uuid, ADD COLUMN lock_version bigint DEFAULT 1;
ALTER TABLE public.cronograma_evento_logs ADD COLUMN entity_type text, ADD COLUMN entity_id uuid, ADD COLUMN request_id text;
CREATE TABLE public.cronograma_evento_tombstones (
  org_id uuid NOT NULL, source_key text NOT NULL, deleted_event_id uuid, deleted_by_user_id uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,source_key)
);
CREATE TABLE public.qa_scoped_event_access (event_id uuid NOT NULL,user_id uuid NOT NULL,PRIMARY KEY(event_id,user_id));
CREATE FUNCTION public.cronograma_scoped_event_visible(_event uuid,_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM public.qa_scoped_event_access WHERE event_id=_event AND user_id=_user)
$$;
CREATE POLICY qa_source_visibility ON public.cronograma_eventos AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT planning_restricted OR public.cronograma_can_view_planning(auth.uid(),org_id))
    AND (NOT public.has_scoped_cronograma_access(auth.uid(),org_id) OR created_by_user_id=auth.uid()
      OR public.cronograma_scoped_event_visible(id,auth.uid())))
  WITH CHECK ((NOT planning_restricted OR public.cronograma_can_view_planning(auth.uid(),org_id))
    AND (NOT public.has_scoped_cronograma_access(auth.uid(),org_id) OR created_by_user_id=auth.uid()
      OR public.cronograma_scoped_event_visible(id,auth.uid())));
CREATE VIEW public.cronograma_eventos_full WITH(security_invoker=true) AS SELECT e.* FROM public.cronograma_eventos e;
CREATE FUNCTION public._cronograma_require_writer(_org_id uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF auth.uid() IS NULL OR NOT public.has_capability(auth.uid(),_org_id,'cronograma_eventos_write') THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: usuário sem permissão de escrita';
  END IF;
END $$;
CREATE FUNCTION public._cronograma_log(_event uuid,_type text,_entity uuid,_action text,_before jsonb,_after jsonb,_request text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.cronograma_evento_logs(event_id,entity_type,entity_id,action,previous_value,new_value,user_id,request_id)
  VALUES(_event,_type,_entity,_action,_before,_after,auth.uid(),_request)
$$;
-- These existing relationship routines are outside the bridge test scope.
-- Reject nonempty fixtures instead of silently claiming relationship coverage.
CREATE FUNCTION public._cronograma_apply_event_commissions(_event uuid,_org uuid,_items jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF jsonb_array_length(coalesce(_items,'[]'::jsonb))>0 THEN RAISE EXCEPTION 'Commission fixture outside bridge scope'; END IF;
END $$;
CREATE FUNCTION public._cronograma_apply_event_responsibles(_event uuid,_org uuid,_items jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF jsonb_array_length(coalesce(_items,'[]'::jsonb))>0 THEN RAISE EXCEPTION 'Responsible fixture outside bridge scope'; END IF;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.cronograma_eventos,public.cronograma_subeventos,
  public.cronograma_evento_logs,public.cronograma_evento_tombstones TO authenticated;
GRANT SELECT ON public.cronograma_eventos_full TO authenticated;
\ir ../../supabase/migrations/20260812175755_22190adb-4709-47fd-b3f7-e483201e7cda.sql
\ir ../../supabase/migrations/20260727213855_e641c831-878e-4983-a4c7-ce5fa5d3aaa5.sql
-- Tests supply deterministic synthetic spaces and booking units themselves.
ALTER TABLE public.organizations DISABLE TRIGGER trg_venue_seed_new_org_defaults;
\ir ../../supabase/migrations/20260727160100_create_venue_events_transactions.sql
\ir ../../supabase/migrations/20260727214559_4eb4b9bb-7fb5-4781-b848-ee471b976d91.sql
\ir ../../supabase/migrations/20260727214922_f34ac08d-05e4-41e8-ba92-5f270abcb6e1.sql
\ir ../../supabase/migrations/20260911083527_6661cf30-0f57-43e3-ba94-67170aa37ea1.sql
\ir ../../supabase/migrations/20260911103138_a6eaed17-6a1d-4dca-8aaf-78378a3fccaf.sql
\ir ../../supabase/migrations/20260909213114_0a84fa18-d1f6-4c84-a7e3-44d55d0d0c87.sql
\ir ../../supabase/migrations/20260902191713_c9b1c2b5-572e-4b8f-9965-81f84a0350fe.sql
\ir ../../supabase/migrations/20261004053555_afa52b95-e261-49c5-ab25-a41bef43591d.sql
\ir ../../supabase/migrations/20261004053702_6e7cb077-565f-4663-bace-6198eb1d2e06.sql
CREATE OR REPLACE VIEW public.cronograma_eventos_full WITH(security_invoker=true) AS SELECT e.* FROM public.cronograma_eventos e;
\ir unit-fixture.sql
