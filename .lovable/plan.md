# Subeventos com os mesmos seletores do evento principal

Hoje o construtor de subeventos usa um campo de texto livre "Responsável" e um `<select>` nativo "Comissão ou assessoria" alimentado por uma lista estática (`cronogramaCommissionOptions`), que não reflete as comissões e assessorias oficiais atuais. O cadastro do evento principal usa o seletor relacional oficial (busca, agrupamento Comissões/Assessorias, responsáveis institucionais, avatares, marcação de principal/convidado).

Objetivo: o subevento passa a usar exatamente os mesmos seletores do evento principal.

## O que muda

1. **Fonte única de opções**
   Extrair a construção das listas de opções que hoje vive dentro de `EventForm` (comissões oficiais a partir das unidades organizacionais e responsáveis a partir de membros do sistema + responsáveis institucionais) para um hook reutilizável `useCronogramaRelationOptions`. `EventForm` passa a consumir esse hook sem mudança de comportamento nem de persistência.

2. **Construtor de subeventos**
   Em `SubeventPlanBuilder`, os dois campos atuais de cada subevento são substituídos por dois `RelationalMultiSelect` idênticos aos do evento:
   - "Comissão ou assessoria responsável" (múltipla, com principal)
   - "Responsáveis do subevento" (múltipla, com principal e opção de tornar convidado)

3. **Persistência**
   Cada item do plano passa a carregar `commissions[]` e `responsibles[]`, enviados no payload de `cronograma_save_subevent_plan` (a RPC e os tipos já aceitam esses vínculos). Os campos legados `commission_slug` e `responsible_name` continuam preenchidos a partir do vínculo principal, para manter compatibilidade com listas, timeline e rundown existentes.

4. **Leitura**
   Ao editar um subevento já salvo, os seletores carregam os vínculos relacionais existentes; quando o subevento antigo só tiver os campos legados, eles são convertidos em uma seleção inicial equivalente.

## Fora do escopo

As linhas internas de "Ações previstas" e "Providências" continuam com o campo de responsável em texto curto — a mudança se aplica ao bloco de dados do subevento, como pedido.

## Detalhes técnicos

- Novo `src/components/cronograma-eventos/useCronogramaRelationOptions.ts` com as memos hoje embutidas em `EventForm.tsx` (`commissionOptions`, `responsibleOptions`, estados de carregamento/erro).
- `CronogramaSubeventPlanDraft` (em `types.ts`) ganha `commissionsRel` e `responsiblesRel`, reaproveitando os mesmos helpers de conversão usados no evento (`commissionLinksToSelections`, `selectionsToCommissionLinks`, equivalentes de responsáveis).
- `CronogramaEventosPage.handleSaveSubeventPlan` passa `commissions` e `responsibles` no payload e deriva `commission_slug` / `responsible_name` do vínculo principal.
- Estilos: reutilizar as classes já existentes do seletor relacional dentro de `cronograma-plan-builder.css`, garantindo largura total e bom comportamento em mobile.
- Validação: criar subevento novo com múltiplas comissões e responsáveis, reabrir para edição, conferir timeline e rundown, desktop e mobile.
