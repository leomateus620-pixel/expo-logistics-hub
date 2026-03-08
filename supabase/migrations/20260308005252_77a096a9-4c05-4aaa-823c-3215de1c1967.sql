
-- Create fuel records table
CREATE TABLE public.fuel_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  litros numeric NULL,
  valor numeric NULL,
  km_abastecimento numeric NULL,
  posto text NULL,
  observacoes text NULL,
  cupom_fiscal_url text NULL,
  registrado_por_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fuel_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_select" ON public.fuel_records FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "fuel_insert" ON public.fuel_records FOR INSERT TO authenticated
  WITH CHECK (get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));

CREATE POLICY "fuel_update" ON public.fuel_records FOR UPDATE TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));

CREATE POLICY "fuel_delete" ON public.fuel_records FOR DELETE TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

-- Storage bucket for fuel receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('fuel-receipts', 'fuel-receipts', true);

CREATE POLICY "fuel_receipts_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fuel-receipts');

CREATE POLICY "fuel_receipts_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fuel-receipts');

CREATE POLICY "fuel_receipts_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fuel-receipts');
