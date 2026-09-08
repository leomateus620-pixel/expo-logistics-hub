ALTER TABLE public.push_send_log
  ADD COLUMN IF NOT EXISTS template_name text NOT NULL DEFAULT 'event-reminder',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP POLICY IF EXISTS "Org admins can view org push devices" ON public.push_devices;
CREATE POLICY "Org admins can view org push devices"
ON public.push_devices
FOR SELECT
TO authenticated
USING (
  org_id IS NOT NULL
  AND public.get_user_org_role(auth.uid(), org_id) IN ('admin', 'gestor')
);