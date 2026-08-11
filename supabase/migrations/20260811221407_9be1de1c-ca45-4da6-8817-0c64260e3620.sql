DELETE FROM public.cronograma_eventos
WHERE event_type = 'feriado'
   OR category = 'Feriados e datas especiais';