
-- =========================================================
-- M2 — Evolução de schema
-- =========================================================

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill de slug via translate (sem depender de extensão unaccent)
UPDATE public.commissions
   SET slug = regexp_replace(
       lower(translate(coalesce(slug, nome),
         'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
         'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN'
       )),
       '[^a-z0-9]+', '-', 'g')
 WHERE slug IS NULL OR slug = '';

UPDATE public.commissions
   SET slug = regexp_replace(regexp_replace(slug, '-+', '-', 'g'), '^-|-$', '', 'g')
 WHERE slug ~ '(--|^-|-$)';

DO $$
DECLARE r record; n int;
BEGIN
  FOR r IN
    SELECT id, org_id, slug FROM public.commissions
     WHERE (org_id, slug) IN (
       SELECT org_id, slug FROM public.commissions
        GROUP BY org_id, slug HAVING count(*) > 1
     )
  LOOP
    n := (SELECT count(*) FROM public.commissions x
           WHERE x.org_id = r.org_id AND x.slug LIKE r.slug || '%');
    UPDATE public.commissions SET slug = r.slug || '-' || n WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.commissions ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS commissions_org_slug_uidx
  ON public.commissions (org_id, slug);

DO $$ BEGIN
  ALTER TABLE public.commissions ADD CONSTRAINT commissions_id_org_key UNIQUE (id, org_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.cronograma_eventos ADD CONSTRAINT cronograma_eventos_id_org_key UNIQUE (id, org_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DROP TRIGGER IF EXISTS commissions_set_updated_at ON public.commissions;
CREATE TRIGGER commissions_set_updated_at
  BEFORE UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cronograma_eventos
  ADD COLUMN IF NOT EXISTS category_key text,
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time,
  ADD COLUMN IF NOT EXISTS pending_reason text,
  ADD COLUMN IF NOT EXISTS decision_needed text,
  ADD COLUMN IF NOT EXISTS lock_version bigint NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE public.cronograma_eventos
    ADD CONSTRAINT cronograma_eventos_title_ck CHECK (btrim(title) <> '');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.cronograma_eventos
    ADD CONSTRAINT cronograma_eventos_date_range_ck
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.cronograma_eventos
    ADD CONSTRAINT cronograma_eventos_time_pair_ck
    CHECK (end_time IS NULL OR start_time IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.cronograma_eventos
    ADD CONSTRAINT cronograma_eventos_same_day_time_ck
    CHECK (
      end_time IS NULL OR start_date IS NULL OR end_date IS NULL
      OR end_date <> start_date OR end_time > start_time
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.cronograma_eventos
    ADD CONSTRAINT cronograma_eventos_source_year_ck
    CHECK (source_year IN (2026, 2027, 2028));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.cronograma_eventos
    ADD CONSTRAINT cronograma_eventos_exact_date_ck
    CHECK ((has_exact_date = true AND start_date IS NOT NULL)
        OR (has_exact_date = false));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS cronograma_eventos_org_priority_idx ON public.cronograma_eventos (org_id, priority);
CREATE INDEX IF NOT EXISTS cronograma_eventos_org_categorykey_idx ON public.cronograma_eventos (org_id, category_key);
CREATE INDEX IF NOT EXISTS cronograma_eventos_org_has_exact_idx ON public.cronograma_eventos (org_id, has_exact_date);

-- cronograma_subeventos
ALTER TABLE public.cronograma_subeventos
  ADD COLUMN IF NOT EXISTS org_id uuid,
  ADD COLUMN IF NOT EXISTS legacy_key text,
  ADD COLUMN IF NOT EXISTS lock_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS responsible_name_snapshot text,
  ADD COLUMN IF NOT EXISTS commission_name_snapshot text;

UPDATE public.cronograma_subeventos s
   SET org_id = e.org_id
  FROM public.cronograma_eventos e
 WHERE s.parent_event_id = e.id AND s.org_id IS NULL;

ALTER TABLE public.cronograma_subeventos ALTER COLUMN org_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.cronograma_subeventos DROP CONSTRAINT cronograma_subeventos_parent_event_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.cronograma_subeventos
    ADD CONSTRAINT cronograma_subeventos_parent_org_fkey
    FOREIGN KEY (parent_event_id, org_id)
    REFERENCES public.cronograma_eventos(id, org_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cronograma_subeventos_parent_legacy_uidx
  ON public.cronograma_subeventos (parent_event_id, legacy_key)
  WHERE legacy_key IS NOT NULL;

-- cronograma_evento_comissoes
ALTER TABLE public.cronograma_evento_comissoes ADD COLUMN IF NOT EXISTS org_id uuid;

UPDATE public.cronograma_evento_comissoes c
   SET org_id = e.org_id
  FROM public.cronograma_eventos e
 WHERE c.event_id = e.id AND c.org_id IS NULL;

ALTER TABLE public.cronograma_evento_comissoes ALTER COLUMN org_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.cronograma_evento_comissoes DROP CONSTRAINT cronograma_evento_comissoes_event_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.cronograma_evento_comissoes DROP CONSTRAINT cronograma_evento_comissoes_commission_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.cronograma_evento_comissoes
    ADD CONSTRAINT cronograma_evento_comissoes_event_org_fkey
    FOREIGN KEY (event_id, org_id) REFERENCES public.cronograma_eventos(id, org_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.cronograma_evento_comissoes
    ADD CONSTRAINT cronograma_evento_comissoes_commission_org_fkey
    FOREIGN KEY (commission_id, org_id) REFERENCES public.commissions(id, org_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cronograma_evento_comissoes_principal_uidx
  ON public.cronograma_evento_comissoes (event_id) WHERE relation_role = 'principal';

-- cronograma_evento_responsaveis
ALTER TABLE public.cronograma_evento_responsaveis ADD COLUMN IF NOT EXISTS org_id uuid;

UPDATE public.cronograma_evento_responsaveis r
   SET org_id = e.org_id
  FROM public.cronograma_eventos e
 WHERE r.event_id = e.id AND r.org_id IS NULL;

ALTER TABLE public.cronograma_evento_responsaveis ALTER COLUMN org_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.cronograma_evento_responsaveis DROP CONSTRAINT cronograma_evento_responsaveis_event_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.cronograma_evento_responsaveis
    ADD CONSTRAINT cronograma_evento_responsaveis_event_org_fkey
    FOREIGN KEY (event_id, org_id) REFERENCES public.cronograma_eventos(id, org_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cronograma_evento_responsaveis_primary_uidx
  ON public.cronograma_evento_responsaveis (event_id) WHERE is_primary = true;

-- Subeventos: vínculos
CREATE TABLE IF NOT EXISTS public.cronograma_subevento_comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subevent_id uuid NOT NULL REFERENCES public.cronograma_subeventos(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  commission_id uuid,
  commission_slug text,
  commission_name_snapshot text,
  relation_role text NOT NULL DEFAULT 'participante',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subevent_id, commission_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_subevento_comissoes TO authenticated;
GRANT ALL ON public.cronograma_subevento_comissoes TO service_role;
ALTER TABLE public.cronograma_subevento_comissoes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS cronograma_subevento_comissoes_sub_idx
  ON public.cronograma_subevento_comissoes (subevent_id);
CREATE UNIQUE INDEX IF NOT EXISTS cronograma_subevento_comissoes_principal_uidx
  ON public.cronograma_subevento_comissoes (subevent_id) WHERE relation_role = 'principal';

DO $$ BEGIN
  CREATE POLICY "cronograma_subevento_comissoes_select" ON public.cronograma_subevento_comissoes
    FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cronograma_subevento_comissoes_write" ON public.cronograma_subevento_comissoes
    FOR ALL TO authenticated
    USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor','operador'))
    WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor','operador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS cronograma_subevento_comissoes_set_updated_at ON public.cronograma_subevento_comissoes;
CREATE TRIGGER cronograma_subevento_comissoes_set_updated_at
  BEFORE UPDATE ON public.cronograma_subevento_comissoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.cronograma_subevento_responsaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subevent_id uuid NOT NULL REFERENCES public.cronograma_subeventos(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  org_member_user_id uuid,
  responsible_type text NOT NULL DEFAULT 'external',
  name_snapshot text,
  role text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_subevento_responsaveis TO authenticated;
GRANT ALL ON public.cronograma_subevento_responsaveis TO service_role;
ALTER TABLE public.cronograma_subevento_responsaveis ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS cronograma_subevento_responsaveis_sub_idx
  ON public.cronograma_subevento_responsaveis (subevent_id);
CREATE UNIQUE INDEX IF NOT EXISTS cronograma_subevento_responsaveis_primary_uidx
  ON public.cronograma_subevento_responsaveis (subevent_id) WHERE is_primary = true;

DO $$ BEGIN
  CREATE POLICY "cronograma_subevento_responsaveis_select" ON public.cronograma_subevento_responsaveis
    FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cronograma_subevento_responsaveis_write" ON public.cronograma_subevento_responsaveis
    FOR ALL TO authenticated
    USING (public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor','operador'))
    WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor','operador'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS cronograma_subevento_responsaveis_set_updated_at ON public.cronograma_subevento_responsaveis;
CREATE TRIGGER cronograma_subevento_responsaveis_set_updated_at
  BEFORE UPDATE ON public.cronograma_subevento_responsaveis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS cronograma_evento_logs_request_idx
  ON public.cronograma_evento_logs (request_id);

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.cronograma_subevento_comissoes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.cronograma_subevento_responsaveis;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- View agregada
-- =========================================================
CREATE OR REPLACE VIEW public.cronograma_eventos_full
WITH (security_invoker=on) AS
SELECT
  e.*,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', ec.id,
      'commission_id', ec.commission_id,
      'commission_slug', ec.commission_slug,
      'commission_name', COALESCE(c.nome, ec.commission_name_snapshot),
      'relation_role', ec.relation_role
    ) ORDER BY (ec.relation_role = 'principal') DESC, ec.created_at)
    FROM public.cronograma_evento_comissoes ec
    LEFT JOIN public.commissions c ON c.id = ec.commission_id
    WHERE ec.event_id = e.id
  ), '[]'::jsonb) AS commissions_rel,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', er.id,
      'user_id', er.org_member_user_id,
      'name', COALESCE(m.nome_exibicao, er.name_snapshot),
      'role', er.role,
      'is_primary', er.is_primary,
      'responsible_type', er.responsible_type
    ) ORDER BY er.is_primary DESC, er.created_at)
    FROM public.cronograma_evento_responsaveis er
    LEFT JOIN public.org_members m
           ON m.user_id = er.org_member_user_id AND m.org_id = er.org_id
    WHERE er.event_id = e.id
  ), '[]'::jsonb) AS responsibles_rel,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id,
      'title', s.title,
      'description', s.description,
      'start_date', s.start_date,
      'end_date', s.end_date,
      'status', s.status,
      'priority', s.priority,
      'commission_slug', s.commission_slug,
      'responsible_name', s.responsible_name,
      'sort_order', s.sort_order,
      'lock_version', s.lock_version,
      'created_at', s.created_at,
      'updated_at', s.updated_at,
      'commissions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', sc.id,
          'commission_id', sc.commission_id,
          'commission_slug', sc.commission_slug,
          'commission_name', COALESCE(c2.nome, sc.commission_name_snapshot),
          'relation_role', sc.relation_role
        ))
        FROM public.cronograma_subevento_comissoes sc
        LEFT JOIN public.commissions c2 ON c2.id = sc.commission_id
        WHERE sc.subevent_id = s.id
      ), '[]'::jsonb),
      'responsibles', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', sr.id,
          'user_id', sr.org_member_user_id,
          'name', COALESCE(m2.nome_exibicao, sr.name_snapshot),
          'role', sr.role,
          'is_primary', sr.is_primary,
          'responsible_type', sr.responsible_type
        ))
        FROM public.cronograma_subevento_responsaveis sr
        LEFT JOIN public.org_members m2
               ON m2.user_id = sr.org_member_user_id AND m2.org_id = sr.org_id
        WHERE sr.subevent_id = s.id
      ), '[]'::jsonb)
    ) ORDER BY s.sort_order, s.created_at, s.id)
    FROM public.cronograma_subeventos s
    WHERE s.parent_event_id = e.id
  ), '[]'::jsonb) AS subevents_rel
