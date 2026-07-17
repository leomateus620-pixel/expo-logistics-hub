## Objetivo

Concluir a migração da UI do módulo Cronograma e Eventos para as RPCs relacionais, expor múltiplos responsáveis/comissões, extrair o form de subeventos com DnD, adicionar deep-linking por query params e cobrir tudo com testes.

## Escopo

### 1. `EventForm` — multi-select relacional + integração RPC
- Adicionar seleção múltipla de **comissões** (`commissions_rel`) e **responsáveis** (`responsibles_rel`) usando `commissions.slug`/`org_members`:
  - Chips com toggle "principal" (força `is_primary`/`relation_role='principal'` único por evento).
  - Autocomplete para responsáveis externos (nome livre, `responsible_type='external'`).
- Manter campos legados `commission`, `owner` como fallback somente-leitura quando não houver vínculos relacionais.
- `onSubmit` retorna payload compatível com `CronogramaSaveEventPayload` (via novo adapter em `modelAdapter.ts`).
- Exibir `lock_version` conflict → `toast` "Recarregue" + refetch automático.

### 2. `EventDrawer` — usar RPC de save
- Substituir chamada atual (upsert direto na tabela) por `saveEventRpc.mutateAsync({ payload, expectedLockVersion })`.
- Ler `lock_version` do evento carregado; passar em cada save.
- Tratar `CronogramaRpcError` com toasts pt-BR pelos códigos.

### 3. Extrair `CronogramaSubeventForm.tsx` com DnD
- Novo componente isolado (fora do JSX inline atual do EventForm).
- Cada linha: título, descrição, período, status, prioridade, comissões (multi), responsáveis (multi), sort_order.
- DnD com `@dnd-kit/core` + `@dnd-kit/sortable` (já usados no projeto se disponível; senão instalar).
- Ao soltar → chamar `reorderSubeventsRpc.mutate({ eventId, orderedIds })` com update otimista + rollback em erro.
- Salvar/criar/excluir individualmente via `saveSubeventRpc` / `deleteSubeventRpc`.
- Botão "Adicionar subevento" cria linha em modo edição (não persiste até save).

### 4. Deep-linking em `CronogramaEventosPage`
- Novos query params:
  - `event=<source_key|id>` — abre drawer.
  - `subevent=<id>` — rola até o subevento e destaca.
  - `mode=view|edit` — controla `startInEdit`.
- Sincronizar mudanças (`setSearchParams`) sem quebrar navegação nativa; preservar `view/timelineYear/timelineMonth`.
- Ao fechar drawer, remover os três params.
- URL persistível: colar link com `?event=...&mode=edit` reabre no mesmo estado.

### 5. Testes (`vitest`)
- `src/lib/__tests__/cronogramaRpc.test.ts`:
  - Mock do `supabase.rpc`.
  - Casos: sucesso, cada código de erro (`NOT_FOUND`, `PERMISSION_DENIED`, `VALIDATION_ERROR`, `CONFLICT`, `RELATIONSHIP_INVALID`, `UNKNOWN`), injeção de `request_id`, propagação de `expected_lock_version`.
- `src/components/cronograma-eventos/__tests__/EventForm.test.tsx`:
  - Renderiza campos essenciais.
  - Adiciona/remove comissão e responsável.
  - Submete com payload relacional correto.
- `src/components/cronograma-eventos/__tests__/CronogramaSubeventForm.test.tsx`:
  - Reordenação chama `onReorder` com ids na ordem correta.
  - Delete confirma via AlertDialog.
- `src/pages/__tests__/CronogramaEventosPage.route.test.tsx`:
  - `?event=<key>` abre drawer.
  - `?mode=edit` entra em edição.
  - Fechar drawer limpa params sem afetar `view/timelineYear`.
- Garantir vitest.config + setup existem (usar guia se ausente).

### 6. Validação
- `tsgo` sem erros novos.
- `bunx vitest run` verde para os arquivos criados.
- Smoke Playwright: navegar `/cronograma-eventos?event=<key existente do seed>&mode=edit`, screenshot mostrando drawer aberto em edição.

## Não incluído
- Refactor do `useCronogramaEventos` para consumir `cronograma_eventos_full` (já expõe RPCs, mas o path de leitura fica no modelo atual — evita risco de regressão de UI larga).
- Alterações de estilo/CSS além do necessário para os novos controles.
- Migrations de banco (schema já entregue na rodada anterior).

## Detalhes técnicos

**Adapter (`modelAdapter.ts`)**: nova função `toSaveEventPayload(form: CronogramaEvent, orgId, sourceKey?, lockVersion?)` produzindo `CronogramaSaveEventPayload` com `commissions[]` e `responsibles[]` normalizados. Reverse: `fromFullEventRow(row)` (para uso futuro pela reescrita do hook — deixamos exportado mas não substituímos o hook nesta entrega).

**Multi-select UI**: `Popover` + `Command` (shadcn) para busca; chips inline abaixo com botão de remover e toggle "principal" (radio group implícito — só 1 principal).

**DnD**: se `@dnd-kit/*` não estiver no `package.json`, instalar `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`.

**Fallback offline**: quando `dbUnavailable`, formulários mostram banner "Modo somente-leitura" e desabilitam save (já existe padrão no hook).
