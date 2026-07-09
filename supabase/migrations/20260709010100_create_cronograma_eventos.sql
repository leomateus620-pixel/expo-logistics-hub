CREATE TABLE IF NOT EXISTS public.cronograma_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL,
  event_type text NOT NULL,
  source_year integer NOT NULL,
  start_date date,
  end_date date,
  month_label text,
  week_label text,
  status text NOT NULL DEFAULT 'planejado',
  priority text NOT NULL DEFAULT 'media',
  location text,
  event_time text,
  days_remaining integer,
  commission_id uuid,
  commission_slug text,
  commission_name text,
  responsible_name text,
  responsible_user_id uuid,
  source_sheet text NOT NULL,
  source_row text,
  source_cell text,
  source_note text,
  is_official_seed boolean NOT NULL DEFAULT false,
  has_exact_date boolean NOT NULL DEFAULT true,
  linked_commissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  subevents jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cronograma_eventos_org_source_key_key UNIQUE (org_id, source_key),
  CONSTRAINT cronograma_eventos_status_check CHECK (status IN ('planejado', 'em_andamento', 'aguardando_definicao', 'aguardando_responsavel', 'concluido', 'cancelado')),
  CONSTRAINT cronograma_eventos_priority_check CHECK (priority IN ('baixa', 'media', 'alta', 'critica')),
  CONSTRAINT cronograma_eventos_dates_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.cronograma_subeventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_event_id uuid NOT NULL REFERENCES public.cronograma_eventos(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'planejado',
  priority text NOT NULL DEFAULT 'media',
  commission_slug text,
  responsible_name text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cronograma_subeventos_status_check CHECK (status IN ('planejado', 'em_andamento', 'aguardando_definicao', 'aguardando_responsavel', 'concluido', 'cancelado')),
  CONSTRAINT cronograma_subeventos_priority_check CHECK (priority IN ('baixa', 'media', 'alta', 'critica')),
  CONSTRAINT cronograma_subeventos_dates_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.cronograma_evento_responsaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.cronograma_eventos(id) ON DELETE CASCADE,
  name text,
  user_id uuid,
  role text,
  commission_slug text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cronograma_evento_comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.cronograma_eventos(id) ON DELETE CASCADE,
  commission_slug text NOT NULL,
  commission_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cronograma_evento_comissoes_unique UNIQUE (event_id, commission_slug)
);

CREATE TABLE IF NOT EXISTS public.cronograma_evento_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.cronograma_eventos(id) ON DELETE CASCADE,
  action text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cronograma_eventos_org_start ON public.cronograma_eventos(org_id, start_date);
CREATE INDEX IF NOT EXISTS idx_cronograma_eventos_org_year ON public.cronograma_eventos(org_id, source_year);
CREATE INDEX IF NOT EXISTS idx_cronograma_eventos_org_status ON public.cronograma_eventos(org_id, status);
CREATE INDEX IF NOT EXISTS idx_cronograma_eventos_org_type ON public.cronograma_eventos(org_id, event_type);
CREATE INDEX IF NOT EXISTS idx_cronograma_eventos_org_commission ON public.cronograma_eventos(org_id, commission_slug);
CREATE INDEX IF NOT EXISTS idx_cronograma_subeventos_parent ON public.cronograma_subeventos(parent_event_id);
CREATE INDEX IF NOT EXISTS idx_cronograma_evento_responsaveis_event ON public.cronograma_evento_responsaveis(event_id);
CREATE INDEX IF NOT EXISTS idx_cronograma_evento_comissoes_event ON public.cronograma_evento_comissoes(event_id);
CREATE INDEX IF NOT EXISTS idx_cronograma_evento_logs_event ON public.cronograma_evento_logs(event_id, created_at DESC);

ALTER TABLE public.cronograma_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cronograma_subeventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cronograma_evento_responsaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cronograma_evento_comissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cronograma_evento_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cronograma_eventos_select" ON public.cronograma_eventos
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "cronograma_eventos_insert" ON public.cronograma_eventos
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));

CREATE POLICY "cronograma_eventos_update" ON public.cronograma_eventos
  FOR UPDATE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor', 'operador'));

CREATE POLICY "cronograma_eventos_delete" ON public.cronograma_eventos
  FOR DELETE TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor'));

CREATE POLICY "cronograma_subeventos_select" ON public.cronograma_subeventos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = parent_event_id AND public.is_org_member(auth.uid(), e.org_id)
    )
  );

CREATE POLICY "cronograma_subeventos_insert" ON public.cronograma_subeventos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = parent_event_id AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin', 'gestor', 'operador')
    )
  );

CREATE POLICY "cronograma_subeventos_update" ON public.cronograma_subeventos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = parent_event_id AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin', 'gestor', 'operador')
    )
  );

CREATE POLICY "cronograma_subeventos_delete" ON public.cronograma_subeventos
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = parent_event_id AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin', 'gestor')
    )
  );

CREATE POLICY "cronograma_responsaveis_select" ON public.cronograma_evento_responsaveis
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id AND public.is_org_member(auth.uid(), e.org_id)
    )
  );

CREATE POLICY "cronograma_responsaveis_insert" ON public.cronograma_evento_responsaveis
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin', 'gestor', 'operador')
    )
  );

CREATE POLICY "cronograma_responsaveis_update" ON public.cronograma_evento_responsaveis
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin', 'gestor', 'operador')
    )
  );

CREATE POLICY "cronograma_responsaveis_delete" ON public.cronograma_evento_responsaveis
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin', 'gestor')
    )
  );

CREATE POLICY "cronograma_comissoes_select" ON public.cronograma_evento_comissoes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id AND public.is_org_member(auth.uid(), e.org_id)
    )
  );

CREATE POLICY "cronograma_comissoes_insert" ON public.cronograma_evento_comissoes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin', 'gestor', 'operador')
    )
  );

CREATE POLICY "cronograma_comissoes_update" ON public.cronograma_evento_comissoes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin', 'gestor', 'operador')
    )
  );

CREATE POLICY "cronograma_comissoes_delete" ON public.cronograma_evento_comissoes
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin', 'gestor')
    )
  );

CREATE POLICY "cronograma_logs_select" ON public.cronograma_evento_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin', 'gestor')
    )
  );

CREATE POLICY "cronograma_logs_insert" ON public.cronograma_evento_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id AND public.is_org_member(auth.uid(), e.org_id)
    )
  );

CREATE TRIGGER trg_cronograma_eventos_updated
  BEFORE UPDATE ON public.cronograma_eventos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_cronograma_subeventos_updated
  BEFORE UPDATE ON public.cronograma_subeventos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
