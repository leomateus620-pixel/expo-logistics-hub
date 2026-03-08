
-- Scooters table (same structure as electric_carts)
CREATE TABLE public.scooters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  codigo text NOT NULL,
  nome text,
  status public.cart_status NOT NULL DEFAULT 'disponivel',
  responsavel_user_id uuid,
  comissao text,
  retirada_em timestamptz,
  devolucao_prevista_em timestamptz,
  devolucao_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scooters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scooters_select" ON public.scooters FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "scooters_insert" ON public.scooters FOR INSERT TO authenticated
  WITH CHECK (get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));
CREATE POLICY "scooters_update" ON public.scooters FOR UPDATE TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));
CREATE POLICY "scooters_delete" ON public.scooters FOR DELETE TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

-- Scooter history table (same structure as cart_history)
CREATE TABLE public.scooter_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  scooter_id uuid NOT NULL REFERENCES public.scooters(id),
  action public.cart_action NOT NULL,
  before_data jsonb,
  after_data jsonb,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scooter_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scooter_history_select" ON public.scooter_history FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "scooter_history_insert" ON public.scooter_history FOR INSERT TO authenticated
  WITH CHECK (is_org_member(auth.uid(), org_id));
