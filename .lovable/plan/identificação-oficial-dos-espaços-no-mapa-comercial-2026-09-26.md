# Identificação oficial dos espaços no Mapa Comercial

## Conferência já realizada

A consulta aos cadastros ativos confirmou que os três espaços do print são da **Exporural**, **Quadra R**, com número oficial salvo separadamente do código técnico:

| Código técnico | Lote oficial | Quadra | Segmento/pavilhão | Identificação exibida |
|---|---|---|---|---|
| Q-R-22 | 22 | R | Exporural | Lote 22 · Quadra R / Exporural |
| Q-R-21 | 21 | R | Exporural | Lote 21 · Quadra R / Exporural |
| Q-R-20 | 20 | R | Exporural | Lote 20 · Quadra R / Exporural |

Cada um possui 500,00 m² de área oficial. A revisão hoje usa o código técnico como título e o carrinho guarda a quadra no campo de contexto; por isso “Segmento / pavilhão” acaba mostrando “R”. O mapa interno atualmente omite números permanentes, enquanto os links públicos usam números baseados em metadados da entidade. Há espaços ativos sem vínculo de segmento no cadastro; não lhes será atribuído um segmento presumido.

## Implementação

1. Criar um resolvedor único de apresentação a partir do lote comercial, entidade vinculada e nome oficial do segmento/pavilhão; usar `lot_number` como número, `block` apenas quando for efetivamente quadra, e o vínculo cadastrado para a área. Conferir associações de pavilhões e casos sem vínculo, sem transformar códigos técnicos em cadastro oficial. Exibir contexto incompleto com discrição quando faltar dado, em vez de inventá-lo.
2. Usar esse resolvedor na seleção do mapa, módulos internos, carrinho, revisão, ficha lateral, tooltips e fichas/listas públicas. Atualizar entradas selecionadas pelo mesmo `lotId` quando o cadastro oficial mudar; preservar IDs e o controle de acesso dos links públicos. Na revisão, manter identificação individual e valor alinhado, com nome completo da área; quando houver áreas distintas, listar os nomes ou “Múltiplas áreas”, sem tomar a quadra do primeiro item como área da venda.
3. Mostrar o número oficial dentro de cada lote visível no mapa interno e público: “Lote 01” quando couber e “01” em polígonos menores. Aproveitar renderização em lote e redução por zoom, com âncora interna validada para polígonos irregulares, contraste adequado, sem captura de cliques nem colisões excessivas; manter quadras e áreas como níveis separados de leitura. O texto ao consultar um lote mostrará lote, quadra/pavilhão e área junto dos dados comerciais já existentes.
4. No detalhe e nas exportações de venda que já existirem, mostrar a identificação atual sem reescrever itens de pedidos concluídos. O item histórico guarda código e área da época, não uma descrição completa da quadra/segmento: distinguir explicitamente esses dados contratados da identificação atual se divergirem; não reconstruir retroativamente um nome antigo não registrado.

## Validação e limites

- Conferir Q-R-20/21/22 ponta a ponta: rótulo, clique, ficha, carrinho e revisão devem apontar ao mesmo `lotId`; entregar a tabela de conferência final.
- Testar seleção/revisão de quadras diferentes e de segmentos diferentes sem concluir venda real, inclusive pavilhões internos e casos sem segmento; conferir lotes pequenos/irregulares em zooms variados, desktop e celular.
- Rodar testes direcionados dos resolvedores, vendas e links públicos; verificar que valores, taxas, parcelas, status, seleção, permissões, IDs e vínculos não mudaram.
- Alterar apenas apresentação e leitura necessária dos vínculos existentes. Não mudar rotas, geometrias, regras financeiras, nem gravar ou publicar vendas.

## Detalhes técnicos

O identificador comercial permanece `commercial_lots.id`, ligado a `map_entities.id` por `entity_id`; a área oficial vem do lote. `map_entities.segment_id` aponta para `map_segments.name/display_name` quando existe; metadados oficiais já associados à entidade podem complementar a apresentação somente quando verificados. `lot_sale_order_items` contém `public_identifier`, `official_area_snapshot` e `item_total`, que permanecem imutáveis. A renderização dos números deve reutilizar a estratégia de atlas/instâncias do mapa, passando número do lote em vez de deduzi-lo do código da entidade. Não há necessidade planejada de migração de dados.
