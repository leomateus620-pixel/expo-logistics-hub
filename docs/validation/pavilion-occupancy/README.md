# Ocupação comercial dos pavilhões — implementação e validação

Implementação local em 19/10/2026. [Prévia interativa](http://127.0.0.1:8080/scripts/dashboard/occupancy-qa.html). Os expositores, contratos e vendas dessa prévia e dos PDFs anexos são **fictícios**; os polígonos e números vêm das referências oficiais de teste do repositório.

## Diagnóstico e modelo

A Dashboard já deriva projeto, pavilhão e lote de entidades persistidas e usa `commercialDashboardPavilionGeometry`/`commercialDashboardGeometry` para apresentar a planta. Pedidos e itens são administrados pelo serviço de vendas; assinaturas são confirmadas/canceladas pelas RPCs existentes. Contratos `ORDER_ITEMS` têm `order_id` e abrangência explícita em `lot_contract_lots`; contratos `LOT` são individuais. A leitura mínima de compradores existente não contém toda a hierarquia contratual. A lista de pedidos é paginada e exige permissão de gestão, portanto não é uma fonte completa para a planta.

Foi acrescentada uma RPC somente de leitura, `commercial_pavilion_occupancy`, com uma consulta consolidada do inventário e associações ativas. Ela valida projeto, organização, pavilhão persistido e acesso ao mapa. Entrega apenas nomes de exibição autorizados, IDs, estados, datas e referências contratuais permitidas. Não entrega documentos pessoais, contatos, pagamentos, documentos anexados ou URLs privadas. Referências de contratos exigem `map.manage_contracts`; consulta básica da ocupação utiliza o acesso existente ao mapa.

A estrutura derivada preserva **pavilhão → expositor → pedidos/vendas → contratos → itens/lotes**. A chave é o ID persistente do expositor; sem ele, o agrupamento fica limitado ao pedido ou registro de venda e é marcado como identidade não verificada. Nomes iguais não unem empresas. Divergências de comprador, assinatura/status e contratos contraditórios produzem **Vínculo em conferência**.

O estado do item continua soberano: `PENDING_SIGNATURE`/`OPEN` é amarelo; `SIGNED`/`CONFIRMED` é azul; `LEGACY_UNVERIFIED` permanece legado vendido. Anexar um documento não confirma assinatura. Cancelamento retira a associação ativa sem apagar o histórico. A interface não grava estados de venda nem altera as regras de confirmação.

## Apresentação e sincronização

- Contornos são a união exata dos polígonos dos lotes de **cada contrato explicitamente vinculado**. Contratos distintos da mesma empresa têm escopos e marcadores próprios, como 1A/1B. Sem abrangência autorizada/verificada, o contorno é descontínuo e não afirma um contrato inexistente.
- Conjuntos separados recebem identificações locais do mesmo escopo. Tronco, barramento e ramificações SVG alcançam as bordas reais dos lotes. A distribuição evita células, salas de apoio, acessos e outras etiquetas; prioriza proximidade, inclusive nas margens de pavilhões estreitos.
- Cartões menores mantêm nome, referência, lotes, quantidade e situação. Informações completas ficam acessíveis no título e no painel aprovado. Até oito etiquetas detalhadas são exibidas simultaneamente; todos os agrupamentos continuam no painel.
- Seleção por empresa, contrato ou lote destaca o conjunto correspondente. Filtros, busca, conexões, restauração e navegação comercial respeitam os fluxos existentes.
- Tela cheia usa portal/modal acessível, preserva zoom e seleção, fecha por Escape e restaura foco. No mobile o painel é empilhado e recolhível.
- A chave React Query integra o prefixo `commercial-sale-orders`, já invalidado por operações comerciais e pelo mecanismo de sincronização da Dashboard. A atualização também atende leitores autorizados sem gestão de vendas. Não foi criado polling adicional.
- O vínculo só entra na planta quando IDs, números, estados e datas do inventário coincidem. Divergência provoca uma recuperação consolidada e impede a exportação inconsistente. Uma atualização em segundo plano conserva o último estado coerente e bloqueia temporariamente a exportação, evitando piscar etiquetas ou perder zoom.
- Geometria e decomposição espacial são memoizadas; uniões de polígonos usam cache por modelo imutável. Seleção não recalcula as uniões. Nenhum lote foi redesenhado, renumerado ou reposicionado; a cena 3D não foi alterada.

## PDF

Exportação assíncrona com carregamento sob demanda de jsPDF/AutoTable. Caminhos, textos, cores, contornos e ramificações são vetoriais; não há captura raster da tela. A3 horizontal para o Pavilhão 12 e vertical para o 13. Cabeçalho inclui pavilhão, data/hora consultada e totais. Página inicial traz planta completa, números originais, status, acessos, agrupamentos e legenda. Páginas seguintes trazem empresa, pedido, contratos autorizados, abrangência e situação de cada item.

O snapshot é capturado antes da geração e validado contra o inventário. O PDF não incorpora arquivos contratuais privados. Os dois exemplos foram renderizados e inspecionados em todas as páginas; veja [contato das quatro páginas](pdf-review.png) e [verificação estrutural](pdf-report.json).

| Exemplo sintético | Páginas / formato | Disponíveis | Vendidos | Em andamento | Números conferidos |
| --- | --- | ---: | ---: | ---: | ---: |
| [Pavilhão 12](pavilion-12-commercial.pdf) | 2 / A3 horizontal | 239 | 13 | 5 | 257 |
| [Pavilhão 13](pavilion-13-commercial.pdf) | 2 / A3 vertical | 97 | 5 | 2 | 104 |

Nomes autorizados, referências, preenchimentos por status e posições de texto foram confrontados com os JSONs de origem. Ambos contêm zero imagens raster. O teste adicional com 68 empresas verifica paginação acima de duas páginas, sem comprimir toda a listagem em uma página.

## Verificações executadas

| Verificação | Resultado e limite |
| --- | --- |
| Typecheck | Passou: `npm run typecheck`. |
| Build | Passou: `npm run build`; aviso de tamanho de chunks existente no projeto. |
| Testes direcionados | **22 arquivos / 189 testes passaram**: Dashboard, motor de associação, geometria, seleção por contrato, fullscreen, hook e PDF. |
| SQL em PostgreSQL WASM | **9 verificações passaram**, executando os corpos SQL reais de checkout, confirmação, cancelamento e nova leitura, com autenticação/preços/dados sintéticos e schema reduzido. Inclui RLS de leitura, idempotência, cancelamento, conflitos, restrição de contratos, organização/anon e ciclos de entidades. [Relatório](database-report.json). |
| Navegador | Cinco fluxos iniciais passaram em desktop/mobile: 257 polígonos, zoom/foco/fullscreen, filtros sem alterar caminhos, densidade com 68 grupos/8 etiquetas e Pavilhão 13 com 104 espaços. [Relatório](browser-report.json). Refinamentos finais conferidos no navegador integrado, com [carregamento limpo sem erros](design-browser-final-report.json). |
| Design | Comparação conjunta com as referências do usuário e painel aprovado. Sete etiquetas sem overflow, 18 ramificações e seis contornos contratuais no fixture. [Medições](design-dom-report.json), [QA completo](../../../design-qa.md). |
| PDF | Numeração completa, totais, nomes/contratos, cores, ausência de raster e textos dentro da página: passou nos dois exemplos. Revisão visual das quatro páginas concluída. |
| ESLint direcionado | Passou sem erros/avisos nos módulos novos, workspace, testes e entrypoint de QA. `git diff --check` passou. |
| Suite completa e baseline | A execução completa encontrou **89 falhas em 50 arquivos**. O checkout limpo do commit `03f1141701e81ab8555fe2a0e32978a50db7eb91` apresentou as mesmas 89 falhas, sem falhas adicionais naquela comparação. As verificações direcionadas finais foram repetidas após os refinamentos. [Comparação exata](regression-baseline.json). |

Os cenários cobrem uma empresa/um lote, consecutivos, separados, empresas vizinhas, múltiplos contratos da mesma empresa, assinatura parcial, cancelamento, conflito e acesso restrito. A venda de teste foi registrada pelas RPCs reais no banco local isolado. Não houve registro de venda nem outra mutação no banco remoto.

## Arquivos de aplicação

Alterados:

- `.github/workflows/commercial-dashboard.yml` — inclui os novos testes e caminhos no CI da Dashboard.
- `src/features/commercial-map/CommercialMapPage.tsx` — invalidação para leitores da ocupação no ciclo existente.
- `src/features/commercial-map/dashboard/CommercialDashboard.tsx` — navegação autorizada para venda/pedido.
- `src/features/commercial-map/dashboard/CommercialDashboardSpaces.tsx` — contexto do projeto, atualização e permissões.
- `src/features/commercial-map/dashboard/CommercialDashboardPavilion.tsx` — workspace, painel, filtros, seleção, fullscreen e exportação.
- `src/features/commercial-map/dashboard/CommercialMiniMap.tsx` — camada de anotações, realce e navegação de zoom.

Acrescentados:

- `src/features/commercial-map/dashboard/pavilionOccupancy.ts` — validação, identidade, hierarquia e escopos contratuais.
- `src/features/commercial-map/dashboard/usePavilionOccupancy.ts` — consulta consolidada e consistência.
- `src/features/commercial-map/dashboard/pavilionAnnotationLayout.ts` — união cadastral, distribuição e árvores vetoriais.
- `src/features/commercial-map/dashboard/PavilionAnnotations.tsx` — contornos, etiquetas e seleção acessível.
- `src/features/commercial-map/dashboard/pavilionAccessGeometry.ts` — projeção compartilhada dos acessos.
- `src/features/commercial-map/dashboard/pavilion-occupancy.css` — apresentação isolada e responsiva.
- `src/features/commercial-map/dashboard/pavilionPdf.ts` — documento vetorial.
- `supabase/migrations/20261019180000_commercial_pavilion_occupancy.sql` — RPC de leitura autorizada.

Testes e ferramentas acrescentados:

- `src/test/helpers/pavilionOccupancyFixture.ts`
- `src/test/pavilionOccupancy.test.ts`
- `src/test/pavilionOccupancyInteraction.test.tsx`
- `src/test/usePavilionOccupancy.test.tsx`
- `src/test/pavilionPdf.test.ts`
- `scripts/dashboard/occupancy-db-qa.mjs`
- `scripts/dashboard/occupancy-browser-qa.cjs`
- `scripts/dashboard/occupancy-pdf-qa.py`
- `scripts/dashboard/occupancy-qa.html`
- `scripts/dashboard/occupancy-qa.tsx`
- `design-qa.md` e esta pasta de evidências.

## Reprodução e ativação

Na instalação usual do projeto: `npm install`, `npm run typecheck`, `npm run build` e `npm test`. Para a prévia isolada, usar `npx vite --config scripts/dashboard/presentation.vite.config.ts --host 127.0.0.1 --port 8080` e abrir o link acima. Para gerar novamente os exemplos, executar o teste `src/test/pavilionPdf.test.ts` com `PAVILION_PDF_EVIDENCE=1`; a conferência Python usa `pypdf`. O script SQL aceita a instalação de PGlite indicada em seu cabeçalho. As ferramentas auxiliares não acrescentaram dependências ao projeto nem alteraram o lockfile.

**Ativação pendente:** aplicar a migração no Supabase do ambiente autorizado, atualizar os tipos gerados e realizar a validação autenticada com dados daquele ambiente. A migração não foi enviada/aplicada remotamente nesta execução. Sem a RPC, a planta existente continua disponível e a interface informa que os vínculos estão indisponíveis; a exportação desses vínculos permanece bloqueada. Não houve implantação nem publicação da aplicação. As alterações são entregues em uma PR para revisão, conforme solicitado pelo usuário.
