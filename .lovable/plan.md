# Validar e testar os avisos no celular para a reunião de hoje (18:30)

## O que eu verifiquei agora (fatos confirmados)

1. **O evento existe e está apto**: "1ª REUNIÃO COMISSÃO CENTRAL FENASOJA 2028", hoje 08/09 às 18:30, Auditório Central, com data exata e dezenas de responsáveis vinculados.
2. **Nenhum lembrete foi gerado para esse evento** — a tabela de entregas não tem nenhuma linha dele. O último lembrete criado no sistema foi em **22/07**.
3. **Causa confirmada**: a tarefa automática que chama os lembretes está recebendo **"não autorizado" (erro 401)** a cada execução. A chamada agendada envia apenas a chave pública, mas a função de lembretes exige autenticação. Ou seja: o robô roda, bate na porta e é barrado — desde então nenhum e-mail nem aviso de lembrete sai.
4. **Nenhum celular está cadastrado** para receber avisos (zero aparelhos ativos). Mesmo com o item 3 corrigido, sem um aparelho autorizado não há para quem enviar o aviso.

## O que farei

### 1. Destravar o disparo automático
Corrigir a autenticação das duas tarefas agendadas (a que prepara os lembretes a cada 5 minutos e a que envia a cada minuto), para que voltem a responder com sucesso. Confirmar pelo registro de respostas que o 401 sumiu e virou 200.

### 2. Cadastrar seu aparelho
Você precisa abrir o sistema **em uma aba própria do navegador no celular** (dentro da pré-visualização o navegador bloqueia o pedido) e aceitar o convite "Quer receber os lembretes no celular?" — ou ativar em **Configurações → Avisos no celular**. Sem isso o teste não tem destinatário. Eu confirmo pelo banco assim que o aparelho aparecer.

### 3. Teste dirigido com o evento de hoje
- Disparar manualmente a preparação dos lembretes e conferir que as entregas de **2h (16:30)** e **1h (17:30)** foram criadas para os destinatários de sempre, com o canal "celular" para quem tiver aparelho ativo.
- Enviar um **aviso de teste imediato** para o seu aparelho, com o mesmo formato real (logo Fenasoja, título da reunião, horário, local) e checar que ao tocar abre o evento na Agenda.
- Acompanhar o disparo real das 16:30 e confirmar no registro de envios (sucesso, aparelho, tipo do lembrete).

### 4. Relatório
Resumo curto: lembretes criados, avisos entregues, e-mails enfileirados e qualquer falha encontrada.

## Observações

- As regras de quem recebe **não mudam** — os mesmos destinatários do e-mail.
- A chave que você pediu para manter continua como está; nada será revogado.
- Nada será publicado em produção sem seu pedido.

## Detalhes técnicos

- Root cause: `cron.job` ids 2 e 3 chamam `event-reminders?mode=schedule|send` com header `apikey` publishable, sem `Authorization`; `supabase/config.toml` define `verify_jwt = true` para essa função. `net._http_response` mostra `{"error":"unauthorized"}` 401 recorrente. Correção: recriar os jobs com header `Authorization: Bearer <publishable/anon>` (mantendo `verify_jwt`), validando com `cron.job_run_details` + `net._http_response`.
- Push: `push_devices` está vazio; `scheduleReminders` só cria canal `push` para `user_id` com device ativo, então o cadastro do aparelho é pré-requisito do teste.
- Teste manual: invocar `event-reminders?mode=schedule`, depois `mode=send`, e um envio direto via `send-push-notification` para o `user_id` do teste; conferir `event_reminder_deliveries` e `push_send_log`.
