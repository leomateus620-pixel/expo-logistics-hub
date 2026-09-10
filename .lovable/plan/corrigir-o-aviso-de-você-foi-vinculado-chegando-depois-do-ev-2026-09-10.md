# Corrigir o aviso de "você foi vinculado" chegando depois do evento

## O que descobri (confirmado no banco)

- O aviso que você recebeu às 20:55 é da "Reunião do Sistema FENASOJA" (10/09, 13h30). O vínculo dele no banco foi **recriado às 20:55** — horas depois da reunião.
- Motivo: toda vez que alguém **salva/edita** um evento, o sistema apaga todos os vínculos e grava tudo de novo. Para o robô de avisos, isso parece um vínculo novo — mesmo para quem já estava lá desde o começo.
- Segundo problema: o filtro que deveria barrar eventos **concluídos ou cancelados** compara com palavras em inglês ("completed"/"cancelled"), mas o sistema grava em português ("concluido"). Por isso o aviso passou mesmo com a reunião já encerrada.
- Terceiro: só existe filtro por **dia**, não por horário. Um evento das 13h30 ainda "conta como hoje" às 20h55.
- O lembrete de 1 hora antes está funcionando corretamente (o desta reunião saiu às 15h30 UTC, exatamente 1 hora antes). Não vou mexer nele.

## O que será corrigido

1. **Só avisa quem é realmente novo.** Ao salvar um evento, os vínculos que já existiam são preservados em vez de apagados e recriados. Quem já estava no evento não recebe aviso de novo; quem acabou de entrar recebe na hora.
2. **Nada de aviso para evento encerrado.** O filtro passa a reconhecer os status reais em português (concluído, cancelado) além dos antigos.
3. **Nada de aviso depois do horário.** Passa a considerar data + hora de início (fuso de Brasília): se o evento já começou/passou, não gera aviso.
4. **Limpeza da fila.** Avisos pendentes que já se referem a eventos passados ou encerrados são marcados como ignorados, para não dispararem atrasados.

## Resultado esperado

- Vinculou alguém → a pessoa recebe o aviso em até 1 minuto.
- Editou o evento depois (mudou local, horário, descrição) → ninguém recebe aviso repetido.
- Evento já concluído ou já iniciado → nenhum aviso de vínculo.
- Lembrete de 1 hora antes continua igual.

## Detalhes técnicos

- `public._cronograma_apply_event_responsibles` e `_cronograma_apply_event_commissions`: trocar o `DELETE ALL + INSERT` por reconciliação (apagar só os removidos, inserir só os novos, atualizar os existentes por `ON CONFLICT`/update de snapshot). Isso mantém o gatilho `AFTER INSERT` como sinal legítimo de vínculo novo.
- `public.enqueue_event_assignment_notifications`: incluir `'concluido'`, `'cancelado'`, `'completed'`, `'cancelled'` na lista de status bloqueados; substituir a comparação só por `start_date` por um corte com `start_date + COALESCE(start_time,'23:59')` convertido de `America/Sao_Paulo`, retornando quando já passou.
- Migração de saneamento: `UPDATE event_assignment_notifications SET status='skipped', error_message='event_past_or_closed' WHERE status='pending'` para linhas cujo evento já passou/encerrou.
- Sem mudanças em RLS, destinatários, canais ou no fluxo de `event-reminders`. Testes: unitário da regra de corte por data/hora e verificação de que reeditar um evento não gera novas linhas pendentes.
- Sem publicar em produção.
