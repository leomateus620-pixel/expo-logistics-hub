CREATE INDEX IF NOT EXISTS idx_cronograma_subeventos_parent_order
  ON public.cronograma_subeventos(parent_event_id, sort_order, created_at, id);

DROP POLICY IF EXISTS "cronograma_subeventos_update" ON public.cronograma_subeventos;
CREATE POLICY "cronograma_subeventos_update" ON public.cronograma_subeventos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cronograma_eventos e
      WHERE e.id = parent_event_id
        AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin', 'gestor', 'operador')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.cronograma_eventos e
      WHERE e.id = parent_event_id
        AND public.get_user_org_role(auth.uid(), e.org_id) IN ('admin', 'gestor', 'operador')
    )
  );

CREATE OR REPLACE FUNCTION public.audit_cronograma_subevento_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_event_id uuid;
  audit_action text;
BEGIN
  target_event_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.parent_event_id ELSE NEW.parent_event_id END;
  audit_action := CASE TG_OP
    WHEN 'INSERT' THEN 'subevent_created'
    WHEN 'UPDATE' THEN 'subevent_updated'
    WHEN 'DELETE' THEN 'subevent_removed'
  END;

  INSERT INTO public.cronograma_evento_logs (
    event_id,
    action,
    previous_value,
    new_value,
    user_id
  ) VALUES (
    target_event_id,
    audit_action,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    auth.uid()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_cronograma_subevento_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_cronograma_subeventos_audit ON public.cronograma_subeventos;
CREATE TRIGGER trg_cronograma_subeventos_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.cronograma_subeventos
  FOR EACH ROW EXECUTE FUNCTION public.audit_cronograma_subevento_change();
