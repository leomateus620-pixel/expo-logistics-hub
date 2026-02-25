
-- Campos KM no transporte
ALTER TABLE public.transports
  ADD COLUMN km_retirada numeric,
  ADD COLUMN km_devolucao numeric;

-- Tabela de comissoes
CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commissions_select" ON public.commissions
  FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "commissions_insert" ON public.commissions
  FOR INSERT WITH CHECK (
    get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin','gestor']::org_role[])
  );
CREATE POLICY "commissions_update" ON public.commissions
  FOR UPDATE USING (
    get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin','gestor']::org_role[])
  );
CREATE POLICY "commissions_delete" ON public.commissions
  FOR DELETE USING (
    get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin','gestor']::org_role[])
  );

-- Campo comissao no membro
ALTER TABLE public.org_members ADD COLUMN commission_id uuid;
