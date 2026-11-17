-- Regra: Google Agenda só recebe eventos criados no sistema e ligados ao usuário.
DO $$
DECLARE src text := pg_get_functiondef('public.google_user_eligible_for_event'::regproc);
BEGIN
  IF position('created_by_user_id IS NOT NULL' in src) = 0 THEN
    RAISE EXCEPTION 'eventos importados (sem criador) não podem ir ao Google Agenda';
  END IF;
  IF position('cronograma_event_related' in src) > 0 OR position('sync_scope' in src) > 0 THEN
    RAISE EXCEPTION 'visibilidade ampla/sync_scope não pode tornar evento elegível';
  END IF;
END $$;
