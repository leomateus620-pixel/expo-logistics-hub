-- Renomeia origem para "Santa Rosa" (mantém coordenadas do Parque)
UPDATE public.transports
   SET origem = 'Santa Rosa', updated_at = now()
 WHERE id IN (
   '9da9dd3c-1a40-4f1e-8a82-596505f34d3a',
   'f7833513-6bcb-4df7-8123-dcb072eea04d'
 );

-- Backfill Passo Fundo (já chegou no destino) — registra perna de ida
UPDATE public.transports
   SET km_retirada = 0, updated_at = now()
 WHERE id = '9da9dd3c-1a40-4f1e-8a82-596505f34d3a' AND km_retirada IS NULL;

INSERT INTO public.vehicle_usage (org_id, vehicle_id, responsavel_user_id, km_saida, km_chegada, retirada_em, devolucao_em, observacoes)
SELECT org_id, vehicle_id, motorista_user_id, 0, 280, inicio_real_em, chegada_destino_em,
       'Ida automática (backfill) — transporte ' || id
  FROM public.transports
 WHERE id = '9da9dd3c-1a40-4f1e-8a82-596505f34d3a'
   AND vehicle_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.vehicle_usage vu
      WHERE vu.vehicle_id = public.transports.vehicle_id
        AND vu.observacoes = 'Ida automática (backfill) — transporte ' || public.transports.id
   );

UPDATE public.vehicles SET km_atual = 280
 WHERE id = 'f8a51a52-1204-4f8e-ac10-97c572c79448' AND COALESCE(km_atual, 0) < 280;

-- Backfill Chapecó (em andamento) — só registra km_retirada do odômetro atual
UPDATE public.transports
   SET km_retirada = 4409, updated_at = now()
 WHERE id = 'f7833513-6bcb-4df7-8123-dcb072eea04d' AND km_retirada IS NULL;