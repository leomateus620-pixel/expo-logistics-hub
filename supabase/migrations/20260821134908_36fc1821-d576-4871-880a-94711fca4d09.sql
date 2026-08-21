CREATE TABLE public.cronograma_evento_tombstones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  deleted_event_id uuid,
  deleted_by_user_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cronograma_evento_tombstones_org_source_unique UNIQUE (org_id, source_key),
  CONSTRAINT cronograma_evento_tombstones_source_key_not_blank CHECK (btrim(source_key) <> '')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_evento_tombstones TO authenticated;
GRANT ALL ON public.cronograma_evento_tombstones TO service_role;

ALTER TABLE public.cronograma_evento_tombstones ENABLE ROW LEVEL SECURITY;

CREATE POLICY cronograma_evento_tombstones_select
ON public.cronograma_evento_tombstones
FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY cronograma_evento_tombstones_write
ON public.cronograma_evento_tombstones
FOR ALL TO authenticated
USING (public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin','gestor']::org_role[]))
WITH CHECK (
  deleted_by_user_id = auth.uid()
  AND public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin','gestor']::org_role[])
);

CREATE OR REPLACE FUNCTION public.cronograma_delete_event(
  event_id uuid,
  event_org_id uuid,
  event_source_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_event public.cronograma_eventos%ROWTYPE;
  v_source_key text := btrim(event_source_key);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: não autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF public.get_user_org_role(auth.uid(), event_org_id) NOT IN ('admin','gestor') THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: somente administradores e gestores podem excluir eventos' USING ERRCODE = 'P0001';
  END IF;

  IF event_id IS NOT NULL THEN
    SELECT * INTO v_event
    FROM public.cronograma_eventos
    WHERE id = event_id AND org_id = event_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: evento não encontrado' USING ERRCODE = 'P0001';
    END IF;
    v_source_key := v_event.source_key;
  END IF;

  IF v_source_key IS NULL OR v_source_key = '' THEN
    RAISE EXCEPTION 'CRONOGRAMA_VALIDATION_ERROR: source_key obrigatório' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.cronograma_evento_tombstones (org_id, source_key, deleted_event_id, deleted_by_user_id)
  VALUES (event_org_id, v_source_key, event_id, auth.uid())
  ON CONFLICT (org_id, source_key) DO UPDATE SET
    deleted_event_id = EXCLUDED.deleted_event_id,
    deleted_by_user_id = EXCLUDED.deleted_by_user_id,
    deleted_at = now();

  DELETE FROM public.cronograma_eventos
  WHERE org_id = event_org_id
    AND (id = event_id OR source_key = v_source_key);

  RETURN jsonb_build_object('id', event_id, 'source_key', v_source_key, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cronograma_delete_event(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cronograma_delete_event(uuid, uuid, text) TO authenticated;