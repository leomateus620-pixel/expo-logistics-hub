# Reenviar o aviso de teste no celular (reunião de hoje, 18:30)

## Situação
- Seu aparelho continua cadastrado e ativo.
- O aviso real de **17:30** (1 hora antes da reunião) já está agendado e pendente.
- A última tentativa de teste falhou por permissão negada do Google; você indicou que ajustou a conta.

## O que farei
1. Enviar agora um aviso de teste para o seu celular com o conteúdo real da reunião (título, dia, horário e local) e o link que abre o evento na Agenda.
2. Conferir no registro de envios se saiu como "enviado" ou qual erro voltou.
3. Se ainda houver recusa do Google, te dizer em uma frase o que falta ajustar na conta — sem repetir tentativas em loop.
4. Confirmar que o aviso real das 17:30 segue agendado e intacto.

## Não inclui
- Mudança em quem recebe avisos ou e-mails.
- Publicação em produção.

## Detalhes técnicos
- Chamada direta a `send-push-notification` (service role) para `user_id b664fc22-69d3-40f1-8370-16b8a07ec402`, `templateName: 'event-reminder'`, path `/cronograma?event=23577bcf-cd00-47f5-9722-a72a8ba5d7d5`.
- Verificação em `push_send_log` (status/erro) e no registro pendente `channel='push'`, `offset_minutes=60` em `event_reminder_deliveries`.
- Se o token antigo tiver sido invalidado pela troca de conta, peço um novo toque no sininho da Agenda para recadastrar o aparelho.
