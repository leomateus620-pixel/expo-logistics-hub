# Importação da Agenda Restaurante Fenasoja + refinamento do módulo

Fonte autoritativa: `AGENDA_RESTAURANTE_FENASOJA.docx` (98 linhas candidatas: 35 em 2025, 46 em 2026, 15 em 2027, 2 em 2028).
Módulo alvo: **Eventos Restaurante e Arena** (rota `/eventos-restaurante-arena` — preservada; rótulo mantido). Todos os registros vão para o espaço **Restaurante Fenasoja**.

## Situação atual verificada

- `venue_events` tem **1 registro** hoje — não há histórico de importação; nada será sobrescrito.
- O schema **não possui** campos para telefone de contato, status de confirmação, status de contrato, status de pagamento, taxas, limpeza, luz, preparação/desmontagem textual, nem metadados de importação.
- `venue_events_schedule_check` exige `start_at`, `end_at`, `setup_start_at` e `teardown_end_at` juntos quando há data.
- Existem 2 espaços (Restaurante, Arena) e poucos stakeholders (6 patrocinadores da Arena). O documento cita ~40 organizações novas.

## 1. Migração de banco

Nova migration (aditiva, sem quebrar nada existente):

- Colunas em `venue_events`: `confirmation_status`, `contract_status`, `payment_status` (enums texto com CHECK, default `nao_informado`), `shift`, `contact_name`, `contact_phone`, `fee_type`, `fee_amount` (numeric), `fee_quantity`, `cleaning_responsibility`, `cleaning_fee`, `electricity_fee`, `preparation_notes`, `preparation_start_date`, `preparation_end_date`, `teardown_deadline_note`, `reservation_start_date`, `reservation_end_date`, `operational_notes`, `internal_notes`, `requires_review` (bool), `review_reasons` (text[]), `source_document`, `source_row`, `source_fingerprint`, `import_batch_id`.
- Índice único parcial `(org_id, source_fingerprint) WHERE source_fingerprint IS NOT NULL` — garante idempotência real no banco.
- Nova tabela `venue_import_batches` (id, org_id, source_document, contadores, status, executado_por, timestamps) + GRANTs + RLS (leitura para membros com `venue_events_access`, escrita apenas service_role/admin).
- Nova tabela `venue_import_rows` (batch_id, source_row, raw_text, fingerprint, disposition, event_id, reason) para a reconciliação linha-a-linha.
- Atualizar `venue_save_event` para persistir os novos campos vindos do payload (mantendo assinatura e versionamento otimista).

## 2. Parser semântico + seed de importação

Arquivo `src/lib/venue-restaurant-import/` com:

- `sourceRows.ts` — as 98 linhas transcritas literalmente do DOCX (texto bruto por célula + número da linha).
- `parser.ts` — normalização pura e testável:
  - **Datas**: "26 e 27 de março", "19 a 22 de junho", "25 de outubro a 02 nov", "01 de abril a 30 de maio de 2026" → intervalo ISO com ano do bloco. Sempre America/São_Paulo, sem conversão UTC que desloque o dia.
  - **Turnos → faixa padrão** (decidido): Meio-dia 11:00–15:00, Noite 19:00–23:30, Dia 08:00–18:00, Dia/Noite 08:00–23:30. Montagem = 2h antes; desmontagem = 3h depois. Horário explícito ("18:30", "18h de sábado", "14h") tem precedência.
  - **Telefone**: `99986 9860`, `51 99724 9968`, `996662 0539` → E.164/máscara BR normalizada.
  - **Status**: `ok/OK/0k` → confirmado; `pg/pago/PAGO/Pg 2 sal` → pago; `Cont ok/Contrato ok/Contr ass/Contrato assinado` → contrato assinado; `S/C, s/c, Sem contrato` → sem contrato; `N Enviado/N` → não enviado; `acerto` → a acertar. Valor não confiável → `nao_informado` + revisão.
  - **Taxas**: "3 salários", "6 salários", "taxas 1.500,00 – cobrar duas taxas 2 dias" → `fee_type`/`fee_amount`/`fee_quantity`.
  - **Limpeza/luz**: "entregam limpo", "irão limpar sem taxas", "Taxa Limpeza", "cobrar luz".
  - **Preparação/reserva/desmontagem**: "dia 03 decorar", "dia 04 p arrumar", "reservar dias 15, 16, 17 e 18", "retirar tudo até 10h do dia 06", "entrar com limpeza às 07h" → campos próprios, **nunca** no título.
  - **Correção de colunas deslocadas**: detecção por heurística (telefone/status/turno em coluna errada) — cobre Indumóveis 15/04/2025, Rotary 30/05/2026 ("Contrato ok" no turno), Sicredi 11/08 e 08/10/2026 ("Ju"), 2027 onde título e solicitante estão invertidos.
- `fingerprint.ts` — hash estável (documento + linha + data normalizada + título + organizador).
- `dedupe.ts` — comparação normalizada (sem acento, minúscula) por intervalo de datas + título + organizador + telefone. Eventos recorrentes (Almoço de Ideias, Café Colonial, Noite do Agro, formaturas, Rotary) em datas distintas **não** são duplicatas.

