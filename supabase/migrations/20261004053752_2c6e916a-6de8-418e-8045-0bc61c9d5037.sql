CREATE OR REPLACE FUNCTION public.cronograma_location_code_sync() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $function$
BEGIN
  NEW.location_code := CASE btrim(NEW.location)
    WHEN 'SALA DOS VOLUNTÁRIOS' THEN 'sala_voluntarios'
    WHEN 'CASA FENASOJA' THEN 'casa_fenasoja'
    WHEN 'CENTRO DE EVENTOS FENASOJA' THEN 'centro_eventos_fenasoja'
    WHEN 'AUDITÓRIO-CENTRO ADMINISTRATIVO' THEN 'auditorio_centro_administrativo'
    ELSE NULL
  END;
  RETURN NEW;
END $function$;