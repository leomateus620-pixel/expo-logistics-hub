# Modo Visita — arquitetura e validação

Baseline final: `8d48bb48378dfae73aae2a98dc9e1fdf367e96ce`, após integrar as revisões de paisagismo, sanitários, Alameda e postes publicadas durante o trabalho. A auditoria inicial ocorreu em `2c6d7917`. A visita utiliza o mapa existente. Não altera cadastro, geometria oficial, preços, IDs, iluminação global nem cria outro Canvas.

A entrada está disponível no mapa completo do parque. Páginas de comissão com cenário isolado mantêm sua navegação atual: não recebem colisores de estruturas que não renderizam. Filtros e seleção de segmentos no mapa completo continuam preservados no retorno.

## Arquitetura

- `useVisitStore`: somente estado discreto da experiência e snapshot de retorno. O estado de vendas continua no proprietário original.
- `VisitMode`: módulo lazy que liga os sistemas ao Canvas existente. Posição, velocidade, orientação e input ficam em objetos mutáveis; não passam pelo React a cada frame.
- `VisitOverlay`: saída compacta disponível mesmo enquanto os módulos carregam ou quando o chunk de controles falha.
- `VisitCharacterController`, `VisitInputManager`, `VisitCharacter`: aceleração/desaceleração, caminhada a 1,45 m/s, corrida a 3,4 m/s e avatar discreto com animação procedural. Escala canônica de 0,15 unidade/m.
- `VisitWorld`, `VisitCollisionSystem`, `VisitGroundingSystem`, `VisitSpatialIndex`: adaptadores dos dados visuais canônicos, índices espaciais e consultas locais, sem motor de física adicional.
- `VisitCameras` e `useVisitCameraLease`: primeira/terceira pessoa e transição; `CameraRig` continua sendo o único escritor da câmera. A câmera, Canvas e OrbitControls persistem ao alternar modos.
- `VisitPOIManager`, `VisitInteractionManager`, `VisitHUD`: cone frontal, distância à fachada, oclusão e prioridade selecionam um único alvo. A consulta espacial roda a 10 Hz; o cartão consome a mesma entidade/lote e o mesmo `useLotPricing2028` do painel oficial.
- `VisitSpawnManager`: entradas verificadas e resolução de ponto livre próximo de uma entidade autorizada. O parser de deep link está preparado; ativação automática pela URL não é publicada nesta versão.
- `VisitQualityManager`, `VisitPerformanceManager`, `VisitTelemetry`, `VisitFrameScheduler`: ponte com o proprietário existente do DPR, orçamentos locais, telemetria limitada e repouso do controlador.

## Colisão e câmera

O visitante usa um círculo varrido no plano XZ com intervalo vertical de corpo, equivalente à projeção horizontal de uma cápsula. A varredura contínua evita atravessar paredes finas em corrida; há deslizamento tangencial, resolução de sobreposição, limite de degrau e limites territoriais. Não se usam bounding boxes das copas como barreiras de árvores. Detalhes dos adaptadores e exceções físicas estão em [commercial-map-visit-collision.md](../../commercial-map-visit-collision.md).

O solo amostra as mesmas superfícies de ruas, lotes e terreno existentes, incluindo triângulos dos terrenos com relevo. O corpo se apoia na altura calculada; a lente suaviza pequenas mudanças verticais. A câmera em terceira pessoa verifica uma esfera no segmento entre olhos e câmera, inclusive depois do amortecimento, aproximando-se diante de obstáculos. A transição aérea certifica seu trajeto e procura colunas livres antes de começar. Uma rota impossível mostra erro recuperável e não força a passagem.

A execução real revelou apoio ausente no gramado perto da sede: o corpo estava em -0,08 enquanto o solo visível estava em aproximadamente 0,03188. A correção usa as células canônicas completas das quadras A/B e dos tratamentos de terreno, com dois índices internos adicionais. Após a revisão de paridade solicitada, todos os perfis preservam essas células: a visita não acrescenta triângulos em relação ao mapa tradicional. A fresta entre lotes do ICS usa apoio circular e tolerância da laje cadastral; o restaurante consome o gramado/conector da fonte visual. Margens realmente baixas não recebem altura artificial.

