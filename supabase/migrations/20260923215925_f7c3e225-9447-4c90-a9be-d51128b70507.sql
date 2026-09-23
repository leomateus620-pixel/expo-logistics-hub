DO $$
DECLARE
  table_name text;
  cycle_tables text[] := ARRAY[
    'transports','vehicles','electric_carts','cart_reservations','cart_history',
    'guests','transport_guests','events','tasks','expenses','expense_documents',
    'expense_approvals','fuel_records','vehicle_usage','schedules','schedule_shifts',
    'shift_assignments','scooters','scooter_reservations','scooter_history'
  ];
BEGIN
  FOREACH table_name IN ARRAY cycle_tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS cycle_year integer NOT NULL DEFAULT 2026 CHECK (cycle_year IN (2026, 2028))',
      table_name
    );
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN cycle_year SET DEFAULT 2028', table_name);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (org_id, cycle_year)',
      table_name || '_org_cycle_idx',
      table_name
    );
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.logistics_inherit_cycle_year()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_cycle integer;
BEGIN
  IF TG_TABLE_NAME = 'transport_guests' THEN
    SELECT cycle_year INTO parent_cycle FROM public.transports WHERE id = NEW.transport_id;
  ELSIF TG_TABLE_NAME = 'cart_history' THEN
    SELECT cycle_year INTO parent_cycle FROM public.electric_carts WHERE id = NEW.cart_id;
  ELSIF TG_TABLE_NAME = 'scooter_history' THEN
    SELECT cycle_year INTO parent_cycle FROM public.scooters WHERE id = NEW.scooter_id;
  ELSIF TG_TABLE_NAME = 'expense_documents' OR TG_TABLE_NAME = 'expense_approvals' THEN
    SELECT cycle_year INTO parent_cycle FROM public.expenses WHERE id = NEW.expense_id;
  ELSIF TG_TABLE_NAME = 'schedule_shifts' THEN
    SELECT cycle_year INTO parent_cycle FROM public.schedules WHERE id = NEW.schedule_id;
  ELSIF TG_TABLE_NAME = 'shift_assignments' THEN
    SELECT cycle_year INTO parent_cycle FROM public.schedule_shifts WHERE id = NEW.schedule_shift_id;
  END IF;

  IF parent_cycle IS NULL THEN
    RAISE EXCEPTION 'Registro principal não encontrado para vínculo operacional';
  END IF;

  IF NEW.cycle_year IS NOT NULL AND NEW.cycle_year <> parent_cycle THEN
    RAISE EXCEPTION 'Não é permitido relacionar registros de ciclos diferentes';
  END IF;

  NEW.cycle_year := parent_cycle;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS transport_guests_inherit_cycle ON public.transport_guests;
CREATE TRIGGER transport_guests_inherit_cycle
BEFORE INSERT OR UPDATE OF transport_id, cycle_year ON public.transport_guests
FOR EACH ROW EXECUTE FUNCTION public.logistics_inherit_cycle_year();

DROP TRIGGER IF EXISTS cart_history_inherit_cycle ON public.cart_history;
CREATE TRIGGER cart_history_inherit_cycle
BEFORE INSERT OR UPDATE OF cart_id, cycle_year ON public.cart_history
FOR EACH ROW EXECUTE FUNCTION public.logistics_inherit_cycle_year();

DROP TRIGGER IF EXISTS scooter_history_inherit_cycle ON public.scooter_history;
CREATE TRIGGER scooter_history_inherit_cycle
BEFORE INSERT OR UPDATE OF scooter_id, cycle_year ON public.scooter_history
FOR EACH ROW EXECUTE FUNCTION public.logistics_inherit_cycle_year();

DROP TRIGGER IF EXISTS expense_documents_inherit_cycle ON public.expense_documents;
CREATE TRIGGER expense_documents_inherit_cycle
BEFORE INSERT OR UPDATE OF expense_id, cycle_year ON public.expense_documents
FOR EACH ROW EXECUTE FUNCTION public.logistics_inherit_cycle_year();

DROP TRIGGER IF EXISTS expense_approvals_inherit_cycle ON public.expense_approvals;
CREATE TRIGGER expense_approvals_inherit_cycle
BEFORE INSERT OR UPDATE OF expense_id, cycle_year ON public.expense_approvals
FOR EACH ROW EXECUTE FUNCTION public.logistics_inherit_cycle_year();

DROP TRIGGER IF EXISTS schedule_shifts_inherit_cycle ON public.schedule_shifts;
CREATE TRIGGER schedule_shifts_inherit_cycle
BEFORE INSERT OR UPDATE OF schedule_id, cycle_year ON public.schedule_shifts
FOR EACH ROW EXECUTE FUNCTION public.logistics_inherit_cycle_year();

DROP TRIGGER IF EXISTS shift_assignments_inherit_cycle ON public.shift_assignments;
CREATE TRIGGER shift_assignments_inherit_cycle
BEFORE INSERT OR UPDATE OF schedule_shift_id, cycle_year ON public.shift_assignments
FOR EACH ROW EXECUTE FUNCTION public.logistics_inherit_cycle_year();