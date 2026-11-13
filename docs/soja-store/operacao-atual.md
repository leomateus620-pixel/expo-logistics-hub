# Operação atual da Soja Store

A loja usa a mesma organização e os mesmos vínculos da comissão. A autorização distingue administradores da organização e contas ativas vinculadas a pessoas da comissão. A ativação do escopo é explícita. Os formulários recebem dados da operação corrente, e os indicadores consultam esses registros.

## Primeira utilização

1. Em Configurações, cadastre os locais e os pontos de atendimento reais.
2. Cadastre produtos, variantes, preços vigentes e fornecedores. Registre a contagem de abertura por SKU e local, ou confira as unidades por recebimento de compra.
3. Registre em Configurações a referência da aprovação da venda própria e as formas de pagamento. Abra o caixa no ponto escolhido.
4. Confirme pagamento e entrega no balcão ou reserve para atendimento posterior. Pagamentos manuais parciais mantêm a reserva até a entrega. A reserva sem pagamento vence após 24 horas. A aplicação mantém pagamentos confirmados, estoque e caixa vinculados à operação original.
5. Confira compras, vendas, clientes, orçamento e escalas em seus próprios menus. Use os filtros de período e ponto na Visão geral e abra a lista correspondente a cada indicador.

O documento numerado é um comprovante interno. Ele pode ser reaberto para impressão a partir do registro persistido. A emissão fiscal usa o processo externo aprovado pela Fenasoja. O vínculo com o documento externo pode ser registrado na venda.

## Limites operacionais

- A operação cobre venda própria e confirmação manual de dinheiro, PIX e cartão. A conciliação com adquirentes e bancos depende de integração futura.
- As movimentações novas tratam estoque próprio. Custódia de terceiros, cálculo de custo de saída e apropriação contábil dependem da política aprovada. O custo de aquisição de uma compra fica separado do preço de venda. A ausência de custo de saída não vira margem.
- A devolução física usa a venda original e o estorno correspondente. O comprovante interno fica disponível para impressão no navegador. A geração de PDF em segundo plano e o estorno financeiro desacoplado da devolução ainda precisam de fluxo próprio.
- O Financeiro da loja registra compromissos, obrigações e liquidações da Soja Store. A publicação de lançamentos para o Financeiro Fenasoja depende da integração e do fluxo central de aprovação.
- O módulo aproveita a equipe institucional e registra escala e treinamento da loja. As contas sem vínculo ativo continuam o fluxo institucional de acesso.

## Verificação

As migrações aditivas são aplicadas por `query_database` no Lovable. [Acesso e ativação](acesso.md) · [Estoque](banco.md) · [Fornecimento](fornecimento.md) · [Financeiro](financeiro.md) · [Indicadores](indicadores.md) · [Equipe](rotinas.md)

As suítes em `scripts/soja-store` usam PostgreSQL descartável. Exercitam autorização, idempotência, contagem inicial, compras parciais, transferências, saída institucional, concorrência pela última unidade, pagamentos parciais, entrega, devolução, caixa, cotações e os mesmos filtros do dashboard e das listas.
