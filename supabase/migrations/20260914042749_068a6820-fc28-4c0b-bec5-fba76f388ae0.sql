-- Backfill canonical category_key for existing cronograma events.
-- Mirrors the app taxonomy order; original free-text category is preserved.
WITH classified AS (
  SELECT
    e.id,
    CASE
      WHEN src ~* 'tecnolog|sistema|software|portal|aplicativ|plataforma|\mti\M|banco de dados' THEN 'tecnologia'
      WHEN src ~* 'financ|or[çc]ament|contabil|administrativ|presta[çc][ãa]o de contas|pagament|tesourar' THEN 'financeiro'
      WHEN src ~* 'cerimoni|protocolo|solenidad|autoridade' THEN 'cerimonial'
      WHEN src ~* 'representa|comitiva|relacionamento|feriado|data especial' THEN 'representacoes'
      WHEN src ~* 'comercial|patroc[íi]n|cota|espa[çc]os|ind[úu]stria|com[ée]rcio|servi[çc]os|exporural|capta[çc][ãa]o|expositor|estande' THEN 'comercial'
      WHEN src ~* 'comunica|m[íi]dia|imprensa|marketing|divulga|publicidade|propaganda|revista' THEN 'comunicacao'
      WHEN src ~* 'log[íi]stica|transporte|mobilidade|hotelaria|turismo|estacionamento|frota|hospedagem' THEN 'logistica'
      WHEN src ~* 'infra|obra|montagem|pavilh|seguran[çc]a|limpeza|manuten|el[ée]tric|fornecedor|opera[çc][ãa]o|gastronom' THEN 'infraestrutura'
      WHEN src ~* 'programa|evento|feira|show|arte|cultura|lan[çc]amento|atra[çc]|novas gera' THEN 'programacao'
      WHEN src ~* 'governan|reuni|comiss[ãa]o|planejament|gest[ãa]o|dire[çc][ãa]o|presid|conselho|assessoria' THEN 'governanca'
      ELSE 'governanca'
    END AS canonical
  FROM (
    SELECT id, coalesce(category, '') || ' ' || coalesce(title, '') AS src
    FROM public.cronograma_eventos
  ) e
)
UPDATE public.cronograma_eventos AS t
SET category_key = classified.canonical
FROM classified
WHERE t.id = classified.id
  AND (
    t.category_key IS NULL
    OR t.category_key NOT IN (
      'governanca','programacao','infraestrutura','logistica','comunicacao',
      'comercial','cerimonial','representacoes','financeiro','tecnologia'
    )
  );