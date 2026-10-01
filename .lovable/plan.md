# Corrigir a numeração dos boxes 100–104 do Pavilhão 13

## Resultado
- Os cinco boxes devem aparecer como 100, 101, 102, 103 e 104 na planta interna, na ficha, no modo Vendas e no link público, sem alterar áreas, valores, posições, estados ou vendas.

## Etapas
1. Corrigir diretamente os cinco cadastros atuais, sem abrir permissão de edição para usuários nem contornar restrições de segurança. A limitação encontrada anteriormente foi da ferramenta de escrita, não uma regra de acesso dos visitantes do mapa; seguir o fluxo autorizado da ferramenta e, se ele continuar indisponível, interromper a alteração e informar o bloqueio.
2. Atualizar apenas o nome e número exibido de cada entidade e lote, identificando cada par pelo código oficial B5-M100–104 e conferindo também a chave e o número do módulo persistidos. Aplicar a correção apenas quando os campos ainda estiverem indevidamente como “10”, de forma segura para repetição.
3. Confirmar no banco que existem exatamente cinco correções e que B5-M099 e os demais pavilhões não mudaram. Conferir que IDs, áreas, preços, status, vínculos e históricos permanecem iguais.
4. Verificar os consumidores da numeração no mapa, ficha e link público; rodar os testes focados. Fazer conferência visual se o mapa 3D carregar no navegador. Não criar venda de teste nem publicar.

## Detalhes técnicos
- O cadastro atual foi consultado: B5-M100–104 têm `moduleNumber` e chave técnica corretos, mas `map_entities.name`, `metadata.lotNumber`, `commercial_lots.lot_number` e `display_name` estão gravados como “10”. Os campos textuais não têm limite de comprimento; a migração antiga empregou `lpad(n::text, 2, '0')`, que truncou esses cinco números.
- Trata-se de correção **de dados existentes**, portanto usar a ferramenta autorizada de atualização de dados, não migração de esquema nem mudança de RLS. A operação deve ser transacional e restrita aos cinco pares válidos, com contagem verificada antes de gravar.