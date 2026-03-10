
-- 5.4: Validation triggers

-- 1. Validate transports
CREATE OR REPLACE FUNCTION public.validate_transport()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origem IS NULL OR trim(NEW.origem) = '' THEN
    RAISE EXCEPTION 'origem é obrigatória';
  END IF;
  IF NEW.destino IS NULL OR trim(NEW.destino) = '' THEN
    RAISE EXCEPTION 'destino é obrigatório';
  END IF;
  IF NEW.status = 'concluido' AND NEW.fim_real_em IS NULL THEN
    NEW.fim_real_em := now();
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_transport
  BEFORE INSERT OR UPDATE ON public.transports
  FOR EACH ROW EXECUTE FUNCTION public.validate_transport();

-- 2. Validate vehicle_usage
CREATE OR REPLACE FUNCTION public.validate_vehicle_usage()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.km_chegada IS NOT NULL AND NEW.km_chegada < NEW.km_saida THEN
    RAISE EXCEPTION 'km_chegada deve ser >= km_saida';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_vehicle_usage
  BEFORE INSERT OR UPDATE ON public.vehicle_usage
  FOR EACH ROW EXECUTE FUNCTION public.validate_vehicle_usage();

-- 3. Validate guests
CREATE OR REPLACE FUNCTION public.validate_guest()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nome IS NULL OR trim(NEW.nome) = '' THEN
    RAISE EXCEPTION 'nome do hóspede é obrigatório';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_guest
  BEFORE INSERT OR UPDATE ON public.guests
  FOR EACH ROW EXECUTE FUNCTION public.validate_guest();

-- 4. Ensure set_updated_at triggers exist on all main tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['transports','vehicles','vehicle_usage','electric_carts','scooters','events','schedules','schedule_shifts','shift_assignments','tasks','guests','org_members'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' AND c.relname = tbl AND t.tgname = 'trg_set_updated_at'
    ) THEN
      EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', tbl);
    END IF;
  END LOOP;
END; $$;
