-- Public read projection only. No lot, sale, contract, scope or token changes.
-- inventory and lot RPCs already guard buyerName by raw l.status = SOLD and
-- confirmed lot_sales. The logo endpoint independently requires confirmed items.
CREATE OR REPLACE FUNCTION public.public_map_lot_availability(_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE _status
    WHEN 'AVAILABLE' THEN 'AVAILABLE'
    WHEN 'SALE_OPEN' THEN 'SOLD'
    WHEN 'SOLD' THEN 'SOLD'
    ELSE 'UNAVAILABLE'
  END;
$function$;
