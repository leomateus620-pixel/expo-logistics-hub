# Comprador no tooltip de lotes vendidos

## Resultado esperado

- Em áreas autenticadas, o tooltip contextual passa a seguir a hierarquia **Lote/Quadra → Metragem → Status → Comprador**.
- O comprador aparece somente quando o lote estiver `SOLD` e houver nome válido; nos demais casos, o tooltip permanece como está e nenhuma linha vazia é criada.
- Desktop mantém o hover. Em celular/tablet, o toque que já seleciona o lote mantém a legenda contextual visível com a mesma informação.
- Links públicos autorizados por token também passam a exibir o nome do comprador de lotes `SOLD`; documento, telefone, e-mail, contrato, vendedor e demais dados da venda continuam privados.

## Implementação

1. **Centralizar a apresentação do lote**
   - Criar um pequeno resolver puro para o conteúdo do tooltip, recebendo o `CommercialLot` já carregado.
   - Aplicar a regra única `status === 'SOLD' && currentBuyer.trim() !== ''` para produzir a linha “Comprador: …”.
   - Não criar coluna, campo duplicado, consulta paralela ou nova persistência.

2. **Usar a fonte comercial canônica já existente**
   - Manter `lot_sales.buyer_name` como origem: a função de venda grava esse valor e marca `commercial_lots.status = 'SOLD'` na mesma transação.
   - Reutilizar o mapeamento atual que lê a venda `CONFIRMED` e entrega o nome como `CommercialLot.currentBuyer`.
   - Preservar a invalidação existente de todas as consultas `commercial-map` após a venda, para que vermelho, cadeado, status e comprador sejam atualizados juntos sem recarregar a página.

3. **Liberar somente o nome no link público autorizado**
   - Criar uma migração idempotente que atualize as funções públicas `public_map_inventory`, `public_map_lot` e `public_map_scope_revision`, preservando assinatura, `SECURITY DEFINER`, `search_path` fixo, validação do token opaco e isolamento pelo escopo do link.
   - Nas duas funções de leitura, associar apenas a venda `CONFIRMED` do lote e retornar exclusivamente `buyerName` quando o lote estiver `SOLD`; nenhum outro campo de `lot_sales` será exposto.
   - Incluir a venda confirmada na revisão do escopo para que uma nova venda ou reversão invalide o inventário público e apareça no ciclo de atualização já existente, em até 30 segundos.
   - Ampliar a allowlist `PublicLot` com `buyerName: string | null` e repassá-lo ao canvas como `currentBuyer`; manter todas as demais informações comerciais internas nulas.
   - Exibir o comprador também na ficha pública do lote vendido, sem torná-lo critério de busca ou mostrar qualquer dado de contato.

4. **Refinar o tooltip compartilhado**
   - Atualizar o `EntityLabel` único do mapa para renderizar a linha de comprador abaixo do status.
   - Dar destaque discreto ao nome, permitir quebra controlada para nomes longos e manter o lote como informação principal.
   - Ajustar largura e espaçamento responsivos sem aumentar desnecessariamente os tooltips de lotes não vendidos.
   - Preservar o posicionamento existente, que ancora a legenda ao lote e limita suas coordenadas às bordas visíveis.

5. **Preservar contextos e privacidade**
   - A alteração valerá automaticamente no Modo Vendas e na visualização administrativa, pois ambos usam o mesmo canvas e o mesmo `EntityLabel`.
   - No acesso público, liberar apenas o nome do comprador de lotes efetivamente vendidos e dentro do escopo autorizado pelo token.
   - Manter inalterados seleção múltipla, painel do lote, preços, contratos, status, geometrias, superfície vermelha e cadeado.

## Validação

- Testes do resolver para:
  - `SOLD` com comprador mostra o nome;
  - `SOLD` sem comprador omite a linha;
  - qualquer status diferente de `SOLD` omite o comprador, mesmo se houver vínculo comercial;
  - espaços em branco não geram conteúdo vazio.
- Teste de integração da apresentação confirmando a ordem identificação, área, status e comprador.
- Testes das funções públicas confirmando comprador somente para `SOLD` com venda `CONFIRMED`, sempre limitado ao escopo do token.
- Regressões públicas garantindo ausência de documento, telefone, e-mail, contrato, vendedor e notas no payload.
- Teste de atualização pública confirmando que venda e reversão alteram a revisão do escopo e atualizam comprador/status sem recarregar a página.
- Validar a atualização `AVAILABLE → SOLD` após a invalidação da consulta, mantendo seleção e legenda ativa.
- Conferir desktop e viewport móvel: hover no desktop, toque/seleção no mobile, nomes longos sem clipping e no máximo as legendas contextuais já previstas.
- Executar testes focais, verificação de tipos e conferir o build automático da prévia.

## Fora do escopo

- Nenhuma alteração na função de venda, permissões, URLs públicas ou publicação em produção. A única alteração no banco será a projeção pública mínima e auditável do nome do comprador.
