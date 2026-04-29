
-- 1) Limpa localizações órfãs de transportes que NÃO estão mais ativos
DELETE FROM public.transport_locations tl
USING public.transports t
WHERE tl.transport_id = t.id
  AND t.status NOT IN ('em_andamento','em_retorno','chegou_destino');

-- 2) Trigger: quando o status do transporte sair dos estados ativos,
--    apaga a linha de localização correspondente para evitar pin "fantasma".
CREATE OR REPLACE FUNCTION public.cleanup_transport_location_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('em_andamento','em_retorno','chegou_destino')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    DELETE FROM public.transport_locations WHERE transport_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_transport_location ON public.transports;
CREATE TRIGGER trg_cleanup_transport_location
AFTER UPDATE OF status ON public.transports
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_transport_location_on_status_change();
