-- Add new statuses to transport_status enum
ALTER TYPE public.transport_status ADD VALUE IF NOT EXISTS 'chegou_destino';
ALTER TYPE public.transport_status ADD VALUE IF NOT EXISTS 'em_retorno';

-- Add audit action values for the new lifecycle steps
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'arrive_destination';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'start_return';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'complete_return';

-- Add new columns to transports
ALTER TABLE public.transports
  ADD COLUMN IF NOT EXISTS chegada_destino_em timestamptz,
  ADD COLUMN IF NOT EXISTS inicio_retorno_em timestamptz,
  ADD COLUMN IF NOT EXISTS fim_retorno_em timestamptz,
  ADD COLUMN IF NOT EXISTS destino_lat_chegada double precision,
  ADD COLUMN IF NOT EXISTS destino_lng_chegada double precision,
  ADD COLUMN IF NOT EXISTS rota_polyline_volta text,
  ADD COLUMN IF NOT EXISTS origem_lat double precision,
  ADD COLUMN IF NOT EXISTS origem_lng double precision,
  ADD COLUMN IF NOT EXISTS somente_ida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fase_atual text NOT NULL DEFAULT 'ida';

-- Constraint on fase_atual values
DO $$ BEGIN
  ALTER TABLE public.transports
    ADD CONSTRAINT transports_fase_atual_check CHECK (fase_atual IN ('ida','volta'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;