# Seleção visual sistêmica de módulos irregulares + B1-M141 oficial

## Objetivo
Unificar a regra visual de seleção dos módulos regulares e irregulares no modo Vendas e atualizar canonicamente o B1-M141 para 18,00 m², sem exceções por lote, sem substituir footprints especiais por retângulos e sem alterar identidades ou estado comercial.

## Diagnóstico confirmado
- Em `CommercialPavilionModuleLayer`, o caminho regular já considera o carrinho por `moduleState.lotId` + `salesSelectedLotIds`; o caminho irregular considera apenas `selectedModuleId`. Como o clique de Vendas é consumido antes da seleção pontual, o lote entra no carrinho, mas o footprint irregular não recebe o destaque.
- O banco confirma B1-M141 como o mesmo lote/entidade ativo e disponível, hoje com `official_area_sqm = 19,35`, preço de Renovação de R$ 776,00/m² e total derivado de R$ 15.015,60. O Pavilhão 1 contém 189 lotes e soma 587,85 m².
- A view comercial calcula os totais diretamente por `official_area_sqm × price_per_sqm`; ao corrigir a área para 18,00 m², o total de Renovação passa automaticamente a R$ 13.968,00, sem hardcode e sem alterar o preço/m².
- A geometria atual do B1-M141 é um L de `4,70 × 4,50 − 1,20 × 1,50`; a atualização solicitada exige `4,50 × 4,50 − 1,50 × 1,50 = 18,00 m²`.
- Ficha, Vendas e rota pública já consomem as entidades/lotes e a precificação compartilhados; a revisão pública inclui área, preço, entidade e geometria, permitindo propagação automática.

## 1. Regra única de interação visual
- Em `src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx`, criar uma função pura exportável `resolveModuleInteractionState` que receba `cellId`, `moduleState`, seleção pontual, hover e `salesSelectedLotIds`.
- A função retornará:
  - `inCart = Boolean(moduleState?.lotId && salesSelectedLotIds.has(moduleState.lotId))`;
  - `isSelected = inCart || cellId === activeSelectedId`;
  - `isHovered = !isSelected && cellId === activeHoveredId`.
- Usar exatamente essa função nos dois caminhos: `InstancedMesh` regular e `projectedIrregularModules`/`IrregularModuleMesh`.
- Manter a prioridade visual `SELECTED > HOVER > STATUS NORMAL`, com `SELECTED_COLOR`, contraste e `borderColor` já compartilhados.
- Em plantas `flatModules`, manter escala/altura constantes; o destaque será somente por cor, borda e contraste. Fora delas, preservar o comportamento de altura existente, inclusive a precedência visual do carrinho.
- Não criar materiais por frame, outlines por módulo, estado React individual, overlays DOM, textos individuais ou render loop contínuo. Os módulos regulares continuam instanciados; cada irregular mantém sua geometria memoizada e atualiza apenas quando suas entradas visuais mudarem.

## 2. Atualização canônica do B1-M141
- Em `src/features/commercial-map/data/pavilion1CommercialReference.ts`:
  - manter o ID visual `B1:module:141`, posição no conjunto, orientação, câmera e navegação;
  - ajustar o run/bounds para o envelope oficial de 4,50 × 4,50 m;
  - alterar `MODULE_141_SHAPE` para o L métrico `4,50 × 4,50 − 1,50 × 1,50`;
  - atualizar `footprint`, as duas `renderParts`, `labelAnchor` e bounds coerentes, preservando hit-test poligonal;
  - atualizar `modularAreaM2` de 587,85 para 586,50 m².
- Em `src/features/commercial-map/data/pavilionModuleOfficialAreas.ts`:
  - alterar somente B1-M141 de 19,35 para 18,00 m²;
  - registrar o método `4,50 × 4,50 − 1,50 × 1,50`;
  - alterar o total esperado do B1 para 586,50 m² e avançar a revisão da fonte de áreas, sem inventar um novo nome de documento não fornecido.
- Em `src/features/commercial-map/data/officialReference2026.ts`, avançar apenas a revisão estrutural do B1 usada pela entidade derivada, mantendo B1, P1, segmento, fonte documental existente, orientação e todos os demais módulos.
- Atualizar somente as expectativas derivadas do B1 nos testes de planta, projeção, legenda e inventário geral; o total agregado dos 1.315 módulos passa de 4.099,35 para 4.098,00 m².

## 3. Migração protegida e idempotente
Aplicar uma nova migration exclusiva para B1-M141 pelo fluxo oficial do backend:

