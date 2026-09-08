CREATE TABLE public.push_devices (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_devices_token_uniq UNIQUE (fcm_token)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_devices TO authenticated;
GRANT ALL ON public.push_devices TO service_role;

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_devices_owner_select" ON public.push_devices
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "push_devices_owner_insert" ON public.push_devices
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_org_member(auth.uid(), org_id));
CREATE POLICY "push_devices_owner_update" ON public.push_devices
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_devices_owner_delete" ON public.push_devices
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX push_devices_active_idx ON public.push_devices(user_id) WHERE revoked_at IS NULL;

CREATE TRIGGER push_devices_set_updated_at BEFORE UPDATE ON public.push_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.push_send_log (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.cronograma_eventos(id) ON DELETE SET NULL,
  device_id UUID REFERENCES public.push_devices(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','stale_token')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.push_send_log TO authenticated;
GRANT ALL ON public.push_send_log TO service_role;

ALTER TABLE public.push_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_send_log_owner_select" ON public.push_send_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE INDEX push_send_log_user_idx ON public.push_send_log(user_id, created_at DESC);