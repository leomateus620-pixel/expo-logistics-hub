
CREATE TABLE public.cronograma_evento_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.cronograma_eventos(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploader_name TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'documento' CHECK (kind IN ('foto','documento')),
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cronograma_evento_anexos_event ON public.cronograma_evento_anexos(event_id);
CREATE INDEX idx_cronograma_evento_anexos_org ON public.cronograma_evento_anexos(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_evento_anexos TO authenticated;
GRANT ALL ON public.cronograma_evento_anexos TO service_role;

ALTER TABLE public.cronograma_evento_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anexos_select_org_members"
  ON public.cronograma_evento_anexos FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "anexos_insert_org_members"
  ON public.cronograma_evento_anexos FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND uploaded_by = auth.uid());

CREATE POLICY "anexos_update_owner_or_admin"
  ON public.cronograma_evento_anexos FOR UPDATE
  TO authenticated
  USING (
    public.is_org_member(auth.uid(), org_id) AND (
      uploaded_by = auth.uid()
      OR public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor')
    )
  )
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "anexos_delete_owner_or_admin"
  ON public.cronograma_evento_anexos FOR DELETE
  TO authenticated
  USING (
    public.is_org_member(auth.uid(), org_id) AND (
      uploaded_by = auth.uid()
      OR public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor')
    )
  );

CREATE TRIGGER set_cronograma_evento_anexos_updated_at
  BEFORE UPDATE ON public.cronograma_evento_anexos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