1. Adquirir lock transacional próprio da revisão.
2. Exigir exatamente um Pavilhão B1 ativo, 189 módulos B1 ativos e um único par entidade/lote B1-M141.
3. Guardar os IDs e snapshots de status, preços, reservas, negociações, vendas, contratos/versões, histórico e lineage.
4. Atualizar apenas:
   - `commercial_lots.official_area_sqm` para 18,00 e manter `area_validation_status = VALIDATED`;
   - metadata documental/estrutural do mesmo B1-M141 e o total modular do pai B1;
   - geometria atual do mesmo B1-M141, incrementando sua versão; o trigger normal arquiva a geometria anterior.
5. Não inserir/recriar lote ou entidade e não alterar `lot_prices`, status, compradores, reservas, negociações, vendas, contratos, histórico ou lineage.
6. Validar no fim: mesmos IDs, 189 módulos, soma B1 = 586,50, B1-M141 = 18,00, geometria L válida e contida no B1, sem sobreposição, e snapshots comerciais intactos.
7. Tornar a reexecução segura: se a revisão final já estiver aplicada, nenhuma nova versão geométrica nem nova alteração será produzida.

## 4. Testes automatizados
### Seleção compartilhada
- Testar diretamente `resolveModuleInteractionState` com estados representativos de B6-M036, B4-M090, B1-M141 e B5-M025/M026:
  - lote no `salesSelectedLotIds` implica `inCart/isSelected = true` mesmo sem `selectedModuleId`;
  - remoção do lote elimina apenas seu destaque;
  - conjunto vazio simula “Limpar seleção” e remove todos os destaques;
  - seleção pontual fora de Vendas continua válida;
  - seleção tem precedência sobre hover.
- Testar multi-seleção B5-M025 + B5-M026: ambos selecionados; ao remover M025, somente M026 permanece selecionado.
- Testar regressão com B5-M030 regular usando a mesma função e confirmar o mesmo estado visual anterior.
- Acrescentar contrato estrutural garantindo que os dois caminhos chamam a resolução compartilhada e que os irregulares continuam usando `shape.footprint`/`ExtrudeGeometry`, sem `<Text>`, `<Html>`, outline adicional ou exceções por número/pavilhão.

### B1-M141 e preço derivado
- Área geométrica exata de 18,00 m² e hit-test positivo nas duas pernas do L e negativo no recorte removido.
- Seis vértices, duas `renderParts`, âncora dentro do footprint e identidade `B1:module:141` preservada.
- Soma exata das 189 áreas B1 igual a 586,50 m²; total do edifício permanece 1.201,50 m².
- `getPavilionModuleArea('B1', 141) = 18`, sem alteração das áreas de B6-M036, B4-M090 e B5-M025/026/078/079.
- `computeLotTotal(18, 776) = 13.968,00`; preço unitário permanece 776,00 e muda automaticamente se a regra comercial mudar.
- Contrato da migration comprova escopo exclusivo B1-M141, versionamento geométrico, idempotência e proteção dos registros comerciais.

## 5. Validação funcional e visual
- Executar TypeScript e as suítes focadas de seleção, vendas, áreas, B1, B4, B5, B6, preço e mapa público.
- Consultar o banco após a migration para confirmar B1-M141 = 18,00, B1 = 586,50, Renovação = R$ 13.968,00 e os mesmos IDs/status/preços/vínculos.
- No Mapa Comercial real, validar em desktop e mobile/touch:
  - B6-M036: 24,00 m² e todo o L destacado;
  - B5-M025/026/078/079: seleção individual e múltipla persistente;
  - B4-M090: 24,50 m² e L completo destacado;
  - B1-M141: 18,00 m², R$ 776,00/m², R$ 13.968,00 e L completo destacado;
  - remover item e “Limpar seleção” atualizam imediatamente mapa e painel;
  - B5-M030 regular mantém o comportamento anterior.
- Se o ambiente automatizado continuar bloqueado no carregamento WebGL já registrado, reportar explicitamente essa limitação sem alegar validação visual concluída.

## Riscos e contenções
- **Divergência entre os dois render paths:** eliminada pela função pura única e por teste que exige seu uso em ambos.
- **Highlight parcial ou retangular:** proibido; o irregular continua renderizado e clicável pelo footprint poligonal real.
- **Regressão de desempenho:** preservar instancing dos regulares, memoização das geometrias/materiais irregulares e renderização sob demanda.
- **Alteração comercial acidental:** snapshots e asserts finais cobrem IDs, status, preços, reservas, negociações, vendas, contratos, histórico e lineage.
- **Preço desatualizado:** a view existente deriva o total da área oficial; validar após a migration, sem persistir subtotal paralelo.
- **Escopo indevido:** migration e mudanças de referência limitadas ao B1-M141; os demais módulos especiais recebem apenas a correção genérica de seleção.
- Nenhuma publicação em produção.
