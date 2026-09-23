# Melhorias do Modo Vendas, parcelas e histórico comercial

## Resultado esperado

- Lote com venda confirmada aparece em **vermelho predominante** no mapa, mini mapas, legendas e fichas.
- Lote bloqueado deixa de usar vermelho e passa a ter tratamento neutro/grafite, claramente distinto de vendido e indisponível.
- O cadastro da venda ganha superfície sólida, contraste e navegação legível em desktop e celular, preservando o fluxo Expositor → Pagamento → Revisão.
- Uma venda pode ter até **36 vencimentos**, com inclusão, edição e remoção individual de datas antes da confirmação.
- A aba **Histórico** do próprio lote/módulo mostra o resumo da venda e o cronograma completo das parcelas.
- As duas vendas de teste identificadas são removidas de forma transacional e seus 12 lotes voltam ao estado anterior `AVAILABLE`.

## Estado confirmado antes da mudança

- A configuração compartilhada usa roxo para `SOLD` e vermelho para `BLOCKED`; mapa principal, módulos internos, mini mapas, legendas e fichas consomem essa mesma configuração.
- O checkout já persiste pedido, itens e parcelas em `lot_sale_orders`, `lot_sale_order_items` e `lot_sale_installments`; hoje a interface gera datas mensais automaticamente e não permite editar cada vencimento.
- A ficha externa possui aba Histórico, mas mostra apenas eventos resumidos. O card de módulo interno ainda não apresenta o detalhamento da venda e das parcelas.
- Foram localizadas exatamente duas vendas de teste em 23/09/2026:
  - pedido `a4b93222-9c05-4220-91d5-82db504f6d47`: Q-D-09 a Q-D-12, 4 lotes, 930,01 m², R$ 45.725,91;
  - pedido `9f617f2a-3346-4f59-9db8-6c30237b16e4`: Q-D-01 a Q-D-08, 8 lotes, 1.669,32 m², R$ 75.513,98.
- Os 12 lotes estavam `AVAILABLE` antes da venda, estão `SOLD`, possuem 12 vendas confirmadas, 2 registros de vencimento, 12 eventos de venda e não possuem reservas convertidas nem negociações ganhas por essas operações.

## 1. Cores comerciais centralizadas

- Alterar somente a configuração central de situações comerciais:
  - `SOLD`: vermelho forte, com superfície e borda vermelhas acessíveis;
  - `BLOCKED`: grafite/neutro, sem associação visual com venda;
  - manter as demais situações semanticamente distintas.
- Confirmar a propagação no parque, pavilhões, módulos regulares/irregulares, Dashboard/mini mapas, filtros, legendas, ficha e links públicos.
- Preservar a cor temporária de seleção no carrinho; após a confirmação e atualização da consulta, o mesmo polígono passa ao vermelho de vendido sem mudar geometria ou posição.

## 2. Checkout mais legível e navegável

- Manter a estrutura existente, sem reconstrução: corrigir o diálogo para superfície sólida, tipografia com contraste, campos claramente delimitados e hierarquia consistente.
- Organizar o progresso das três etapas, listas e totais; limitar o scroll ao conteúdo e manter título/ações acessíveis, especialmente na revisão longa.
- Garantir rodapé de ações visível, áreas de toque adequadas, safe area e ausência de transparência/overflow nos tamanhos dos anexos, em desktop e celular.
- Continuar preservando formulário e seleção em caso de erro e bloqueando duplo envio.

## 3. Até 36 vencimentos editáveis

- No passo Pagamento, manter “À vista” para um vencimento e permitir “Parcelado” com até 36 linhas.
- Adicionar o comando **Adicionar vencimento**; cada linha terá número, data editável, valor calculado e opção de remover. A primeira linha não pode ser removida.
- Ao adicionar, sugerir o próximo mês respeitando o último dia válido; permitir que o usuário ajuste qualquer data.
- Recalcular os valores em centavos, deixando eventual diferença somente na última parcela e garantindo soma exata ao total.
- Validar datas preenchidas, máximo de 36, numeração contínua e soma antes de avançar e novamente no servidor.
- Reutilizar a estrutura existente do banco: cada data/valor continuará sendo gravada em `lot_sale_installments`; `installment_count` e `first_due_date` refletirão a lista final. Não será criada tabela paralela.

