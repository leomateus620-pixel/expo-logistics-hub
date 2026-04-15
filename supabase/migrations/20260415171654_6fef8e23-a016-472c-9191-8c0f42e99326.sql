
-- Table for public access links per committee
CREATE TABLE public.public_form_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  committee_id uuid NOT NULL REFERENCES public.official_committees(id) ON DELETE CASCADE,
  committee_name_snapshot text NOT NULL,
  president_name_snapshot text NOT NULL,
  token_hash text NOT NULL,
  token_hint text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One link per committee per org
CREATE UNIQUE INDEX idx_pfl_org_committee ON public.public_form_links (org_id, committee_id);
-- Fast lookup by token hash
CREATE UNIQUE INDEX idx_pfl_token_hash ON public.public_form_links (token_hash);

-- Enable RLS
ALTER TABLE public.public_form_links ENABLE ROW LEVEL SECURITY;

-- Only admin/gestor can manage links
CREATE POLICY "pfl_select" ON public.public_form_links
  FOR SELECT USING (
    get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor')
  );

CREATE POLICY "pfl_insert" ON public.public_form_links
  FOR INSERT WITH CHECK (
    get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor')
  );

CREATE POLICY "pfl_update" ON public.public_form_links
  FOR UPDATE USING (
    get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor')
  );

CREATE POLICY "pfl_delete" ON public.public_form_links
  FOR DELETE USING (
    get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor')
  );

-- Auto-update updated_at
CREATE TRIGGER set_pfl_updated_at
  BEFORE UPDATE ON public.public_form_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