Os interiores existentes são cenas de **inspeção explícita**, carregadas pelo pipeline original. A visita exterior é suspensa ao clicar em “Acessar interior” e retomada na posição salva. Esta implementação não oferece caminhada livre dentro desses interiores. Somente entidades com interior oficialmente disponível apresentam a ação.

## Desktop e touch

W/setas avançam ou recuam, A/D deslocam lateralmente, Shift corre. O mouse usa pointer lock quando permitido e arraste como alternativa; Esc libera o mouse. Blur, ocultação da aba, cancelamento de ponteiro e perda de contexto limpam input.

No touch, avançar/voltar usam capturas de ponteiro independentes da área de arraste para olhar. Correr é uma opção alternável: não exige um terceiro dedo. É possível caminhar e olhar simultaneamente. Os controles respeitam áreas seguras e orientação; a interface não exige paisagem. O cartão mede sua altura apenas quando o layout muda, limita sua expansão e permite rolagem interna.

## Performance e escopo das evidências

As medições usam o Chrome headless local, GPU Intel UHD via ANGLE/D3D11, dados da fixture canônica e builds de produção com `VITE_COMMERCIAL_MAP_DIAGNOSTICS=true`. A página de QA usa o mesmo Canvas e pipeline de apresentação; não comprova payload autenticado, rede de produção ou desempenho de um telefone físico.

Os recursos pesados da visita são importados somente na entrada. Instancing, materiais compartilhados, LOD, culling, iluminação e warmup existentes são reaproveitados. A visita não raycasta a cena inteira; colisão e POIs usam grades espaciais. Os perfis HIGH/BALANCED/PERFORMANCE limitam DPR e orçamento técnico pelo controlador existente, preservando inventário, materiais e efeitos. A resolução dos reflexos permanece fixa para evitar recompilar materiais PBR ao mudar de perfil.

O modo parado encerra sua própria solicitação contínua de frames após o amortecimento. Input, câmera, foco e atualização dos dados acordam o controlador. Os demais sistemas animados continuam sob seus proprietários. O compositor preparado preserva os efeitos também durante movimento, sem ser recriado; o caminho direto permanece disponível para preparação e recuperação de falha.

### Reprodução

1. Instalar as dependências do projeto e disponibilizar Playwright (`PLAYWRIGHT_MODULE` pode apontar para um runtime existente).
2. Criar build QA: `VITE_COMMERCIAL_MAP_DIAGNOSTICS=true npm run build -- --outDir dist-qa` (no PowerShell, definir a variável por `$env:VITE_COMMERCIAL_MAP_DIAGNOSTICS='true'`).
3. Servir `dist-qa` na porta 5183. Definir `VISIT_BASE_URL` para outro endereço.
4. Executar `node scripts/commercial-map-performance/visit-baseline.cjs`, `visit-smoke.cjs` e `visit-scenarios.cjs all|mobile`, um navegador por vez, sem builds ou testes concorrentes. `all` executa percurso, ciclos, interior/noite/foco e sessão prolongada; os nomes individuais também são aceitos.
5. Comparar o baseline do commit original e o candidato com GPU, viewport e dados iguais. As rotas de QA possuem inícios regionais explícitos: não equivalem a uma caminhada contínua entre todas as regiões.

## Checks de código

Fonte da suíte completa: `12a53a2d`; a separação de módulos UI/Three está em `e444e91e`. As correções de resize durante linking e variantes tardias de shader estão em `b49524f3`. TypeScript e ESLint dos arquivos alterados passaram. A revisão adiciona prewarm autorizado, preparação de texturas, paridade de conteúdo e instrumentação com relógios independentes. Não adiciona dependências.

