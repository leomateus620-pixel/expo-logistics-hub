# Entrega única: Fases 3 a 8 da Agenda Restaurante Fenasoja

Base já pronta: migration aplicada (campos operacionais + `venue_import_batches`/`venue_import_rows` + `venue_save_event_agenda`), `sourceRows.ts` (99 linhas), `parser.ts` (881 linhas), `dedupe.ts` e 31 testes verdes.

## 1. Execução da importação (Fase 3)

Edge Function `venue-import-restaurant-agenda`:
- Valida JWT + capacidade admin, usa service role.
- Modo `dry_run` (padrão) e `commit`, para conferência antes de gravar.
- Cria o batch em `venue_import_batches`, registra cada linha em `venue_import_rows` com disposição: `created | merged | matched | skipped_duplicate | review_required | not_an_event`.
- Cria stakeholders faltantes (`relationship_type='externo'`) reaproveitando `normalized_name`; cria eventos vinculados ao espaço **Restaurante Fenasoja**.
- Idempotência garantida pelo índice único de `source_fingerprint`: segunda execução reporta `skipped`, não duplica.
- Status inicial `confirmado` quando há confirmação explícita, senão `solicitado`. Nunca `concluido` por data passada.
- Erro no lote → rollback; nenhum evento existente é apagado ou sobrescrito.
- Gatilho na UI: botão "Importar agenda do restaurante" visível apenas para admin, com prévia (dry run) e confirmação.

Resultado esperado do parser atual: 97 eventos únicos, 1 mesclado (APROMES), 1 não-evento, 23 marcados para revisão.

## 2. Reforma do formulário (Fase 4)

`VenueEventFormDialog.tsx` (1.588 linhas) dividido em subcomponentes e reorganizado em etapas:
- **Etapa 1 — essencial**: título, período (date-range), horário/turno, organização solicitante (busca com acento-insensível), contato, telefone (máscara BR), confirmação, contrato, pagamento, observações operacionais.
- **Seções recolhidas**: preparação e desmontagem · taxas e condições financeiras (BRL) · limpeza e energia · observações internas · anexos/contrato.
- Campos sobrepostos fundidos em um status estruturado + notas por tema; segmented control para status finitos; validações em português.

## 3. Correção de bugs (Fase 5)

Auditoria e correção no formulário, mutations e listagem:
- Guarda de submissão contra duplo clique; chave de idempotência da RPC.
- Data deslocada por UTC, fim antes do início, evento que atravessa a madrugada.
- String vazia gravada no lugar de `null`; campos ocultos retendo valores obsoletos.
- Edição não carregando valores persistidos; modal fechando antes do fim da mutation; erro de banco silencioso.
- Invalidação de cache após criar/editar/excluir; busca ignorando acentos.
- Overflow horizontal no mobile e quebra de notas longas nos cards.

## 4. Visualização (Fase 6)

`VenueWorkspace.tsx` e `VenueEventDetail.tsx`:
- Lista cronológica com agrupamento mensal, próximos × passados, badges de confirmação/contrato/pagamento e selo de revisão.
- Filtros de ano, mês, confirmação, contrato e pagamento; busca por título, organização, solicitante ou telefone.
- Multi-dia como intervalo único; aviso visual de conflito de agenda.
- Detalhe em 7 seções, incluindo "dados de importação" somente para admin.
- Sem rótulos vazios nem placeholders com traço.

## 5. Testes e validação (Fase 7)

- Complementos em `src/test/venueRestaurantImportParser.test.ts` e nova suíte para o fluxo de importação (idempotência, disposições, revisão) e para o formulário (obrigatórios, permissões, atualização da lista).
- `bunx vitest run` completo.
- Validação visual via Playwright em 360 px, 768 px e 1440 px, com captura dos estados vazio, carregando, erro, sucesso, dado completo/incompleto, multi-dia, passado e futuro.

## 6. Relatório de reconciliação (Fase 8)

`docs/IMPORTACAO_AGENDA_RESTAURANTE.md` com totais por disposição e por ano, cada linha ambígua com motivo, bugs encontrados/corrigidos, campos removidos/fundidos/adicionados, arquivos e migrations tocados e resultado dos testes. Toda linha do documento terá disposição final registrada.

## Detalhes técnicos

- A importação roda server-side com service role sob verificação de capacidade admin; nenhuma linha de evento fica embutida em componente de UI.
- Nenhuma tabela ou política existente é removida; RLS atual respeitada.
- Rótulo e rota `/eventos-restaurante-arena` preservados.
