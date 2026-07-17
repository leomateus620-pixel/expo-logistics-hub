
-- ============================================================
-- M1 — Base relacional Cronograma e Eventos (idempotente)
-- ============================================================

-- Trigger genérico de updated_at já existe (public.set_updated_at)

-- =================== cronograma_eventos =====================
CREATE TABLE IF NOT EXISTS public.cronograma_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'Outros / a classificar',
  event_type text NOT NULL DEFAULT 'planejamento',
  source_year integer NOT NULL DEFAULT 2028,
  start_date date,
  end_date date,
  month_label text,
  week_label text,
  status text NOT NULL DEFAULT 'planejado',
  priority text NOT NULL DEFAULT 'media',
  location text,
  event_time text,
  days_remaining integer,
  commission_slug text,
  commission_name text,
  responsible_name text,
  source_sheet text NOT NULL DEFAULT 'Cadastro manual',
  source_row text,
  source_cell text,
  source_note text,
  is_official_seed boolean NOT NULL DEFAULT false,
  has_exact_date boolean NOT NULL DEFAULT true,
  linked_commissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  subevents jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cronograma_eventos_source_key_org_unique UNIQUE (org_id, source_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_eventos TO authenticated;
GRANT ALL ON public.cronograma_eventos TO service_role;

ALTER TABLE public.cronograma_eventos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cronograma_eventos_org_start_idx
  ON public.cronograma_eventos (org_id, start_date);
CREATE INDEX IF NOT EXISTS cronograma_eventos_org_year_idx
  ON public.cronograma_eventos (org_id, source_year, start_date);
CREATE INDEX IF NOT EXISTS cronograma_eventos_org_status_idx
  ON public.cronograma_eventos (org_id, status);

DO $$ BEGIN
  CREATE POLICY "cronograma_eventos_select" ON public.cronograma_eventos
    FOR SELECT TO authenticated
    USING (public.is_org_member(auth.uid(), org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cronograma_eventos_insert" ON public.cronograma_eventos
    FOR INSERT TO authenticated
    WITH CHECK (
      public.is_org_member(auth.uid(), org_id)
      AND public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor','operador')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cronograma_eventos_update" ON public.cronograma_eventos
    FOR UPDATE TO authenticated
    USING (
      public.is_org_member(auth.uid(), org_id)
      AND public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor','operador')
    )
    WITH CHECK (
      public.is_org_member(auth.uid(), org_id)
      AND public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor','operador')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cronograma_eventos_delete" ON public.cronograma_eventos
    FOR DELETE TO authenticated
    USING (
      public.is_org_member(auth.uid(), org_id)
      AND public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS cronograma_eventos_set_updated_at ON public.cronograma_eventos;
CREATE TRIGGER cronograma_eventos_set_updated_at
  BEFORE UPDATE ON public.cronograma_eventos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================= cronograma_subeventos ====================
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
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_subeventos TO authenticated;
GRANT ALL ON public.cronograma_subeventos TO service_role;

ALTER TABLE public.cronograma_subeventos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cronograma_subeventos_parent_idx
  ON public.cronograma_subeventos (parent_event_id, sort_order, created_at, id);

DO $$ BEGIN
  CREATE POLICY "cronograma_subeventos_select" ON public.cronograma_subeventos
    FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = parent_event_id
        AND public.is_org_member(auth.uid(), e.org_id)
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cronograma_subeventos_write" ON public.cronograma_subeventos
    FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = parent_event_id
        AND public.is_org_member(auth.uid(), e.org_id)
        AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin','gestor','operador')
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = parent_event_id
        AND public.is_org_member(auth.uid(), e.org_id)
        AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin','gestor','operador')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS cronograma_subeventos_set_updated_at ON public.cronograma_subeventos;
CREATE TRIGGER cronograma_subeventos_set_updated_at
  BEFORE UPDATE ON public.cronograma_subeventos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= cronograma_evento_comissoes ==================
CREATE TABLE IF NOT EXISTS public.cronograma_evento_comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.cronograma_eventos(id) ON DELETE CASCADE,
  commission_id uuid REFERENCES public.commissions(id) ON DELETE SET NULL,
  commission_slug text,
  commission_name_snapshot text,
  relation_role text NOT NULL DEFAULT 'participante',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, commission_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_evento_comissoes TO authenticated;
GRANT ALL ON public.cronograma_evento_comissoes TO service_role;

ALTER TABLE public.cronograma_evento_comissoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cronograma_evento_comissoes_event_idx
  ON public.cronograma_evento_comissoes (event_id);

DO $$ BEGIN
  CREATE POLICY "cronograma_evento_comissoes_select" ON public.cronograma_evento_comissoes
    FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id AND public.is_org_member(auth.uid(), e.org_id)
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cronograma_evento_comissoes_write" ON public.cronograma_evento_comissoes
    FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id
        AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin','gestor','operador')
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id
        AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin','gestor','operador')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS cronograma_evento_comissoes_set_updated_at ON public.cronograma_evento_comissoes;
CREATE TRIGGER cronograma_evento_comissoes_set_updated_at
  BEFORE UPDATE ON public.cronograma_evento_comissoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ cronograma_evento_responsaveis ================
CREATE TABLE IF NOT EXISTS public.cronograma_evento_responsaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.cronograma_eventos(id) ON DELETE CASCADE,
  org_member_user_id uuid,
  responsible_type text NOT NULL DEFAULT 'external',
  name_snapshot text,
  role text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_evento_responsaveis TO authenticated;
GRANT ALL ON public.cronograma_evento_responsaveis TO service_role;

ALTER TABLE public.cronograma_evento_responsaveis ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cronograma_evento_responsaveis_event_idx
  ON public.cronograma_evento_responsaveis (event_id);

DO $$ BEGIN
  CREATE POLICY "cronograma_evento_responsaveis_select" ON public.cronograma_evento_responsaveis
    FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id AND public.is_org_member(auth.uid(), e.org_id)
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cronograma_evento_responsaveis_write" ON public.cronograma_evento_responsaveis
    FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id
        AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin','gestor','operador')
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id
        AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin','gestor','operador')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS cronograma_evento_responsaveis_set_updated_at ON public.cronograma_evento_responsaveis;
CREATE TRIGGER cronograma_evento_responsaveis_set_updated_at
  BEFORE UPDATE ON public.cronograma_evento_responsaveis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================ cronograma_evento_logs ====================
CREATE TABLE IF NOT EXISTS public.cronograma_evento_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.cronograma_eventos(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'event',
  entity_id uuid,
  action text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  user_id uuid,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.cronograma_evento_logs TO authenticated;
GRANT ALL ON public.cronograma_evento_logs TO service_role;

ALTER TABLE public.cronograma_evento_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cronograma_evento_logs_event_idx
  ON public.cronograma_evento_logs (event_id, created_at DESC);

DO $$ BEGIN
  CREATE POLICY "cronograma_evento_logs_select" ON public.cronograma_evento_logs
    FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id
        AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin','gestor')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cronograma_evento_logs_insert" ON public.cronograma_evento_logs
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.cronograma_eventos e
      WHERE e.id = event_id
        AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin','gestor','operador')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Realtime (idempotente)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cronograma_eventos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cronograma_subeventos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cronograma_evento_comissoes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cronograma_evento_responsaveis;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
