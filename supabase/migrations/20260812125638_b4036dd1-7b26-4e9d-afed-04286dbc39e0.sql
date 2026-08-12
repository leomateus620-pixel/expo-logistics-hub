CREATE TABLE public.google_calendar_sync_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sync_scope text NOT NULL DEFAULT 'all',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

ALTER TABLE public.google_calendar_sync_preferences
  ADD CONSTRAINT google_calendar_sync_preferences_scope_check CHECK (sync_scope IN ('all', 'mine'));

GRANT ALL ON public.google_calendar_sync_preferences TO service_role;
ALTER TABLE public.google_calendar_sync_preferences ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER google_calendar_sync_preferences_set_updated_at
  BEFORE UPDATE ON public.google_calendar_sync_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.google_calendar_connections
  ADD COLUMN IF NOT EXISTS sync_scope text NOT NULL DEFAULT 'all';

ALTER TABLE public.google_calendar_connections
  ADD CONSTRAINT google_calendar_connections_sync_scope_check CHECK (sync_scope IN ('all', 'mine'));

CREATE OR REPLACE FUNCTION public.google_user_eligible_for_event(
  _user_id uuid,
  _org_id uuid,
  _event_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.org_members active_member
     WHERE active_member.user_id = _user_id
       AND active_member.org_id = _org_id
       AND active_member.is_active = true
       AND EXISTS (
         SELECT 1 FROM public.cronograma_eventos event
          WHERE event.id = _event_id AND event.org_id = _org_id
       )
       AND (
         CASE
           WHEN (
             SELECT connection.sync_scope
               FROM public.google_calendar_connections connection
              WHERE connection.user_id = _user_id
              LIMIT 1
           ) = 'mine' THEN
             EXISTS (
               SELECT 1 FROM public.cronograma_eventos own_event
                WHERE own_event.id = _event_id
                  AND own_event.org_id = _org_id
                  AND own_event.created_by_user_id = _user_id
             )
             OR EXISTS (
               SELECT 1 FROM public.cronograma_evento_responsaveis responsible
                WHERE responsible.event_id = _event_id
                  AND responsible.org_id = _org_id
                  AND responsible.org_member_user_id = _user_id
                  AND responsible.responsible_type = 'member'
             )
           ELSE
             public.has_capability(_user_id, _org_id, 'full_access')
             OR EXISTS (
               SELECT 1
                 FROM public.org_members commission_member
                 JOIN public.cronograma_evento_comissoes link
                   ON link.org_id = commission_member.org_id
                  AND link.commission_id = commission_member.commission_id
                WHERE commission_member.user_id = _user_id
                  AND commission_member.org_id = _org_id
                  AND commission_member.is_active = true
                  AND commission_member.commission_id IS NOT NULL
                  AND link.event_id = _event_id
             )
         END
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.tg_responsavel_evento_google_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reconcile_google_sync_event(
    COALESCE(NEW.event_id, OLD.event_id),
    COALESCE(NEW.org_id, OLD.org_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_responsavel_evento_google_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.cronograma_evento_responsaveis
  FOR EACH ROW EXECUTE FUNCTION public.tg_responsavel_evento_google_sync();