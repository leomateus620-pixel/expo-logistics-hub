# Corrigir o público dos avisos de evento

## O que aconteceu

O evento "1ª REUNIÃO COMISSÃO CENTRAL FENASOJA 2028" (08/09, 18h30) está ligado a **35 comissões**, entre elas Logística, Hotelaria e Turismo.

Hoje a regra é: comissão ligada ao evento = **todos os membros ativos** daquela comissão recebem o aviso. Resultado: 78 pessoas receberam o lembrete de 24h/2h/1h, incluindo a equipe operacional da Logística, que não era o público da reunião.

Não foi falha de envio nem de permissão — foi a regra de público, que hoje é ampla demais.

## Nova regra (aprovada)

Quando uma comissão é ligada a um evento, o aviso vai apenas para:

1. **Lideranças da comissão** — presidente, copresidente e corresponsável (a "equipe de apoio" fica de fora);
2. **Pessoas relacionadas diretamente ao evento** (responsáveis/participantes lançados no próprio evento);
3. Quem tem a permissão especial de acompanhar todos os eventos (mantida como está).

Quem realmente precisar convocar a comissão inteira marca no evento a opção **"Avisar todos os membros das comissões"**, que fica desligada por padrão.

Nada muda em quem pode ver o evento, nem no funcionamento do e-mail, do push de 1 hora antes ou do aviso de "você foi relacionado a um evento" — muda só quem entra na lista.

## Detalhes técnicos

**Banco**
- Nova coluna `cronograma_eventos.notify_all_commission_members boolean not null default false`.
- Resolução de lideranças a partir de `commission_responsibles` com `active = true`, `user_id` não nulo e `relationship_role in ('principal','copresidente','corresponsavel')`, cruzada com `org_members` ativos da org do evento.

**`supabase/functions/event-reminders/index.ts` (`scheduleReminders`)**
- Substituir a expansão atual `commission_id -> todos os org_members` por:
  - se `notify_all_commission_members = false` (padrão): lideranças das comissões ligadas;
  - se `true`: comportamento atual (todos os membros ativos).
- Manter intactos: responsáveis diretos do evento, capability `cronograma_reminder_all`, offsets 24h/2h/1h por e-mail, push só em 60 min, idempotência e cancelamento por versão do evento.
- Corrigir também o aninhamento atual do bloco de responsáveis diretos, que hoje só roda quando existe comissão ligada.

**Avisos de relacionamento (`event_assignment_notifications`)**
- O gatilho de comissão passa a enfileirar apenas lideranças, com a mesma exceção da flag. O gatilho de responsável direto continua igual.

**Interface (Agenda FENASOJA)**
- No formulário de evento, uma opção simples "Avisar todos os membros das comissões relacionadas", desligada por padrão, visível só para quem já pode editar o evento.

**Higiene do evento atual**
- Cancelar as entregas ainda pendentes desse evento para quem não é liderança nem relacionado, para não repetir o disparo. Nada já enviado é alterado.

**Validação**
- Testes cobrindo: comissão ligada gera só lideranças; flag ligada gera todos; responsável direto sempre recebe; capability global preservada.
- Conferência da contagem de destinatários do evento antes/depois.
- Sem publicação em produção.
