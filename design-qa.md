# QA de design — ocupação comercial FenaSoja 2028

final result: passed

Não há achados P0/P1/P2 pendentes na composição revisada. As alterações intencionais seguem os pedidos do usuário: etiquetas menores, próximas dos lotes, ramificações legíveis e contornos por **contrato**, preservando o painel de expositores aprovado.

## Alvos e normalização

- Verdade visual da planta: `/Users/leonardo/Desktop/Captura de Tela 2026-10-19 às 16.40.47.png`, 1416 × 996 px.
- Verdade visual do painel aprovado: `/Users/leonardo/Desktop/Captura de Tela 2026-10-19 às 16.34.43.png`, 452 × 746 px.
- Implementação: `http://127.0.0.1:8080/scripts/dashboard/occupancy-qa.html`.
- Captura final: [design-final-iab.png](docs/validation/pavilion-occupancy/design-final-iab.png), viewport do navegador integrado de 662 × 768 CSS px, imagem de 662 × 768 px, densidade efetiva 1.
- Estado final: Pavilhão 12, 257 lotes oficiais, cinco agrupamentos sintéticos, todos os status, empresas/conexões visíveis, zoom ajustado ao espaço, tela cheia, sem seleção.
- Comparação conjunta: [design-comparison.png](docs/validation/pavilion-occupancy/design-comparison.png). A referência completa e o recorte da área da planta da implementação `(12,162)-(650,663)` foram contidos proporcionalmente em quadros de 710 × 520 px. Sem distorcer a proporção. Esta é uma comparação de composição; não é uma alegação de igualdade pixel a pixel entre viewports diferentes.
- Comparação focada: [panel-comparison.png](docs/validation/pavilion-occupancy/panel-comparison.png). Recorte do painel aprovado normalizado para 290 × 548 px e painel desktop de 290 × 548 px capturado em [pavilion-13-fullscreen.png](docs/validation/pavilion-occupancy/pavilion-13-fullscreen.png), viewport 1600 × 1080, DPR 1. Ambos sem seleção e com os mesmos dois expositores. Os refinamentos posteriores alteraram as anotações da planta, sem alterar esse painel.
- Detalhe final selecionado e ampliado: [contract-contours-selected-iab.png](docs/validation/pavilion-occupancy/contract-contours-selected-iab.png).
- Os dados comerciais são fictícios e explicitamente identificados na página de QA. A geometria vem dos fixtures oficiais já usados pelo projeto.

## Superfícies de fidelidade verificadas

| Superfície | Resultado |
| --- | --- |
| Fontes e tipografia | Família herdada da Dashboard; pesos e hierarquia do painel preservados. Nome da etiqueta em até duas linhas, referência contratual e informações secundárias mais leves. Medição DOM de sete etiquetas sem texto ultrapassando os cartões. Textos completos no título acessível e painel. |
| Espaçamento e ritmo | Etiquetas SVG com largura 146 e alturas 46–55 unidades, em lugar da composição anterior de 180 × 62. Redução de área de aproximadamente 28–40%, mesmo acrescentando a referência contratual. Painel mantém busca, badges, bordas suaves e espaçamento compacto aprovado. |
| Cores e tokens | Cores oficiais continuam exclusivas dos status dos lotes. Contornos e árvores usam verde institucional `#17685c`, com halo branco e realce de seleção. Vínculo em conferência usa indicação explícita; ausência de abrangência verificada tem traço descontínuo. |
| Imagens e vetores | Nenhum logo ou ativo raster foi substituído. A planta é o diagrama SVG cadastral solicitado, com os mesmos polígonos e números. Ícones reutilizam Lucide e os acessos oficiais. O PDF usa caminhos e texto vetoriais. |
| Copy e conteúdo | Nome, lotes, quantidade, situação e referência autorizada permanecem disponíveis. Contratos distintos da mesma empresa recebem marcadores como 1A/1B, sem substituir a numeração cadastral. Legado, identidade não verificada e conflito são explícitos. |

