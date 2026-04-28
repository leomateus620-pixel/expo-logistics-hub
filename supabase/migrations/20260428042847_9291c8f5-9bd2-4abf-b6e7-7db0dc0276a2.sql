ALTER TABLE public.electric_carts
  ADD COLUMN IF NOT EXISTS tipo_responsavel text NOT NULL DEFAULT 'interno',
  ADD COLUMN IF NOT EXISTS empresa_slug text;