| Suíte completa | Baseline | Candidato |
| --- | ---: | ---: |
| Total | 2.258 | 2.411 |
| Passaram | 2.164 | 2.317 |
| Falharam | 94 | 94 |

As 94 falhas têm os mesmos arquivos e nomes; não há falha nova. São 153 casos a mais passando. A cobertura inclui colisão contínua, quinas, troncos, copas, solo, câmera, spawn, input, preços oficiais, segmento, foco/oclusão, interior explícito, retorno, cleanup, telemetria, repouso, recuperação de erro do HUD, posse de pointer lock tardio, prewarm, permissão, cache privado, cancelamento, relógios e paridade de conteúdo. A suíte completa usa dois workers em ambos os checkouts. [Comparação reproduzível](evidence/test-comparison.json).

A separação final preserva as constantes arquitetônicas e os cálculos de viewport. O teste adicional importa a rota inteira proibindo Three em runtime; o build normal com `bundle-report.cjs --assert-independent` confirma que renderer, física e PDF não são dependências estáticas da consulta. Os checks focados posteriores têm 49 casos passando e uma falha já identificada na base. A closure do build normal passa de 2.935.015 bytes / 865.736 gzip em `046e538f` para 1.773.176 / 518.377 gzip. São tamanhos de artefatos compilados, não tráfego de produção nem prova de latência. [Manifesto analisado](evidence/bundle-production.json).

No commit `b49524f3`, os **160 testes de contratos** de visita, prewarm, query compartilhada, relógios, paridade, qualidade adaptativa e preparação de materiais passaram. Outros 30 testes focados cobriram warmup/abort, materiais, boot, interior e seleção (há sobreposição; não somar as contagens). Esses contratos foram adicionados ao workflow de CI espacial. A suíte completa não foi repetida após cada ajuste localizado; seus 94 problemas de base permanecem explícitos. [Contratos](evidence/final/final-contract-tests.json).

No runtime final `015939d3`, **39 testes focados** passaram para a barreira de linking e recuperação; o conjunto de boot/prewarm/relógios teve **32 aprovados**. TypeScript geral e ESLint dos arquivos finais também passaram. Ambos os builds, QA e produção, passaram, e a checagem de independência do bundle continuou verde. Essas contagens têm sobreposição com as anteriores. [Última suíte de recuperação](evidence/final/link-barrier-recovery-focused.json).

As medições de caminhada, os 20 ciclos e a sessão de cinco minutos estão em [runtime-findings.md](runtime-findings.md), com identificação de build por roteiro. A auditoria e os resultados de entrada ficam em [startup-and-quality.md](startup-and-quality.md). Nenhum destes ensaios locais certifica celulares físicos, consulta autenticada ou o p95 da produção.

### Estado de aceitação

A PR é publicada como **rascunho**. A implementação e os ensaios locais não bastam para declarar todos os critérios do pedido concluídos. A meta de entrada em três segundos não foi atingida; ainda existe trabalho síncrono longo na montagem inicial. A caminhada regional medida ficou acima de 30 FPS, mas não manteve 60 FPS e registrou picos de até 164,3 ms. A permanência de cinco minutos e 20 ciclos são amostras limitadas, não certificação de horas de uso.

Antes de aprovação para produção, repetir os roteiros com conta autorizada e rede real, validar iPhone/Safari e Android físicos, e reduzir o bloqueio residual de startup mantendo a cena completa. O suporte a interiores desta entrega é a inspeção explícita existente; caminhada livre com colisão interna é uma expansão futura. A arquitetura oferece spawn por região/lote, mas deep link automático ainda não é ativado.

Os relatórios brutos maiores são arquivados sem perdas em `.json.gz`. `pack-evidence.cjs` preserva os originais locais e registra tamanhos e SHA-256 em `evidence/archives.json`; `compare-tests.cjs` e `visit-summary.cjs` aceitam os arquivos compactados. Capturas selecionadas documentam inspeção visual, sem substituir as métricas.
