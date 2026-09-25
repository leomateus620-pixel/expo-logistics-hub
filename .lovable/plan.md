# Comprador no tooltip de lotes vendidos

## Resultado esperado

- Em áreas autenticadas, o tooltip contextual passa a seguir a hierarquia **Lote/Quadra → Metragem → Status → Comprador**.
- O comprador aparece somente quando o lote estiver `SOLD` e houver nome válido; nos demais casos, o tooltip permanece como está e nenhuma linha vazia é criada.
- Desktop mantém o hover. Em celular/tablet, o toque que já seleciona o lote mantém a legenda contextual visível com a mesma informação.
- Links públicos continuam sem nome de comprador: a allowlist pública atual não autoriza esse dado e já o converte explicitamente para `currentBuyer: null`.

## Implementação

1. **Centralizar a apresentação do lote**
   - Criar um pequeno resolver puro para o conteúdo do tooltip, recebendo o `CommercialLot` já carregado.
   - Aplicar a regra única `status === 'SOLD' && currentBuyer.trim() !== ''` para produzir a linha “Comprador: …”.
   - Não criar coluna, campo duplicado, consulta paralela ou nova persistência.

2. **Usar a fonte comercial canônica já existente**
   - Manter `lot_sales.buyer_name` como origem: a função de venda grava esse valor e marca `commercial_lots.status = 'SOLD'` na mesma transação.
   - Reutilizar o mapeamento atual que lê a venda `CONFIRMED` e entrega o nome como `CommercialLot.currentBuyer`.
   - Preservar a invalidação existente de todas as consultas `commercial-map` após a venda, para que vermelho, cadeado, status e comprador sejam atualizados juntos sem recarregar a página.

3. **Refinar o tooltip compartilhado**
   - Atualizar o `EntityLabel` único do mapa para renderizar a linha de comprador abaixo do status.
   - Dar destaque discreto ao nome, permitir quebra controlada para nomes longos e manter o lote como informação principal.
   - Ajustar largura e espaçamento responsivos sem aumentar desnecessariamente os tooltips de lotes não vendidos.
   - Preservar o posicionamento existente, que ancora a legenda ao lote e limita suas coordenadas às bordas visíveis.

4. **Preservar contextos e privacidade**
   - A alteração valerá automaticamente no Modo Vendas e na visualização administrativa, pois ambos usam o mesmo canvas e o mesmo `EntityLabel`.
   - Não incluir comprador nos tipos, RPCs, inventário, lista, ficha ou canvas públicos.
   - Manter inalterados seleção múltipla, painel do lote, preços, contratos, status, geometrias, superfície vermelha e cadeado.

## Validação

- Testes do resolver para:
  - `SOLD` com comprador mostra o nome;
  - `SOLD` sem comprador omite a linha;
  - qualquer status diferente de `SOLD` omite o comprador, mesmo se houver vínculo comercial;
  - espaços em branco não geram conteúdo vazio.
- Teste de integração da apresentação confirmando a ordem identificação, área, status e comprador.
- Regressão pública confirmando que `currentBuyer` continua nulo e não aparece no payload público.
- Validar a atualização `AVAILABLE → SOLD` após a invalidação da consulta, mantendo seleção e legenda ativa.
- Conferir desktop e viewport móvel: hover no desktop, toque/seleção no mobile, nomes longos sem clipping e no máximo as legendas contextuais já previstas.
- Executar testes focais, verificação de tipos e conferir o build automático da prévia.

## Fora do escopo

- Nenhuma alteração no banco, função de venda, permissões, URLs públicas ou publicação em produção.
