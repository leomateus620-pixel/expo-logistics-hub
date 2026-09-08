# Teste do aviso no celular — reunião de hoje 18:30

## O que já confirmei agora

- Seu aparelho está cadastrado e ativo (registrado hoje às 14:55, horário de Brasília).
- A reunião "1ª REUNIÃO COMISSÃO CENTRAL FENASOJA 2028" (hoje, 18:30, Auditório Central) tem para você dois lembretes preparados por e-mail: 16:30 e 17:30.
- Ainda **não existe** um aviso no celular preparado para essa reunião, porque a preparação dos lembretes rodou antes de você ativar o aparelho.

## O que farei

1. **Enviar agora um aviso de teste no seu celular** com o conteúdo real da reunião (título, dia, horário e local) e o link que abre o evento na Agenda ao tocar.
2. **Reprocessar a preparação dos lembretes** para que o aviso no celular das **17:30** (1 hora antes) passe a existir para você.
3. **Confirmar no registro de envios** que o teste saiu com sucesso e que o aviso das 17:30 ficou agendado.
4. Te avisar o resultado: se o aviso chegou, se ficou agendado o das 17:30 e qualquer falha encontrada.

## Observações

- Nada muda em quem recebe o quê: os e-mails de 16:30 e 17:30 continuam iguais.
- O aviso no celular continua apenas 1 hora antes, além do aviso de vínculo a evento.
- Nada será publicado em produção.

## Detalhes técnicos

- Envio direto via `send-push-notification` (service role) para `user_id b664fc22-69d3-40f1-8370-16b8a07ec402`, `templateName: 'event-reminder'`, path `/cronograma?event=23577bcf-cd00-47f5-9722-a72a8ba5d7d5`.
- Reexecutar `event-reminders?mode=schedule` (via wrapper com `X-Worker-Token`) para gerar a linha `channel='push'`, `offset_minutes=60` em `event_reminder_deliveries`.
- Verificação em `push_send_log` e `event_reminder_deliveries`.
