-- Local synthetic dependencies only. Apply to an empty financial_expenses_qa database.
-- Financial tables, RPCs and policies come from the repository migrations afterward.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='qa_authenticator') THEN
    CREATE ROLE qa_authenticator LOGIN NOINHERIT PASSWORD 'financial-expenses-local-only'; END IF;
END $$;
GRANT authenticated, anon TO qa_authenticator;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
CREATE TABLE public.organizations (id uuid PRIMARY KEY);
CREATE TABLE public.org_members (org_id uuid, user_id uuid, role text, is_active boolean DEFAULT true,
  PRIMARY KEY (org_id,user_id));
CREATE TABLE public.user_capabilities (org_id uuid, user_id uuid, capability text);
CREATE TABLE public.commissions (id uuid PRIMARY KEY, org_id uuid, nome text, UNIQUE(id,org_id));
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id),
  title text NOT NULL, description text, amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho', created_by_user_id uuid NOT NULL,
  origem_lancamento text NOT NULL DEFAULT 'manual', cycle_year integer NOT NULL DEFAULT 2028,
  expense_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.map_projects (id uuid PRIMARY KEY, org_id uuid NOT NULL);
CREATE TABLE public.lot_sale_orders (id uuid PRIMARY KEY, project_id uuid NOT NULL, status text NOT NULL DEFAULT 'CONFIRMED');
CREATE TABLE public.lot_sale_installments (id uuid PRIMARY KEY, order_id uuid NOT NULL,
  installment_number integer NOT NULL, due_date date NOT NULL, amount numeric(14,2) NOT NULL,
  payment_status text NOT NULL DEFAULT 'PENDING');
CREATE FUNCTION public.is_org_member(_user uuid, _org uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT EXISTS (SELECT 1 FROM org_members WHERE user_id=_user AND org_id=_org AND is_active)
$$;
CREATE FUNCTION public.get_user_org_role(_user uuid, _org uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT role FROM org_members WHERE user_id=_user AND org_id=_org AND is_active
$$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT SELECT ON public.commissions TO authenticated;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY exp_select ON public.expenses FOR SELECT USING (is_org_member(auth.uid(),org_id));
CREATE POLICY exp_insert ON public.expenses FOR INSERT WITH CHECK (get_user_org_role(auth.uid(),org_id) IN ('admin','gestor','operador'));
CREATE POLICY exp_update ON public.expenses FOR UPDATE USING (get_user_org_role(auth.uid(),org_id) IN ('admin','gestor','operador'));
CREATE POLICY exp_delete ON public.expenses FOR DELETE USING (get_user_org_role(auth.uid(),org_id) IN ('admin','gestor'));
INSERT INTO public.organizations VALUES ('a0000000-0000-0000-0000-000000000001'),('b0000000-0000-0000-0000-000000000001');
-- admin, reader, editor, confirmer, operator without financial permissions, other-org admin
INSERT INTO public.org_members VALUES
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','admin',true),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','leitura',true),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','leitura',true),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','leitura',true),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','operador',true),
 ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','admin',true);
INSERT INTO public.user_capabilities VALUES
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','financial_access'),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','financial_edit'),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','financial_edit'),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','financial_confirm');
INSERT INTO public.commissions VALUES
 ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Infraestrutura (QA local)'),
 ('c0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','Comunicação (QA local)'),
 ('c0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','Cultura (QA local)'),
 ('c0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000001','Outra organização (QA local)');