FROM public.cronograma_eventos e;

GRANT SELECT ON public.cronograma_eventos_full TO authenticated;

-- =========================================================
-- Helpers + RPCs
-- =========================================================

CREATE OR REPLACE FUNCTION public._cronograma_require_writer(_org_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE r org_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: não autenticado' USING ERRCODE='P0001';
  END IF;
  r := public.get_user_org_role(auth.uid(), _org_id);
  IF r NOT IN ('admin','gestor','operador') THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: papel % sem permissão de escrita', r USING ERRCODE='P0001';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._cronograma_log(
  _event_id uuid, _entity_type text, _entity_id uuid,
  _action text, _prev jsonb, _next jsonb, _request_id text
) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  INSERT INTO public.cronograma_evento_logs (
    event_id, entity_type, entity_id, action, previous_value, new_value, user_id, request_id
  ) VALUES (
    _event_id, _entity_type, _entity_id, _action, _prev, _next, auth.uid(), _request_id
  );
$$;

CREATE OR REPLACE FUNCTION public._cronograma_apply_event_commissions(
  _event_id uuid, _org_id uuid, _items jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE item jsonb; resolved_ids uuid[] := '{}';
BEGIN
  IF _items IS NULL THEN RETURN; END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF (item->>'commission_id') IS NULL AND (item->>'commission_slug') IS NOT NULL THEN
      item := item || jsonb_build_object('commission_id',
        (SELECT id FROM public.commissions WHERE org_id = _org_id AND slug = item->>'commission_slug' LIMIT 1)
      );
    END IF;

    IF (item->>'commission_id') IS NULL THEN
      RAISE EXCEPTION 'CRONOGRAMA_RELATIONSHIP_INVALID: comissão % não encontrada', item->>'commission_slug'
        USING ERRCODE='P0001';
    END IF;

    INSERT INTO public.cronograma_evento_comissoes
      (event_id, org_id, commission_id, commission_slug, commission_name_snapshot, relation_role)
    VALUES (
      _event_id, _org_id,
      (item->>'commission_id')::uuid,
      item->>'commission_slug',
      item->>'commission_name',
      COALESCE(item->>'relation_role', 'participante')
    )
    ON CONFLICT (event_id, commission_id) DO UPDATE
      SET commission_slug = EXCLUDED.commission_slug,
          commission_name_snapshot = EXCLUDED.commission_name_snapshot,
          relation_role = EXCLUDED.relation_role,
          updated_at = now();

    resolved_ids := array_append(resolved_ids, (item->>'commission_id')::uuid);
  END LOOP;

  DELETE FROM public.cronograma_evento_comissoes
   WHERE event_id = _event_id
     AND (resolved_ids = '{}' OR NOT (commission_id = ANY (resolved_ids)));
END $$;

CREATE OR REPLACE FUNCTION public._cronograma_apply_event_responsibles(
  _event_id uuid, _org_id uuid, _items jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE item jsonb;
BEGIN
  IF _items IS NULL THEN RETURN; END IF;
  DELETE FROM public.cronograma_evento_responsaveis WHERE event_id = _event_id;
  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.cronograma_evento_responsaveis
      (event_id, org_id, org_member_user_id, responsible_type, name_snapshot, role, is_primary)
    VALUES (
      _event_id, _org_id,
      NULLIF(item->>'user_id','')::uuid,
      COALESCE(item->>'responsible_type', CASE WHEN (item->>'user_id') IS NOT NULL THEN 'member' ELSE 'external' END),
      item->>'name',
      item->>'role',
      COALESCE((item->>'is_primary')::boolean, false)
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._cronograma_apply_subevent_commissions(
  _subevent_id uuid, _org_id uuid, _items jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE item jsonb;
BEGIN
  IF _items IS NULL THEN RETURN; END IF;
  DELETE FROM public.cronograma_subevento_comissoes WHERE subevent_id = _subevent_id;
  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF (item->>'commission_id') IS NULL AND (item->>'commission_slug') IS NOT NULL THEN
      item := item || jsonb_build_object('commission_id',
        (SELECT id FROM public.commissions WHERE org_id = _org_id AND slug = item->>'commission_slug' LIMIT 1)
      );
    END IF;
    IF (item->>'commission_id') IS NULL THEN
      RAISE EXCEPTION 'CRONOGRAMA_RELATIONSHIP_INVALID: comissão % não encontrada', item->>'commission_slug'
        USING ERRCODE='P0001';
    END IF;
    INSERT INTO public.cronograma_subevento_comissoes
      (subevent_id, org_id, commission_id, commission_slug, commission_name_snapshot, relation_role)
    VALUES (
      _subevent_id, _org_id,
      (item->>'commission_id')::uuid,
      item->>'commission_slug',
      item->>'commission_name',
      COALESCE(item->>'relation_role','participante')
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._cronograma_apply_subevent_responsibles(
  _subevent_id uuid, _org_id uuid, _items jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE item jsonb;
BEGIN
  IF _items IS NULL THEN RETURN; END IF;
  DELETE FROM public.cronograma_subevento_responsaveis WHERE subevent_id = _subevent_id;
  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.cronograma_subevento_responsaveis
      (subevent_id, org_id, org_member_user_id, responsible_type, name_snapshot, role, is_primary)
    VALUES (
      _subevent_id, _org_id,
      NULLIF(item->>'user_id','')::uuid,
      COALESCE(item->>'responsible_type', CASE WHEN (item->>'user_id') IS NOT NULL THEN 'member' ELSE 'external' END),
      item->>'name',
      item->>'role',
      COALESCE((item->>'is_primary')::boolean, false)
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.cronograma_save_event(
  payload jsonb,
  expected_lock_version bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_org uuid;
  v_prev public.cronograma_eventos%ROWTYPE;
  v_row public.cronograma_eventos%ROWTYPE;
  v_request text := payload->>'request_id';
  v_source_key text := payload->>'source_key';
  v_action text;
BEGIN
  v_id := NULLIF(payload->>'id','')::uuid;
  v_org := NULLIF(payload->>'org_id','')::uuid;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_VALIDATION_ERROR: org_id obrigatório' USING ERRCODE='P0001';
  END IF;
  PERFORM public._cronograma_require_writer(v_org);

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.cronograma_eventos WHERE id = v_id AND org_id = v_org FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: evento %', v_id USING ERRCODE='P0001';
    END IF;
    IF expected_lock_version IS NOT NULL AND v_prev.lock_version <> expected_lock_version THEN
      RAISE EXCEPTION 'CRONOGRAMA_CONFLICT: versão % esperada, atual %', expected_lock_version, v_prev.lock_version
        USING ERRCODE='P0001';
    END IF;
    v_action := 'update';
  ELSIF v_source_key IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.cronograma_eventos
     WHERE org_id = v_org AND source_key = v_source_key FOR UPDATE;
    IF FOUND THEN
      v_id := v_prev.id;
      v_action := 'update';
    ELSE
      v_action := 'create';
    END IF;
  ELSE
    v_action := 'create';
  END IF;

  IF v_action = 'create' THEN
    INSERT INTO public.cronograma_eventos (
      org_id, source_key, title, description, category, category_key, event_type,
      source_year, start_date, end_date, month_label, week_label, status, priority,
      location, event_time, start_time, end_time, days_remaining,
      commission_slug, commission_name, responsible_name,
      source_sheet, source_row, source_cell, source_note,
      is_official_seed, has_exact_date, linked_commissions, subevents,
      pending_reason, decision_needed, created_by_user_id, lock_version
    ) VALUES (
      v_org,
      COALESCE(v_source_key, 'manual-' || gen_random_uuid()::text),
      COALESCE(payload->>'title',''),
      payload->>'description',
      COALESCE(payload->>'category','Outros / a classificar'),
      payload->>'category_key',
      COALESCE(payload->>'event_type','planejamento'),
      COALESCE(NULLIF(payload->>'source_year','')::int, 2028),
      NULLIF(payload->>'start_date','')::date,
      NULLIF(payload->>'end_date','')::date,
      payload->>'month_label',
      payload->>'week_label',
      COALESCE(payload->>'status','planejado'),
      COALESCE(payload->>'priority','media'),
      payload->>'location',
      payload->>'event_time',
      NULLIF(payload->>'start_time','')::time,
      NULLIF(payload->>'end_time','')::time,
      NULLIF(payload->>'days_remaining','')::int,
      payload->>'commission_slug',
      payload->>'commission_name',
      payload->>'responsible_name',
      COALESCE(payload->>'source_sheet','Cadastro manual'),
      payload->>'source_row',
      payload->>'source_cell',
      payload->>'source_note',
      COALESCE((payload->>'is_official_seed')::boolean, false),
      COALESCE((payload->>'has_exact_date')::boolean, (payload->>'start_date') IS NOT NULL),
      COALESCE(payload->'linked_commissions','[]'::jsonb),
      COALESCE(payload->'subevents_json','[]'::jsonb),
      payload->>'pending_reason',
      payload->>'decision_needed',
      auth.uid(),
      1
    ) RETURNING * INTO v_row;
    v_id := v_row.id;
  ELSE
    UPDATE public.cronograma_eventos SET
      title = COALESCE(payload->>'title', title),
      description = CASE WHEN payload ? 'description' THEN payload->>'description' ELSE description END,
      category = COALESCE(payload->>'category', category),
      category_key = CASE WHEN payload ? 'category_key' THEN payload->>'category_key' ELSE category_key END,
      event_type = COALESCE(payload->>'event_type', event_type),
      source_year = COALESCE(NULLIF(payload->>'source_year','')::int, source_year),
      start_date = CASE WHEN payload ? 'start_date' THEN NULLIF(payload->>'start_date','')::date ELSE start_date END,
      end_date = CASE WHEN payload ? 'end_date' THEN NULLIF(payload->>'end_date','')::date ELSE end_date END,
      month_label = CASE WHEN payload ? 'month_label' THEN payload->>'month_label' ELSE month_label END,
      week_label = CASE WHEN payload ? 'week_label' THEN payload->>'week_label' ELSE week_label END,
      status = COALESCE(payload->>'status', status),
      priority = COALESCE(payload->>'priority', priority),
      location = CASE WHEN payload ? 'location' THEN payload->>'location' ELSE location END,
      event_time = CASE WHEN payload ? 'event_time' THEN payload->>'event_time' ELSE event_time END,
      start_time = CASE WHEN payload ? 'start_time' THEN NULLIF(payload->>'start_time','')::time ELSE start_time END,
      end_time = CASE WHEN payload ? 'end_time' THEN NULLIF(payload->>'end_time','')::time ELSE end_time END,
      days_remaining = CASE WHEN payload ? 'days_remaining' THEN NULLIF(payload->>'days_remaining','')::int ELSE days_remaining END,
      commission_slug = CASE WHEN payload ? 'commission_slug' THEN payload->>'commission_slug' ELSE commission_slug END,
      commission_name = CASE WHEN payload ? 'commission_name' THEN payload->>'commission_name' ELSE commission_name END,
      responsible_name = CASE WHEN payload ? 'responsible_name' THEN payload->>'responsible_name' ELSE responsible_name END,
      has_exact_date = CASE WHEN payload ? 'has_exact_date' THEN (payload->>'has_exact_date')::boolean ELSE has_exact_date END,
      pending_reason = CASE WHEN payload ? 'pending_reason' THEN payload->>'pending_reason' ELSE pending_reason END,
      decision_needed = CASE WHEN payload ? 'decision_needed' THEN payload->>'decision_needed' ELSE decision_needed END,
      lock_version = lock_version + 1,
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO v_row;
  END IF;

  IF payload ? 'commissions' THEN
    PERFORM public._cronograma_apply_event_commissions(v_id, v_org, payload->'commissions');
  END IF;
  IF payload ? 'responsibles' THEN
    PERFORM public._cronograma_apply_event_responsibles(v_id, v_org, payload->'responsibles');
  END IF;

  PERFORM public._cronograma_log(v_id, 'event', v_id, v_action,
    CASE WHEN v_action = 'update' THEN to_jsonb(v_prev) ELSE NULL END,
    to_jsonb(v_row), v_request);

  RETURN (SELECT to_jsonb(f) FROM public.cronograma_eventos_full f WHERE f.id = v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.cronograma_save_event(jsonb, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.cronograma_save_subevent(
  payload jsonb,
  expected_lock_version bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id uuid := NULLIF(payload->>'id','')::uuid;
  v_parent uuid := NULLIF(payload->>'parent_event_id','')::uuid;
  v_org uuid;
  v_prev public.cronograma_subeventos%ROWTYPE;
  v_row public.cronograma_subeventos%ROWTYPE;
  v_request text := payload->>'request_id';
  v_action text;
BEGIN
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_VALIDATION_ERROR: parent_event_id obrigatório' USING ERRCODE='P0001';
  END IF;
  SELECT org_id INTO v_org FROM public.cronograma_eventos WHERE id = v_parent;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: evento pai %', v_parent USING ERRCODE='P0001';
  END IF;
  PERFORM public._cronograma_require_writer(v_org);

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.cronograma_subeventos WHERE id = v_id AND parent_event_id = v_parent FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: subevento %', v_id USING ERRCODE='P0001';
    END IF;
    IF expected_lock_version IS NOT NULL AND v_prev.lock_version <> expected_lock_version THEN
      RAISE EXCEPTION 'CRONOGRAMA_CONFLICT: versão %', expected_lock_version USING ERRCODE='P0001';
    END IF;
    v_action := 'update';
    UPDATE public.cronograma_subeventos SET
      title = COALESCE(payload->>'title', title),
      description = CASE WHEN payload ? 'description' THEN payload->>'description' ELSE description END,
      start_date = CASE WHEN payload ? 'start_date' THEN NULLIF(payload->>'start_date','')::date ELSE start_date END,
      end_date = CASE WHEN payload ? 'end_date' THEN NULLIF(payload->>'end_date','')::date ELSE end_date END,
      status = COALESCE(payload->>'status', status),
      priority = COALESCE(payload->>'priority', priority),
      commission_slug = CASE WHEN payload ? 'commission_slug' THEN payload->>'commission_slug' ELSE commission_slug END,
      responsible_name = CASE WHEN payload ? 'responsible_name' THEN payload->>'responsible_name' ELSE responsible_name END,
      sort_order = COALESCE(NULLIF(payload->>'sort_order','')::int, sort_order),
      lock_version = lock_version + 1,
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO v_row;
  ELSE
    v_action := 'create';
    INSERT INTO public.cronograma_subeventos (
      parent_event_id, org_id, title, description, start_date, end_date,
      status, priority, commission_slug, responsible_name, sort_order,
      legacy_key, lock_version
    ) VALUES (
      v_parent, v_org,
      COALESCE(payload->>'title',''),
      payload->>'description',
      NULLIF(payload->>'start_date','')::date,
      NULLIF(payload->>'end_date','')::date,
      COALESCE(payload->>'status','planejado'),
      COALESCE(payload->>'priority','media'),
      payload->>'commission_slug',
      payload->>'responsible_name',
      COALESCE(NULLIF(payload->>'sort_order','')::int,
        (SELECT COALESCE(MAX(sort_order),-1)+1 FROM public.cronograma_subeventos WHERE parent_event_id = v_parent)),
      payload->>'legacy_key',
      1
    ) RETURNING * INTO v_row;
    v_id := v_row.id;
  END IF;

  IF payload ? 'commissions' THEN
    PERFORM public._cronograma_apply_subevent_commissions(v_id, v_org, payload->'commissions');
  END IF;
  IF payload ? 'responsibles' THEN
    PERFORM public._cronograma_apply_subevent_responsibles(v_id, v_org, payload->'responsibles');
  END IF;

  PERFORM public._cronograma_log(v_parent, 'subevent', v_id, v_action,
    CASE WHEN v_action = 'update' THEN to_jsonb(v_prev) ELSE NULL END,
    to_jsonb(v_row), v_request);

  RETURN (SELECT to_jsonb(f) FROM public.cronograma_eventos_full f WHERE f.id = v_parent);
END $$;

GRANT EXECUTE ON FUNCTION public.cronograma_save_subevent(jsonb, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.cronograma_delete_subevent(
  subevent_id uuid,
  expected_lock_version bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_row public.cronograma_subeventos%ROWTYPE; v_org uuid;
BEGIN
  SELECT * INTO v_row FROM public.cronograma_subeventos WHERE id = subevent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: subevento %', subevent_id USING ERRCODE='P0001';
  END IF;
  v_org := v_row.org_id;
  IF public.get_user_org_role(auth.uid(), v_org) NOT IN ('admin','gestor') THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: exige admin/gestor' USING ERRCODE='P0001';
  END IF;
  IF expected_lock_version IS NOT NULL AND v_row.lock_version <> expected_lock_version THEN
    RAISE EXCEPTION 'CRONOGRAMA_CONFLICT: versão' USING ERRCODE='P0001';
  END IF;
  DELETE FROM public.cronograma_subeventos WHERE id = subevent_id;
  PERFORM public._cronograma_log(v_row.parent_event_id, 'subevent', subevent_id, 'delete',
    to_jsonb(v_row), NULL, NULL);
  RETURN (SELECT to_jsonb(f) FROM public.cronograma_eventos_full f WHERE f.id = v_row.parent_event_id);
END $$;

GRANT EXECUTE ON FUNCTION public.cronograma_delete_subevent(uuid, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.cronograma_reorder_subevents(
  event_id uuid,
  ordered_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_org uuid; i int;
BEGIN
  SELECT org_id INTO v_org FROM public.cronograma_eventos WHERE id = event_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: evento %', event_id USING ERRCODE='P0001';
  END IF;
  PERFORM public._cronograma_require_writer(v_org);

  IF EXISTS (
    SELECT 1 FROM unnest(ordered_ids) x(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.cronograma_subeventos s
        WHERE s.id = x.id AND s.parent_event_id = event_id
     )
  ) THEN
    RAISE EXCEPTION 'CRONOGRAMA_RELATIONSHIP_INVALID: subevento não pertence ao evento' USING ERRCODE='P0001';
  END IF;

  FOR i IN 1..array_length(ordered_ids,1) LOOP
    UPDATE public.cronograma_subeventos
       SET sort_order = i - 1, updated_at = now(), lock_version = lock_version + 1
     WHERE id = ordered_ids[i];
  END LOOP;

  PERFORM public._cronograma_log(event_id, 'event', event_id, 'reorder_subevents',
    NULL, to_jsonb(ordered_ids), NULL);

  RETURN (SELECT to_jsonb(f) FROM public.cronograma_eventos_full f WHERE f.id = event_id);
END $$;

GRANT EXECUTE ON FUNCTION public.cronograma_reorder_subevents(uuid, uuid[]) TO authenticated;
