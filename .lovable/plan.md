# Simplificar conflitos e liberar a edição de eventos (Restaurante e Arena)

## Problema

Hoje o cadastro/edição de evento acusa "conflitos" que não são conflitos reais:
tipo de evento não permitido no espaço, horário fora da faixa padrão, montagem/
desmontagem insuficiente e capacidade excedida. Além disso, quando aparece
qualquer um desses avisos o sistema exige ligar "Registrar exceção autorizada"
com justificativa — o que trava a edição de eventos já aprovados/confirmados.

## O que muda

1. **Alerta somente para sobreposição real de horário**
   - Permanece o aviso quando o período do evento (incluindo montagem e
     desmontagem) se sobrepõe a outro evento no mesmo espaço.
   - Permanece também o aviso de bloqueio de espaço registrado manualmente
     (indisponibilidade cadastrada em uma data/hora), por ser igualmente
     temporal.
   - Saem completamente: tipo de evento não permitido, horário fora da operação
     padrão, montagem/desmontagem insuficiente e capacidade excedida.

2. **Fim da "exceção autorizada" na tela do evento**
   - O bloco com o botão "Registrar exceção autorizada" e o campo de
     justificativa saem do formulário.
   - Salvar deixa de exigir justificativa de alteração em eventos aprovados/
     confirmados/em análise.
   - O aviso de sobreposição vira **informativo**: mostra o alerta, mas não
     impede salvar. Nenhuma edição fica travada.

3. **Histórico automático**
   - Toda criação/edição continua indo sozinha para o histórico imutável do
     evento (auditoria já existente), agora incluindo o registro de que a
     alteração foi salva com sobreposição de horário, quando for o caso — sem
     depender de o usuário preencher nada.

## Detalhes técnicos

- `venue_check_availability` (banco): manter apenas os ramos `event` e `block`;
  remover os ramos `capacity` e `policy` (tipo, montagem, desmontagem, horário
  padrão).
- `venue_save_event` (banco):
  - remover a exigência `VENUE_MATERIAL_CHANGE_REASON_REQUIRED`;
  - remover a exigência/validação de `conflict_override` e a exceção
    `VENUE_CONFLICT_OVERRIDE_NOT_AUTHORIZED`;
  - deixar de lançar `VENUE_CONFLICT` ao salvar evento aprovado/confirmado com
    sobreposição — apenas gravar `conflict_status` (`livre` / `conflito`) e
    devolver a lista de conflitos para exibição;
  - registrar na auditoria (`venue_action`) quando o salvamento ocorreu com
    sobreposição detectada.
  - Colunas `conflict_override*` permanecem na tabela (dados históricos
    preservados), apenas deixam de ser exigidas.
- `src/lib/venue-operations.ts`: em `findLocalAvailabilityConflicts`, remover os
  blocos de capacidade e de política; manter alocações e bloqueios. Remover
  `conflictOverride`/`conflictOverrideReason`/`changeReason` da validação do
  schema e do payload enviado ao banco (mantendo compatibilidade de tipos).
- `src/components/venue-events/VenueEventFormDialog.tsx`: remover o cartão de
  exceção autorizada e o campo de justificativa de alteração; o painel de
  disponibilidade passa a exibir apenas "Sem sobreposição" ou "N sobreposição(ões)
  de horário" e nunca bloqueia o envio.
- `src/hooks/useVenueOperations.ts`: sem mudança de contrato; apenas deixa de
  propagar erro de conflito/justificativa.
- Textos em pt-BR, caixa alta preservada onde já se aplica.

## Testes e validação

- Testes de unidade para `findLocalAvailabilityConflicts`: sobreposição de
  evento gera 1 conflito; tipo fora do catálogo, horário fora da faixa padrão,
  montagem curta e público acima da capacidade **não** geram conflito.
- Verificação no banco: consultar `venue_check_availability` para um evento
  fora da faixa padrão e confirmar retorno vazio.
- Teste no navegador (390px e desktop): editar um evento existente sem
  preencher justificativa e confirmar que salva, e que a alteração aparece no
  histórico do evento.
- Sem publicação em produção.
