# Agenda das comissões/assessorias: fim do "Rascunho", tudo "Solicitado"

## Causa confirmada
- No formulário da agenda das comissões, a opção **Solicitado** é gravada no banco como "aguardando definição".
- Na hora de mostrar, "aguardando definição" é traduzido de volta como **Rascunho**. Por isso todo evento criado (ou editado) pelas comissões aparece como Rascunho, mesmo escolhendo Solicitado.
- Hoje existem 25 eventos nessa situação, todos criados no sistema (23 sem data definida).

## O que será feito
1. **Gravação correta:** "Solicitado" passa a ser salvo como situação ativa normal ("planejado"), a mesma que a Agenda Fenasoja já mostra como Solicitado.
2. **Sem Rascunho:** a opção "Rascunho" sai do formulário e dos filtros da agenda das comissões/assessorias. Qualquer evento antigo sem situação ou "aguardando definição" passa a aparecer como **Solicitado**, nunca como Rascunho.
3. **Corrigir os existentes:** os 25 eventos atuais em "aguardando definição" serão alterados para Solicitado ("planejado"), com registro no histórico do evento. Nada é apagado; datas, responsáveis e comissões ficam iguais.
4. **Edição:** ao editar e salvar, a situação escolhida é sempre respeitada (não volta a Rascunho).
5. **Testes automáticos:** criar com Solicitado grava "planejado"; "aguardando definição" e vazio aparecem como Solicitado; Rascunho não existe mais nas opções.

## Detalhes técnicos
- `src/features/commission-agenda/lib/event-draft.ts`: `STATUS_TO_DB.requested = 'planejado'`; remover `draft`.
- `adapters/cronograma.adapter.ts`: `aguardando_definicao`, `undated`, `in_definition`, `rascunho`, `draft` e `null` → `requested`.
- `EventFormShell.tsx` / `AgendaFiltersSheet.tsx`: remover `'draft'` das opções; ajustar tipo `EventStatus` e rótulos/fixtures.
- Dados: `UPDATE cronograma_eventos SET status='planejado' WHERE status='aguardando_definicao'` + log via `cronograma_evento_logs`.
- Agenda principal (`useCronogramaEventos.ts`) não muda — eventos sem data continuam aceitos, mas os criados pelas comissões passam a ser Solicitados.