## 3. Execução da importação

Edge Function administrativa `venue-import-restaurant-agenda` (verifica JWT + capacidade admin, usa service role):

- Cria o batch, processa em transação por lote, insere stakeholders faltantes (`relationship_type='externo'`) reaproveitando `normalized_name`, cria eventos com `event_type` compatível e vínculo ao espaço Restaurante.
- Idempotente: rodar duas vezes não duplica (fingerprint único). Segunda execução reporta `skipped`.
- Cada linha recebe uma disposição registrada: `created | merged | matched | skipped_duplicate | review_required | not_an_event`.
- Falha no lote → rollback; nenhum evento de produção existente é apagado ou sobrescrito.
- Status inicial: `confirmado` quando há confirmação explícita, senão `solicitado`. **Nunca** marcar como `concluido` só porque a data passou.

Casos marcados como revisão (não inventar dados):
- APROMES 24/04/2027 (duas linhas complementares → 1 evento mesclado, ambas as referências preservadas).
- Baile do Baltazar 03/04 e 10/04/2027 (2 eventos + aviso de possível correção).
- Sicredi "Ju" (11/08 e 08/10/2026) — título não confiável.
- OBS 2028 "05 utilização p Cotrirosa gratuito" → não é evento; registrado como `not_an_event` no relatório.
- Linhas sem título de evento (Alibem 27/06, Hortigranjeiros, Indumóveis, Cotrirosa 12/06) → título derivado do organizador + selo de revisão.

## 4. Auditoria e simplificação do formulário

`VenueEventFormDialog.tsx` (1.588 linhas) passa por consolidação:

- Fluxo em etapas com divulgação progressiva; etapa 1 apenas com o essencial: título, período (date-range), horário/turno, organização solicitante (busca), contato, telefone (máscara BR), confirmação, contrato, pagamento, observações operacionais.
- Seções opcionais recolhidas: preparação e desmontagem · taxas e condições financeiras (campo BRL) · limpeza e energia · observações internas · anexos/contrato.
- Campos duplicados/sobrepostos removidos ou fundidos em um único status estruturado + um campo de notas por tema.
- Controles: date-range picker, time picker 24h, máscara de telefone, moeda BRL, segmented control para status finitos, mensagens de validação em português.

## 5. Correção de bugs

Auditoria e correção no formulário, mutations e listagem:

- Duplo clique/reenvio criando duplicata (guarda de submissão + chave de idempotência já suportada pela RPC).
- Data deslocada por UTC; fim antes do início; evento que vira madrugada terminando no dia errado.
- String vazia gravada no lugar de `null`.
- Formulário de edição não carregando valores persistidos; modal fechando antes do fim da mutation; erro de banco silencioso.
- Lista/filtros desatualizados após criar, editar ou excluir (invalidação de cache).
- Busca ignorando acentos e variações de nome de organização.
- Overflow horizontal no mobile; notas longas quebrando cards; campos ocultos retendo valores obsoletos.
- Validação server-side e verificação de permissão nos campos restritos.

## 6. Visualização

- Lista cronológica com agrupamento mensal, separação de próximos × passados, badges de confirmação, contrato, pagamento e aviso de revisão. Sem rótulos vazios nem traços de placeholder.
- Busca por título, organização, solicitante ou telefone; filtros de ano, mês, confirmação, contrato e pagamento.
- Eventos multi-dia exibidos como intervalo único; aviso visual de conflito de agenda.
- Detalhe em 7 seções: informações · datas e horários · solicitante e contato · contrato e pagamento · preparação, limpeza e desmontagem · observações internas · dados de importação (somente admin).
- Validação visual em 360 px, 768 px e 1440 px via Playwright, com captura dos estados vazio, carregando, erro, sucesso, dado completo, dado incompleto, multi-dia, histórico e futuro.

## 7. Testes

Suíte nova em `src/test/venueRestaurantImport.test.ts` e complementos:
normalização de datas · intervalos multi-dia · telefone · mapeamento de status · detecção de duplicata · idempotência do import · fluxo de revisão · criação e edição de evento · validação de obrigatórios · permissões · atualização da lista após mutação · renderização responsiva de conteúdo longo. `bunx vitest run` completo ao final.

## 8. Relatório de reconciliação

Documento `docs/IMPORTACAO_AGENDA_RESTAURANTE.md` com: total de linhas analisadas, candidatos válidos, criados, correspondidos, mesclados, duplicatas ignoradas, revisões pendentes, observações não-evento, resultados por ano, lista de cada linha ambígua com o motivo, bugs encontrados, bugs corrigidos, campos do formulário removidos/fundidos/adicionados, arquivos e migrations alterados e resultado dos testes. **Toda linha do documento terá disposição final registrada.**

## Detalhes técnicos

- Migrations aditivas; nenhuma tabela ou política existente é removida. RLS atual respeitada; import roda server-side com service role sob verificação de capacidade admin.
- Idempotência garantida no banco (índice único por fingerprint), não só na aplicação.
- Nenhum evento é embutido em componente de UI; toda origem de dados vem do banco.
