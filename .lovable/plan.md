## Objetivo
1. Substituir os cards "Atrasadas" e "Sem data" no hero do Cronograma por um único widget compacto de conexão Google Agenda (Liquid Glass, coerente com o hero).
2. Migrar o envio de lembretes de eventos do Resend para a infra **Lovable Emails** (domínio já configurado), eliminando dependência de `RESEND_API_KEY`.
3. Confirmar que não há dashboard administrativo — apenas o widget no hero + Settings continua sem seção dedicada.

## 1. Widget Google Agenda no hero
**Arquivo:** `src/components/cronograma-eventos/FenasojaCountdownHero.tsx`
- Remover os dois blocos `.fenasoja-countdown-operation-metric` (Atrasadas + Sem data) — linhas 238-254.
- Inserir no lugar um novo componente `<GoogleCalendarHeroWidget />` mantendo o grid do `.fenasoja-countdown-operations` (ocupa as 2 colunas antes usadas).
- Prop `onOpenUndated` deixa de ser necessária aqui; remover do componente e das chamadas em `CronogramaEventosPage.tsx` **apenas** onde é passada para o Hero (manter para os demais consumidores intactos).

**Novo componente:** `src/components/cronograma-eventos/GoogleCalendarHeroWidget.tsx`
- Consome `useGoogleCalendarConnection()`.
- Estados visuais (compactos, 1-2 linhas):
  - **Desconectado:** ícone `Calendar` + "Sincronizar com Google Agenda" + botão "Conectar".
  - **Conectando/backfill:** spinner + "Sincronizando N eventos…" + barra fina.
  - **Conectado:** check verde + e-mail + "Última sync: HH:mm" + botão discreto "Desconectar".
  - **Reconectar:** alerta âmbar + botão "Reconectar".
- Design: mesma linguagem `.fenasoja-countdown-operation-metric` (glass, borda dourada, hover 3D). Estilos adicionados em `src/styles/fenasoja-countdown.css` sob `.fenasoja-google-widget`.

## 2. Remover seção Google Agenda de Settings
**Arquivo:** `src/pages/SettingsPage.tsx`
- Remover import e uso de `<GoogleCalendarSection />`.
- Manter `src/components/settings/GoogleCalendarSection.tsx` no repositório por ora (não é referenciado) — ou apagar. Vou **apagar** para evitar dead code.

## 3. E-mails de lembrete via domínio (Lovable Emails)
**Pré-requisitos verificados via `email_domain--check_email_domain_status`** antes de mexer no código.
- Se domínio ainda não configurado → orientar setup (o hero funciona sem depender disso; e-mails ficam em fila).
- Rodar `email_domain--setup_email_infra` e `email_domain--scaffold_transactional_email` se ainda não rodados (idempotentes).

**Novo template:** `supabase/functions/_shared/transactional-email-templates/event-reminder.tsx`
- React Email component: título, contagem regressiva (24h ou 2h), data/hora formatada BR, local, comissão, link para o cronograma.
- Registrar em `registry.ts` como `event-reminder`.

**Refactor:** `supabase/functions/event-reminders/index.ts`
- Remover chamada direta a Resend.
- Para cada destinatário/evento, invocar `send-transactional-email` com:
  - `templateName: 'event-reminder'`
  - `idempotencyKey: \`reminder-\${event_id}-\${window}-\${user_id}\`` (dedupe nativo)
  - `templateData: { eventTitle, when, whenRelative, local, commissionName, ctaUrl }`
- Marcar `event_reminder_deliveries` como `sent` só após retorno OK do invoke.
- Remover env `RESEND_API_KEY` / `REMINDER_FROM_EMAIL` do fluxo.

Deploy: `event-reminders` + `send-transactional-email` (após scaffold).

## 4. Fora do escopo (confirmado)
- Nenhum dashboard admin de fila / diagnóstico Google.
- Sub-eventos permanecem como bullets na descrição do evento pai (mantém entrega anterior).
- Nada muda na sincronização Google em si (worker, outbox, OAuth) — só a UI de entrada e o transporte de e-mail.

## Detalhes técnicos
- `useGoogleCalendarConnection` já expõe tudo que o widget precisa; sem novas queries.
- O `.fenasoja-countdown-operations` é grid 3 colunas em desktop (`next-action` + 2 métricas). Vira grid 2 colunas: `next-action` + `google-widget` (col-span-1, esticando em mobile).
- Ordem exata de execução em build mode:
  1. `email_domain--check_email_domain_status` (leitura)
  2. Se necessário: `setup_email_infra` → `scaffold_transactional_email`
  3. Criar template + registrar
  4. Refatorar `event-reminders/index.ts`
  5. `deploy_edge_functions` em `event-reminders` e `send-transactional-email`
  6. Criar `GoogleCalendarHeroWidget.tsx` + CSS
  7. Editar `FenasojaCountdownHero.tsx` (remover 2 tiles, inserir widget)
  8. Remover `<GoogleCalendarSection />` de `SettingsPage.tsx` e apagar o arquivo
