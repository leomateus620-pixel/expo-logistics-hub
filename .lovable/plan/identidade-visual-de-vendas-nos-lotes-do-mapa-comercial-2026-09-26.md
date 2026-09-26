# Identidade visual de vendas nos lotes do Mapa Comercial

## Resultado esperado
- Na etapa do expositor, permitir anexar uma imagem opcional, mostrar a versão tratada antes da confirmação e reutilizá-la em todos os lotes do mesmo pedido, seja um ou muitos.
- Manter o lote vendido vermelho. Sobre ele, mostrar uma identidade visual pequena e nítida no lugar do cadeado principal; quando a imagem estiver ausente ou não carregar, preservar o cadeado atual.
- A imagem aparecerá no Modo Vendas, mapa normal, interiores, detalhes e links públicos autorizados, sem expor dados de contato ou arquivos de vendas não confirmadas.

## Implementação
1. Adicionar no formulário da venda um campo de imagem opcional com prévia, substituição/remoção e mensagens de erro claras. Aceitar formatos de imagem seguros e impor limites de tamanho e dimensões. Produzir automaticamente uma versão leve para mapa com enquadramento central, margem e fundo visualmente limpo, **sem transformar uma foto de pessoa em um logotipo empresarial inexistente**. Mostrar a versão exata que será exibida antes de confirmar.
2. Criar armazenamento próprio para a imagem tratada, com caminho restrito à organização/pedido e validação de tipo/tamanho; gravar a referência no pedido confirmado, não em cada lote. Autorizar upload/associação apenas a quem pode vender, verificar que o arquivo pertence ao pedido e à organização, e conservar integridade e idempotência da confirmação. Prever descarte de uploads abandonados e remoção da imagem pública quando a venda for revertida, sem apagar histórico.
3. Resolver a imagem a partir do pedido e seus itens vinculados aos lotes; não associá-la por nome do comprador. Propagar apenas a referência publicável de pedidos **confirmados e lotes SOLD** nas leituras administrativas e nas consultas públicas já limitadas por token/escopo. Incluir a alteração na revisão consultada pelos links públicos para refletir mudanças sem recarregar manualmente.
4. Reaproveitar a posição segura do cadeado para desenhar a imagem sem bloquear seleção/toque; carregar texturas por URL compartilhada, usar tamanho limitado pelo polígono e reduzir/ocultar detalhes em zoom distante para evitar poluição em lotes vizinhos. Exibir fallback e manter rótulos oficiais legíveis. Atualizar as vistas relacionadas sem duplicar fontes de dados.
5. Cobrir upload inválido, pedido com um/muitos lotes, repetição idempotente, reversão, ausência/falha da imagem, isolamento entre organizações, escopo público, mudança após navegação/reload e exibição móvel/desktop com testes focados.

## Teste com os anexos
- Usar **a segunda imagem anexada (foto da pessoa)** como imagem de teste; a primeira é referência de tela. Sua autorização para visibilidade pública será respeitada.
- Executar upload, tratamento, persistência e consulta pública reais em **um cenário isolado de teste**, com venda e link públicos próprios, sem registrar uma venda comercial fictícia na base oficial nem alterar pedidos existentes arbitrariamente. Verificar também a exibição final e a persistência após reload em desktop e celular; limpar os dados temporários ao concluir o teste e informar qualquer limite da prévia 3D. Se não for possível criar esse cenário isolado com segurança, parar antes de associar a foto a uma venda real e pedir a identificação explícita do pedido.
- Não publicar produção sem pedido explícito.

## Cuidados técnicos
- O cadastro atual relaciona `lot_sale_orders` a `lot_sale_order_items` e cada item ao lote; o fluxo confirma o conjunto em uma transação por `register_commercial_sale_order`. A apresentação do cadeado é compartilhada por mapa externo/interiores, enquanto os links públicos usam respostas próprias limitadas por escopo. As alterações devem preservar essas fronteiras e os snapshots históricos.
