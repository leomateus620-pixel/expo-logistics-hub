# Planejamento do evento: rascunho preservado, ordem por horário e orçamento

## 1. Não perder edições
- Hoje o construtor de planejamento reinicia o formulário sempre que a Agenda atualiza os dados em segundo plano, e fechar/cancelar descarta tudo.
- Passa a guardar automaticamente um **rascunho local** por evento/subevento (no aparelho), a cada alteração.
- Ao reabrir "Editar planejamento", o rascunho volta com o aviso "Rascunho não salvo restaurado · Descartar".
- Atualizações em segundo plano não sobrescrevem mais o que está sendo digitado.
- Cancelar/fechar com mudanças pede confirmação: "Manter rascunho" ou "Descartar alterações". O rascunho é apagado só ao salvar com sucesso ou descartar.

## 2. Ações programadas ordenadas por horário
- Ao alterar o horário (ao sair do campo), a ação muda automaticamente de posição dentro do mesmo subevento onde foi cadastrada (ex.: 09:00 → 07:30 sobe para o topo).
- Animação curta e destaque na linha movida para o usuário perceber a nova posição.
- Ações sem horário ficam no fim; horários iguais mantêm a ordem relativa.
- A ordem salva (`sort_order`) segue essa ordenação, refletindo na visão do evento e na Timeline.

## 3. Orçamento — Valor e custo do evento
Nova seção em cada subevento, após "Estrutura e providências":

```text
Produto/serviço        | Fornecedor        | Valor (R$)  | [x]
Coffee break           | Padaria X         | 1.200,00
Som e microfone        | Y Sonorização     |   800,00
+ Adicionar item
                                   Total do subevento: R$ 2.000,00
```
- Valor com máscara monetária brasileira; linhas compactas no computador, empilhadas no celular.
- Total por subevento ao vivo e **total geral do planejamento** no topo/rodapé do construtor.
- Na visão do evento (rundown) aparece um quadro "Orçamento" com itens e total; no card da Timeline o resumo ganha "· R$ 2.000,00".

## Detalhes técnicos
- Migração: tabela `cronograma_subevento_orcamento_itens` (org_id, subevento_id FK cascade, item, fornecedor, valor numeric(14,2) ≥ 0, sort_order, timestamps) com GRANTs, RLS espelhando `cronograma_subevento_providencias`.
- Atualizar `cronograma_save_subevent_plan` com novo helper `_cronograma_apply_subevent_budget` (substituição completa por subevento, mesma transação); leitura incluída no select do evento.
- Tipos: `CronogramaSubeventBudgetItem`, `budget[]` no draft; `modelAdapter`, `useCronogramaEventos`, `cronograma-rpc` atualizados.
- `SubeventPlanBuilder`: remover o reset por `useEffect` em refetch (inicializar só quando muda o evento/modo), hook `usePlanDraftStorage` (localStorage com chave org+evento+modo), `AlertDialog` de saída; utilitário puro `sortActionsByTime` com testes (09:00→07:30 sobe; sem horário vai ao fim; empate estável) e `budgetTotal` com teste.
- Estilos em `cronograma-plan-builder.css` com tokens existentes.
