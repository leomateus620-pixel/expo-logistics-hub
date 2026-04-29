DELETE FROM public.transport_locations tl
USING public.transports t
WHERE tl.transport_id = t.id
  AND t.status IN ('pendente', 'cancelado');