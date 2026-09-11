ALTER TABLE public.event_reminder_deliveries
  ADD COLUMN IF NOT EXISTS notification_type text NOT NULL DEFAULT 'event_start',
  ADD COLUMN IF NOT EXISTS notification_date date;

ALTER TABLE public.event_reminder_deliveries
  DROP CONSTRAINT IF EXISTS event_reminder_deliveries_notification_type_check;
ALTER TABLE public.event_reminder_deliveries
  ADD CONSTRAINT event_reminder_deliveries_notification_type_check
  CHECK (notification_type IN ('event_start','event_ongoing','event_final_day'));

CREATE UNIQUE INDEX IF NOT EXISTS erd_lifecycle_uniq
  ON public.event_reminder_deliveries (user_id, event_id, notification_type, notification_date)
  WHERE notification_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS cronograma_eventos_org_end_idx
  ON public.cronograma_eventos (org_id, end_date);