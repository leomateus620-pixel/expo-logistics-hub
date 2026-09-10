# Desativar os e-mails de lembrete de evento

Os avisos de evento passam a sair apenas por notificação no celular (push) e pelo Google Agenda. Os e-mails de lembrete enviados pelo domínio da Fenasoja param de sair.

## O que muda

1. **Lembretes de evento por e-mail: desligados.** Nenhum novo lembrete de 24h, 2h ou 1 hora será enviado por e-mail.
2. **Aviso no celular: mantido.** Continua saindo 1 hora antes do evento, para as mesmas pessoas de sempre (lideranças das comissões, relacionados diretos e quem optou por receber tudo).
3. **Aviso de "você foi relacionado a um evento": mantido**, só no celular, como já funciona hoje.
4. **Fila limpa.** Os lembretes por e-mail que ainda estavam agendados e não foram enviados serão cancelados, para não dispararem depois. Nada que já foi enviado é alterado.
5. **E-mails de conta continuam funcionando** (redefinição de senha, confirmação de acesso). Só os lembretes de evento são desligados.

## Ponto de atenção

Quem ainda não ativou o sininho de avisos no celular deixará de receber qualquer lembrete do sistema (só verá pelo Google Agenda). Se quiser, posso deixar um aviso no módulo Eventos incentivando a ativação.

## Como reverter

O desligamento fica controlado por uma chave única no envio de lembretes: basta reativar o canal de e-mail para tudo voltar como antes, sem refazer nada.

## Detalhes técnicos

- `supabase/functions/event-reminders/index.ts`: constante `EMAIL_REMINDERS_ENABLED = false`. No agendamento, o canal `email` deixa de ser criado (apenas `push` em `offsetMinutes === 60`); no envio, entregas com `channel = 'email'` ainda pendentes são marcadas como `cancelled` em vez de enviadas.
- Resolução de destinatários, offsets, idempotência e cancelamento por alteração/exclusão do evento permanecem inalterados.
- Limpeza pontual via SQL: `event_reminder_deliveries` com `channel = 'email'` e `status = 'pending'` → `cancelled`.
- `send-transactional-email`, `process-email-queue` e `auth-email-hook` seguem intactos.
- Redeploy de `event-reminders`. Sem publicação em produção.
