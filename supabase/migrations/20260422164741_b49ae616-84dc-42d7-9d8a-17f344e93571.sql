-- Create fenasoja_events table
CREATE TABLE public.fenasoja_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  inicio_em timestamptz NOT NULL,
  fim_em timestamptz NOT NULL,
  local text,
  tipo_tag text,
  responsavel_user_id uuid,
  commission_id uuid,
  cover_color text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fenasoja_events_org_inicio ON public.fenasoja_events(org_id, inicio_em);

ALTER TABLE public.fenasoja_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY fe_select ON public.fenasoja_events
  FOR SELECT USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY fe_insert ON public.fenasoja_events
  FOR INSERT WITH CHECK (
    public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'operador'::org_role])
  );

CREATE POLICY fe_update ON public.fenasoja_events
  FOR UPDATE USING (
    public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'operador'::org_role])
  );

CREATE POLICY fe_delete ON public.fenasoja_events
  FOR DELETE USING (
    public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'operador'::org_role])
  );

CREATE TRIGGER trg_fenasoja_events_updated_at
  BEFORE UPDATE ON public.fenasoja_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();