## Objetivo
Adicionar a categoria **Representações** aos filtros do módulo Cronograma e Eventos e garantir que os 8 eventos já cadastrados (jul-ago/2026) apareçam quando o usuário selecionar esse filtro.

## Diagnóstico
- Os filtros são alimentados pelo enum `CronogramaCategory` em `src/components/cronograma-eventos/types.ts` (7 valores atuais: governanca, programacao, infraestrutura, logistica, comunicacao, comercial, cerimonial). Sem entrada nova, a categoria "Representações" não aparece no dropdown.
- O mapeamento visual acontece em `modelAdapter.ts › getVisualCategory`, que decide via regex sobre `event.category`/título. Hoje, um registro com `category='Representações'` cai no fallback `'governanca'` — por isso os 8 eventos aparecem, mas classificados errado, e não respondem ao filtro certo.
- Labels/tons ficam em `cronogramaData.ts` (`categoryLabels`, `categoryTone`).

## Alterações (somente front-end)

1. **`src/components/cronograma-eventos/types.ts`**  
   Acrescentar `'representacoes'` ao union `CronogramaCategory`.

2. **`src/components/cronograma-eventos/cronogramaData.ts`**  
   - `categoryLabels.representacoes = 'Representações'`.  
   - `categoryTone.representacoes = 'bg-indigo-700'` (tom distinto dos demais, harmônico com o design system).

3. **`src/components/cronograma-eventos/modelAdapter.ts`**  
   Inserir, no topo de `categoryKeywords`, a regra:  
   `['representacoes', /representa[çc][ãa]o|representa[çc][õo]es|agenda institucional|compromisso externo/i]`  
   Assim, todos os 8 eventos (que têm `category='Representações'` e `event_type='representacao'` no banco) serão mapeados para o novo bucket. Nenhum evento existente é afetado — a regex é específica.

## Persistência / dados
Não é preciso alterar o banco: os registros já foram gravados com `category='Representações'` no turno anterior, e o adapter passa a reconhecê-los. Filtro passa a listar 8 eventos ao selecionar "Representações".

## Validação
- Rodar `tsgo` para garantir que o novo membro do union não quebra maps `Record<CronogramaCategory, …>`.
- Rodar `bunx vitest run src/test/cronogramaTimeline.test.tsx` (usa o enum de categorias).
- Verificação visual: abrir `/cronograma-eventos`, expandir filtros, selecionar "Representações" e confirmar os 8 cards de julho/agosto.

## Fora de escopo
- Backend/RPC (nada muda).
- Ícones específicos ou novas cores no design system além do tom Tailwind indicado.
