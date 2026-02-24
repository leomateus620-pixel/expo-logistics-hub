
CREATE TABLE public.vehicle_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  responsavel_user_id uuid,
  km_saida numeric NOT NULL,
  km_chegada numeric,
  km_rodados numeric GENERATED ALWAYS AS (
    CASE WHEN km_chegada IS NOT NULL THEN km_chegada - km_saida ELSE NULL END
  ) STORED,
  retirada_em timestamptz NOT NULL DEFAULT now(),
  devolucao_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_usage_select" ON public.vehicle_usage
  FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "vehicle_usage_insert" ON public.vehicle_usage
  FOR INSERT WITH CHECK (
    get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin','gestor','operador']::org_role[])
  );
CREATE POLICY "vehicle_usage_update" ON public.vehicle_usage
  FOR UPDATE USING (
    get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin','gestor','operador']::org_role[])
  );
CREATE POLICY "vehicle_usage_delete" ON public.vehicle_usage
  FOR DELETE USING (
    get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin','gestor']::org_role[])
  );