## Histórico de comparação e correções

1. **P2 — Etiquetas distantes e conexão única.** A referência inicial mostrava cartões laterais e líderes longos. Correção: distribuição em espaços livres próximos, decomposição de conjuntos separados e árvores com tronco, barramento e ramificações para cada lote. Evidência posterior: comparação conjunta e captura final.
2. **P2 — Cartões grandes e excesso de espaço.** A referência de 16:40 ainda consumia os corredores com cartões largos. Correção: largura 146, altura conforme conteúdo, menos padding e duas linhas de nome. A primeira redução revelou nomes excedendo a largura; o cálculo conservador de quebra corrigiu isso. Evidência posterior: [design-dom-report.json](docs/validation/pavilion-occupancy/design-dom-report.json), sete cartões sem overflow.
3. **P2 — Abrangência gráfica confundia empresa com contrato.** Correção: união de polígonos por vínculo contratual explícito, contornos independentes mesmo em contratos vizinhos do mesmo expositor, seleção do escopo exato e marcadores 1A/1B. Evidência posterior: seis contornos contratuais e 18 ramificações na composição de teste; testes de contratos adjacentes e captura selecionada.
4. **P2 — Zoom podia recortar a etiqueta em layout estreito.** O painel externo empilhado podia permanecer deslocado ao ampliar. Correção: revelar o mapa e o par etiqueta/lote quando couber no viewport, preservando o nível de zoom. Evidência posterior: captura selecionada mostra a etiqueta Beta completa, os quatro lotes e suas ramificações.

## Interação, acessibilidade e responsividade

- Tela cheia por portal Radix, fechamento evidente/Escape, foco restaurado ao acionador e apenas uma superfície de mapa montada.
- Seleção da etiqueta, empresa, contrato ou lote; atenuação contextual; detalhes contratuais recolhíveis; navegação comercial existente sujeita à autorização.
- Mostrar/ocultar empresas e conexões, filtros SOLD/SALE_OPEN, busca, restauração e zoom conferidos.
- Desktop 1600 × 1080 e mobile 390 × 844 testados no navegador; revisão final também no viewport estreito do navegador integrado (662 × 768).
- Teclado Enter/Espaço nas etiquetas, foco visível, ações com nomes acessíveis, alvos de pelo menos 44 px no mobile e preferência por movimento reduzido.
- Navegador inicial sem erros de execução; a revisão final verificou novamente o console. Um aviso de `createRoot` ocorreu apenas durante hot reload do entrypoint isolado de QA; não houve erro do fluxo comercial. O [carregamento final limpo](docs/validation/pavilion-occupancy/design-browser-final-report.json) não apresentou erros.

## Limites e refinamentos opcionais

- **P3:** 257 lotes em uma largura de 662 px exigem zoom para ler detalhes pequenos. O ajuste inicial mantém a visão completa, e a lista complementar conserva todos os registros. Não há controles persistentes ocultos por overflow horizontal.
- Em alta densidade há oito etiquetas detalhadas por vez, com seleção progressiva e todos os 68 agrupamentos acessíveis no painel de teste. Não se força todos os nomes em uma só página ou corredor.
- Esta revisão valida apresentação e interação locais. A migração ainda não foi aplicada ao Supabase remoto; autenticação e dados reais do ambiente implantado permanecem como etapa de ativação.

## Checklist concluído

- [x] Fonte e implementação vistas em comparações conjuntas, incluindo região focada.
- [x] Tipografia, espaçamento, tokens, vetores e conteúdo revisados.
- [x] Geometria cadastral e cores oficiais preservadas.
- [x] Cartões compactos, ramificações por lote e contornos por contrato.
- [x] Seleção, zoom, painel, Escape, foco, filtros e mobile conferidos.
- [x] PDF vetorial e suas páginas de detalhes revisados visualmente.

final result: passed
