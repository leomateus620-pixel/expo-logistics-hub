-- Backfill coordinates for active transports that are missing them
-- Origin defaults to Santa Rosa
UPDATE public.transports
SET origem_lat = -27.8708, origem_lng = -54.4814
WHERE status IN ('em_andamento','em_retorno','chegou_destino','pendente')
  AND (origem_lat IS NULL OR origem_lng IS NULL);

-- Destination by titulo / voo_cidade (canonical known coordinates)
UPDATE public.transports SET destino_lat = -27.1342, destino_lng = -52.6566
WHERE destino_lat IS NULL AND titulo = 'Aeroporto' AND voo_cidade = 'Chapecó';

UPDATE public.transports SET destino_lat = -28.2434, destino_lng = -52.3261
WHERE destino_lat IS NULL AND titulo = 'Aeroporto' AND voo_cidade = 'Passo Fundo';

UPDATE public.transports SET destino_lat = -28.2823, destino_lng = -54.1693
WHERE destino_lat IS NULL AND titulo = 'Aeroporto' AND voo_cidade = 'Santo Ângelo';

UPDATE public.transports SET destino_lat = -29.9939, destino_lng = -51.1714
WHERE destino_lat IS NULL AND titulo = 'Aeroporto' AND voo_cidade = 'Porto Alegre';
