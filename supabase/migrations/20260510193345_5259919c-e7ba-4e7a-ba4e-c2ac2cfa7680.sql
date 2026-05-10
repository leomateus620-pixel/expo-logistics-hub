ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS km_inicial_evento numeric,
  ADD COLUMN IF NOT EXISTS km_final_evento numeric;