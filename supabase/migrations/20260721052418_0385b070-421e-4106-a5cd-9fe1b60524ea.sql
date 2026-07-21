
ALTER TABLE public.google_calendar_connections
  ADD COLUMN connection_key TEXT;

-- Extensões para cron/HTTP (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
