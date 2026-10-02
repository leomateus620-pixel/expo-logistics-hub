DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.lot_contract_lots'::regclass AND contype='f'
      AND confrelid = 'public.commercial_lots'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.lot_contract_lots DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.lot_contract_lots_validate_lot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.commercial_lots WHERE id = NEW.lot_id) THEN
    RAISE EXCEPTION 'Lote % inexistente', NEW.lot_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lot_contract_lots_validate_lot_trg ON public.lot_contract_lots;
CREATE TRIGGER lot_contract_lots_validate_lot_trg
BEFORE INSERT OR UPDATE OF lot_id ON public.lot_contract_lots
FOR EACH ROW EXECUTE FUNCTION public.lot_contract_lots_validate_lot();

CREATE OR REPLACE FUNCTION public.commercial_lots_block_delete_if_contract_linked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lot_contract_lots WHERE lot_id = OLD.id) THEN
    RAISE EXCEPTION 'Lote vinculado a contrato de venda' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS commercial_lots_block_delete_contract_trg ON public.commercial_lots;
CREATE TRIGGER commercial_lots_block_delete_contract_trg
BEFORE DELETE ON public.commercial_lots
FOR EACH ROW EXECUTE FUNCTION public.commercial_lots_block_delete_if_contract_linked();

NOTIFY pgrst, 'reload schema';