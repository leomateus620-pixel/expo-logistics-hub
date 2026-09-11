# Agenda FENASOJA — Eventos de vários dias, detalhes visíveis e texto em MAIÚSCULAS

## O que já existe (verificado)

- A tabela de eventos já guarda `start_date`, `end_date`, `start_time`, `end_time`, com regras no banco que impedem fim antes do início. Não é preciso migração de dados: eventos antigos já funcionam como eventos de um dia.
- O formulário de novo evento hoje só oferece **Data / Início / Fim** — não há como marcar data final.
- A lista (linha do tempo) e os filtros olham somente a data de início, então um evento de 11 a 15 de setembro some ao filtrar dias 12–15.
- O card do evento não mostra a descrição/observações; hoje elas só aparecem depois de abrir o evento ou o subevento.

## O que será feito

### 1. Evento de vários dias (um único evento)
- Novo controle no formulário: **"Evento de vários dias"**. Desligado: Data + horário de início + horário de término. Ligado: Data inicial + horário inicial + Data final + horário final.
- Resumo imediato do período escolhido ("11 SET 08:00 → 15 SET 18:00 · 5 DIAS").
- Seleção de intervalo em calendário: no computador, calendário com dois meses e o intervalo destacado; no celular, seleção em sequência (toque no primeiro dia, toque no último) com o mesmo destaque. Estados visuais para dia inicial, dias no meio, dia final, hoje e datas inválidas; navegação por teclado no desktop.
- Validações: fim nunca antes do início; no mesmo dia, hora final depois da inicial.
- Edição usa o mesmo componente, já vem preenchida, e alternar entre um dia e vários dias nunca cria um evento novo — o evento continua sendo o mesmo.

### 2. Um evento = um card
- A linha do tempo, o calendário e as buscas passam a considerar o período inteiro do evento, mas o evento aparece **uma única vez**, ordenado pela data/hora de início.
- Filtros de mês, semana, hoje, próximos 30 dias e intervalo personalizado passam a usar sobreposição de períodos (o evento aparece se qualquer dia dele cair no filtro).
- Contadores (semana, mês, dashboard, comissões, percentuais) continuam contando **1 evento**, mesmo que ele ocupe 5 dias.

### 3. Card e tela de detalhes
- Card de evento de vários dias mostra o intervalo com clareza (11 → 15 SET, horários quando úteis), mantendo o visual atual.
- Tela de detalhes mostra "Período: 11 SET 2026 · 08:00 até 15 SET 2026 · 18:00 · 5 dias" para eventos longos e o formato atual para eventos de um dia.

### 4. Informações operacionais deixam de ficar escondidas
- Quando o evento tem descrição/observações, um trecho limpo aparece direto no card (com boa quebra de linha, sem cortar informação essencial).
- Na tela do evento, um bloco "Detalhes" reúne essas informações junto de data, local, responsável e comissão.
- Se houver instruções relevantes nos subeventos, elas são resumidas no evento principal sem alterar nem remover o sistema de subeventos.
- Solução genérica para qualquer evento — nada específico para um evento em particular.

### 5. Texto em MAIÚSCULAS
- Um utilitário único de exibição converte textos digitados pelas pessoas (título, descrição, observações, local, nomes de exibição, títulos de subevento) para maiúsculas, preservando acentos (COMUNICAÇÃO, REUNIÃO, SÃO JOSÉ).
- Campos de digitação mostram maiúsculas enquanto a pessoa escreve.
- Nunca aplicado a e-mails, links, senhas, identificadores técnicos ou nomes de arquivo.
- Sem migração destrutiva: registros antigos passam a exibir em maiúsculas automaticamente.

### 6. Celular e computador
- Validação em 320, 375, 430 px, tablet e desktop: sem rolagem lateral, sem card cortado, calendário nunca maior que a tela, botões inferiores sempre acessíveis, alvos de toque confortáveis.

## Detalhes técnicos

- Sem mudança de schema: `start_date`/`end_date`/`start_time`/`end_time` já existem, com `cronograma_eventos_date_range_ck` e `cronograma_eventos_same_day_time_ck`. Verificar apenas se `cronograma_save_event` e `modelAdapter.ts` propagam `endDate` na criação/edição.
- Novos utilitários em `src/lib/cronograma-eventos.ts`: `eventOverlapsRange(event, start, end)`, `getEventDurationDays` (já existe), `formatEventPeriod(event)`, e `normalizeDisplayText` em `src/lib/textNormalize.ts`.
- `src/lib/cronograma-timeline.ts`: substituir as comparações `event.date === …` / `event.date < …` (linhas ~280–301) e `monthKeyFromDate` por lógica de sobreposição, com agrupamento por mês pela data de início e deduplicação por `id`.
- `src/lib/cronograma-dashboard-selectors.ts`: revisar todos os contadores para contar por `id` único.
- Novos componentes: `EventDateRangePicker`, `EventDateBadge`, `EventDetailsPreview` usados por `EventForm.tsx`, `EventCards.tsx`, `EventDrawer.tsx`, `CalendarMonthView.tsx` e as telas mobile.
- `CalendarMonthView.tsx` já expande o intervalo; garantir que continue marcando os dias sem gerar cards duplicados na lista.
- Cálculos de intervalo memoizados; nada de gerar um card sintético por dia.
- Testes automatizados novos para `eventOverlapsRange`, limites de mês/ano, meia-noite, e ausência de cards duplicados; testes existentes de cronograma continuam passando.

## Fora do escopo

- Nenhuma mudança em permissões, RLS, destinatários de notificações, lembretes push ou publicação em produção.