## 4. Venda e parcelas no histórico do lote

- Criar uma consulta autorizada e reutilizável por `lot.id`, lendo o item vendido, pedido, venda e parcelas existentes.
- Exibir no Histórico um resumo coerente com a etapa Revisão: expositor, etapa, forma de pagamento, data da venda, vendedor, área e valor daquele lote, valor total do pedido e quantidade de espaços.
- Abaixo, mostrar o cronograma das parcelas com número, vencimento, valor e situação de pagamento; ausência de valor não será apresentada como zero.
- Usar o mesmo bloco tanto na ficha lateral de lote externo quanto no card de módulo interno de pavilhão, sem expor documento, telefone ou e-mail em links públicos.
- Invalidar essa consulta junto com o mapa após venda confirmada para que o histórico apareça sem recarregar a página.

## 5. Exclusão segura das duas vendas de teste

Executar uma operação de dados transacional, restrita aos dois IDs confirmados acima:

1. bloquear e validar pedidos, itens, vendas e lotes;
2. exigir correspondência exata dos 12 identificadores, totais, estado atual `SOLD` e estado original `AVAILABLE`;
3. remover somente parcelas, itens, vendas e pedidos dessas duas operações;
4. remover os eventos de venda correspondentes, correlacionados pelos IDs dos pedidos/lotes;
5. restaurar os 12 lotes ao estado original `AVAILABLE`;
6. abortar tudo se qualquer vínculo inesperado, contrato ou alteração posterior tornar a reversão insegura;
7. reler o banco para comprovar ausência dos dois pedidos e retorno dos lotes, sem tocar em preços, áreas, geometrias, IDs ou demais vendas.

A exclusão é uma correção de dados, não uma alteração estrutural: será feita pela operação apropriada de dados, sem editar migrações históricas.

## 6. Arquivos e pontos técnicos

- Cores: `constants.ts` e testes que validam a configuração compartilhada/renderização por situação.
- Checkout: `SalesCheckoutDialog.tsx`, `SalesBuyerForm.tsx`, `SalesPaymentForm.tsx`, `SalesReview.tsx`, `sales-mode.css`.
- Parcelas: `salesTypes.ts`, `salesInstallments.ts`, `salesService.ts`; preservar a assinatura atual da RPC se ela já suporta a lista final, como confirmado.
- Histórico: serviço/hook comercial de leitura e bloco reutilizável nas fichas `MapPanels.tsx` e `PavilionModuleCard.tsx`.
- Banco: sem mudança de tabela prevista; somente exclusão transacional dos dois testes. Se a implementação revelar necessidade estrutural real, ela será feita por nova migração com RLS e permissões preservadas.

## 7. Testes e validação

- Cores: vendido vermelho e bloqueado não vermelho em lote externo, módulo interno, mini mapa, legenda e link público.
- Parcelas: 1, 2 e 36 vencimentos; adicionar/remover; datas editadas; fim de mês; limite; soma exata com diferença de centavos; payload e persistência iguais à revisão.
- Checkout: legibilidade, navegação, revisão longa, scroll, botão confirmar e preservação após falha.
- Histórico: venda simples e múltipla, resumo por lote, todos os vencimentos/status, fallback sem venda e atualização após confirmação.
- Exclusão: conferir antes/depois os dois pedidos, 12 itens/vendas/eventos, 2 parcelas e os 12 lotes restaurados; nenhuma outra venda ou lote alterado.
- Regressão: seleção múltipla, módulos irregulares, venda atômica/idempotente, Dashboard e atualização automática do mapa.
- Verificação final com testes focados e suíte aplicável, tipos, lint e build; revisão visual em desktop e mobile quando o renderizador permitir.

## Limites

- Não publicar.
- Não alterar preços, áreas oficiais, geometrias, identificadores, contratos ou outras vendas.
- As imagens anexadas são referência visual e não serão incorporadas ao aplicativo.
