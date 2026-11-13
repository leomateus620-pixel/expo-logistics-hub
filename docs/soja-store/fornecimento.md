# Fornecimento e cotações

A ficha de produto mostra fornecedores vinculados, código usado pelo fornecedor, referência e situação. O vínculo é identificado por produto e fornecedor dentro da comissão. Alterações e arquivamento usam a versão esperada e preservam trilha. A listagem exige `catalog.view` e `suppliers.view`. A gravação exige `catalog.manage` e `suppliers.view`.

Na área Compras, a equipe registra uma necessidade com descrição, unidade e quantidade. Cada proposta registra fornecedor, versão ou referência, validade, valor dos itens, frete, prazo, lote mínimo e condição de pagamento. O servidor calcula o total em centavos. A comparação ordena por total e prazo, destaca o lote mínimo e a validade e mantém as propostas anteriores. A seleção exige decisão registrada e recusa cotação vencida, fornecedor arquivado e quantidade abaixo do lote mínimo. O módulo aceita até 30 propostas por necessidade. A consulta exige `purchases.view` e `purchases.costs`, e as ações de registro exigem `purchases.manage`.

Após criar um pedido, a equipe pode vinculá-lo ao processo. O banco exige fornecedor e escopo compatíveis, pedido emitido dentro da validade informada e referência da decisão. O mesmo pedido só pode ser vinculado a uma necessidade. O vínculo é documental e mantém o valor, as linhas e os recebimentos do pedido na origem canônica de Compras. Alçadas por valor, exigência configurável de quantidade de cotações, comparação linha a linha e aprovação por usuário distinto seguem pendentes.

`node scripts/soja-store/sourcing-qa.mjs` usa o PostgreSQL descartável descrito na [base de dados](./banco.md). A verificação cobre vínculo de fornecedor, arquivamento, escopo, cotação imutável, valor com frete, lote mínimo, versão e vínculo documental do pedido.
