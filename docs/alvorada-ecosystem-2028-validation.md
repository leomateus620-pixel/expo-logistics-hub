# Alvorada e Ecossistema Organizacional FENASOJA 2028

Registro técnico da evolução visual, das mudanças de desempenho e das condições de validação. A sequência dirigida continua com **11,4 segundos de tempo visível**, contados após a preparação gráfica. Carregamento inicial, recuperação do contexto gráfico e espera por dados organizacionais podem aumentar o tempo observado desde a navegação.

**Estado deste registro:** implementação e validação concluídas, incluindo a camada final de nuvens NASA. As medições, os testes e as capturas abaixo correspondem à versão avaliada; as limitações de emulação e de prontidão são explicitadas junto aos resultados.

## Arquitetura e comportamento

O fluxo conserva React, React Three Fiber, Three.js, SVG e CSS já presentes no projeto. Não acrescenta biblioteca de produção. A entrada autenticada continua obtendo a organização por `useOrganizationalEcosystemData`; `FenasojaAlvoradaExperienceView` permite fornecer o mesmo modelo resolvido à avaliação isolada. A fixture de diagnóstico não é importada pela aplicação autenticada.

O resolvedor, o modelo de dados e as regras de acesso permanecem como origem da hierarquia. O trabalho modifica sua apresentação e interação: não grava membros, comissões, cargos, permissões ou vínculos. Tanto a malha quanto o painel respeitam `isRenderable` e `renderableNodeIds` ao reunir contexto visual.

| Área | Arquivos principais | Comportamento implementado |
| --- | --- | --- |
| Orquestração | `src/features/alvorada/FenasojaAlvoradaExperience.tsx`, `SceneController.tsx`, `timeline.ts` | Preparação, fases, recuperação, relógio que pausa com a página oculta e liberação do Canvas. |
| Planeta | `scenes/EarthScene.tsx`, `earthAssets.ts`, `scenes/GeographicLayers.tsx` | Superfície geográfica sem nuvens embutidas, luz solar, emissão urbana modulada pelo lado noturno, nuvens separadas e atmosfera estreita. |
| Aproximação | `orbitalCamera.ts`, `CinematicCamera.tsx`, `TransitionCloudLayer.tsx` | Trajetória esférica contínua em direção a Santa Rosa; mudança de referencial coberta pelo corredor atmosférico. |
| Alvorada e marca | `HarvestBackdrop.tsx`, `AlvoradaBrandHero.tsx`, `alvorada.css`, `src/components/brand/FenasojaBrand.tsx` | Colheita ilustrativa com variantes de enquadramento, símbolo oficial separado e uma única ocorrência de 2028 na marca principal. |
| Organização | `organizational/components/OrganizationalEcosystem.tsx`, `OrganizationalNode.tsx`, `PersonDetailPanel.tsx` | Entrada breve por níveis, retratos e nomes valorizados, seleção de coletivos e de pessoas no painel. |
| Conexões | `organizational/hooks/useOrgGraphInteraction.ts`, `organizational/components/RelationshipLayer.tsx`, `organizational/layout/organizationalLayout.ts` | Vínculos incidentes, trajetos por corredores entre colunas e traços finos com espessura independente do zoom. |
| Navegação | `organizational/hooks/useOrgViewport.ts`, `organizational/components/OrgControls.tsx`, `organizational/organizational-ecosystem.css` | Enquadramento adaptativo, pan, pinça, zoom, busca, filtros, centralização, limpeza da seleção e painéis responsivos. |
| Identidade e imagens | `organizational/components/SoybeanAtmosphere.tsx`, `organizational/optimizedPortrait.ts`, `organizational/portraitManifest.json` | Grãos vetoriais reutilizados nas bordas e derivados locais dos retratos conhecidos. |

### Seleção e leitura das relações

`RelationshipLayer` filtra os elementos antes de renderizá-los. Durante uma seleção, linhas não relacionadas deixam de existir no SVG, incluindo seus brilhos; a camada inteira não captura eventos de ponteiro. A troca de pessoa atualiza identificador do nó e identificador da pessoa em uma única seleção, sem passagem intencional pela visão geral.

Uma pessoa pode aparecer em mais de uma estrutura. A seleção reúne suas participações explícitas e os vínculos pertinentes, sem atribuir a ela todas as relações de saída de uma comissão coletiva. Selecionar uma comissão mantém seus vínculos diretos; selecionar um integrante no painel ou pela busca passa ao contexto dessa pessoa. A busca por título de um coletivo não escolhe silenciosamente seu primeiro integrante.

No desktop, o enquadramento inicial considera controles e espaço disponível. A abertura do painel desloca suavemente a pessoa para a área livre, conservando a escala manual. Atualizações comuns não executam um novo enquadramento. No mobile, a organização passa a uma composição vertical com duas ou três colunas e navegação por arraste, em vez de comprimir todos os nomes em uma única tela. A orientação horizontal recebe organização de controles e painel própria. Os controles essenciais têm alvos de toque de pelo menos 44 × 44 CSS px nos layouts móveis.

### Sequência e continuidade

| Intervalo de tempo visível | Fase |
| --- | --- |
| 0–1,6 s | Apresentação orbital inicial. |
| 1,6–4,4 s | Aproximação sobre o território. |
| 4,4–5,8 s | Destino Santa Rosa e passagem atmosférica para a alvorada. |
| 5,8–7,4 s | Apresentação da marca. |
| 7,4–9,4 s | Permanência da marca e preparação do organograma. |
| 9,4–11,4 s | Transição para o ecossistema; controles ativos durante a entrada. |
| Após 11,4 s | Ecossistema aberto e interativo. |

O deslocamento orbital usa coordenadas esféricas e vetores reutilizados, evitando que uma interpolação atravesse o planeta. A passagem para a paisagem acontece antes de exigir detalhe local que a textura global não possui. O corredor atmosférico cobre a mudança de coordenadas. Santa Rosa permanece como destino geográfico; os textos repetidos de edição e localização foram retirados da composição da marca.

## Recursos gráficos e proveniência

O inventário de fontes e licenças está em `public/alvorada/ATTRIBUTION.md`. As referências anexadas orientaram o trabalho; as capturas da interface não foram incorporadas como telas de produção.

- **Superfície terrestre:** composição histórica NASA Earth Observatory / Blue Marble Next Generation, setembro de 2004, com topografia. `earth-surface-provenance.json` registra URL, SHA-256, tamanho da origem e conversão Lanczos para WebP. As variantes são 2048 × 1024 e 4096 × 2048; apenas o albedo recebe a variante de maior detalhe no desktop. Não há geração de continentes nem alteração de coordenadas.
- **Noite e relevo:** camadas registradas do repositório oficial Three.js, tag `r170`, conservando as resoluções existentes. A iluminação urbana é uma apresentação dessa textura histórica, não observação atual. Limites territoriais continuam baseados nas malhas IBGE já registradas.
- **Nuvens:** `earth-clouds-2048.webp` substitui a antiga camada alfa de 1024 px pela composição histórica Blue Marble 2002, NASA Goddard Space Flight Center / Reto Stöckli, em suas dimensões nativas de 2048 × 1024. O shader lê luminância como densidade para transparência e sombra. Não há ampliação artificial, detalhe inventado ou meteorologia atual. A origem, o SHA-256 e a conversão WebP qualidade 90 constam em `earth-clouds-provenance.json`; `scripts/prepare-alvorada-clouds.mjs` reproduz a conversão. Esse refinamento final não altera as demais texturas.
- **Colheita:** `soy-harvest-dawn.webp` e `soy-harvest-dawn-mobile.webp` são variantes de uma ilustração original criada com ImageGen em 2026-09-05. Representam agricultura no sul do Brasil, não uma fotografia documental de Santa Rosa. O prompt, a origem e o preparo constam em `docs/image-prompts/alvorada-soy-harvest-2028.md`; `scripts/prepare-harvest.mjs` recorta e converte a imagem. A paisagem tem movimento CSS limitado, não constitui reconstrução 3D navegável.
- **Marca:** `fenasoja-symbol-official.png` é o símbolo oficial previamente aprovado e documentado no projeto. A nova composição reutiliza esse arquivo sem redesenhar ou recolorir a marca. O símbolo não foi gerado com IA.
- **Retratos:** 38 derivados WebP, com dimensão máxima de 256 px e proporção preservada, produzidos a partir das fotografias institucionais registradas. `public/alvorada/portraits/manifest.json` relaciona origens, derivados e bytes. O mapeamento opera na apresentação, preserva a correção de identidade já existente entre as importações do presidente e do vice e mantém URLs de uploads desconhecidos.

## Gargalos tratados

O carregamento inicial agora aguarda os recursos suspensos da cena e a tentativa de compilação antecipada por `gl.compileAsync`. O relógio da viagem só começa após a preparação e a passagem por quadros do renderizador. O `PerformanceMonitor` entra após `ready`, impedindo que a espera inicial por recursos seja tratada como queda sustentada da qualidade durante a animação. A telemetria de prontidão não certifica apresentação física no monitor.

As texturas da Terra recebem configuração antes do upload do Drei. A qualidade inicial escolhe recursos conforme viewport, tipo de ponteiro, indícios de memória/concorrência e compatibilidade WebGL; DPR, pós-processamento e quantidades de elementos têm limites. Não há uso de `prefers-reduced-motion` para desativar a sequência ou simplificar sua direção de movimento.

A colheita começa a carregar após a prontidão do quadro orbital e passa por decodificação assíncrona. A liberação antecipada do Canvas exige que a imagem **tenha terminado sua transição para opacidade 1**, informada por `HarvestBackdrop.onCovered`, além de alcançar a fase de permanência da marca. Isso mantém a cena subjacente quando uma imagem lenta ainda está entrando. Os timers de tempo visível continuam as fases restantes sem renderizar WebGL encoberto. O limite final de liberação permanece em `org-ready`.

A Terra e o corredor atmosférico possuem limites de residência; texturas e materiais exclusivos têm descarte explícito. Elementos gráficos invisíveis deixam de executar trabalho de atualização pertinente à cena. O mapa DOM conserva a navegação após a remoção do Canvas.

Os retratos empacotados reduzem a transferência e a decodificação de imagens grandes durante a entrada do organograma. A animação das conexões usa opacidade em vez de atualizar o desenho do traço a cada quadro; o fade redundante de tela inteira em `.org-ecosystem__ready` foi removido, mantendo a transição externa e as entradas dos nós. Durante pan e pinça, o transform da câmera é aplicado diretamente por `requestAnimationFrame`; a publicação em React dos indicadores ocorre no máximo a cada 100 ms, com estado final exato ao terminar o gesto.

Os 38 retratos passaram de 74.581.688 para 248.234 bytes no conjunto de arquivos, redução de 99,67%. Essa comparação descreve os assets, não uma redução garantida do tempo total da página. As medições abaixo avaliam o conjunto das mudanças; não isolam causalmente cada otimização. A ausência de tarefas JavaScript longas não exclui atrasos de rasterização, composição ou GPU.

## Condições de avaliação

`scripts/alvorada-qa.tsx` usa uma **fixture isolada de 37 nós**, construída pelo resolvedor de produção com nomes representativos das referências. Ela não consulta a API autenticada nem mede autenticação, permissões servidas pelo backend, latência de banco ou o tempo real de chegada do cadastro. Os testes de contrato e resolvedor são verificações separadas da avaliação visual dessa fixture.

`scripts/measure-alvorada.mjs` abre Chrome headless por Playwright, um processo e contexto novos por cenário, com DPR 1. Não aplica redução artificial de CPU ou rede. Isso proporciona cache do navegador novo para cada execução; não controla cache do sistema operacional, CDN, roteador ou servidor local. O baseline pode buscar fotografias registradas pelo endereço público de origem, enquanto a versão nova usa seus derivados empacotados.

| Cenário | Viewport CSS | Uso |
| --- | --- | --- |
| Desktop | 1440 × 900 | Sequência, métricas e interações de mouse. |
| Mobile emulado | 390 × 844 | Sequência, métricas, composição vertical e toque emulado. |
| Mobile horizontal emulado | 844 × 390 | Painéis, controles e interações; sem comparação de tempo da abertura pelo script padrão. |

Os eventos de pan e pinça móveis são enviados ao Chrome por CDP. São validação em emulação no computador, **não execução em aparelho físico, Safari ou iOS**. A meta de 60 fps não é uma garantia universal. Resultados dependem do equipamento, driver, backend gráfico e demais processos em execução.

Ambiente utilizado: Windows, Chrome 152 headless, DPR 1. O navegador informou `hardwareConcurrency = 4` e `deviceMemory = 8`; são indícios expostos por `navigator`, não inventário físico certificado. O backend gráfico e a GPU efetivamente utilizados não foram verificados.

Referências comparadas: baseline `5797ab8d`; implementação na branch `codex/alvorada-ecosystem-2028`. A comparação usa três execuções de cada cenário por versão, sem capturas durante a medição. A tabela apresenta a mediana de cada indicador calculado por execução, sem misturar os quadros das três passagens.

### Definições das métricas

- `firstReadyMs`: primeira observação, por `requestAnimationFrame`, do estado `webgl`, contada desde o início da página de diagnóstico. É um indicador de prontidão, **não o instante literal do primeiro pixel**. O baseline sinalizava prontidão antes da compilação antecipada que agora faz parte da condição de `ready`; portanto a semântica mudou e a comparação inclui essa redistribuição da preparação. Também não equivale ao tempo desde um clique no portal autenticado.
- `graphReadyMs`: primeira observação da fase `org-ready`, também relativa à navegação da fixture.
- FPS médio, p95, máximo e quadros acima de 50 ms: calculados a partir dos intervalos de `requestAnimationFrame` entre prontidão WebGL e `org-ready`. São indicadores do agendamento observado pelo navegador, não medição por câmera externa ou confirmação de cada apresentação da GPU.
- Tarefas longas: entradas de `PerformanceObserver` coletadas na página durante a execução; o total não está limitado à mesma janela usada para os intervalos de quadro.
- Recursos: `PerformanceResourceTiming`, dimensões e metadados do navegador, além da telemetria do Canvas amostrada a cada 500 ms. Tamanhos de transferência de recursos externos podem ser limitados pelas permissões de timing da origem.
- A opção `--capture` tira capturas durante a viagem e pode perturbar a medição. A comparação numérica deve usar execuções sem essa opção; capturas pertencem a uma passagem separada.

### Comparação final

| Indicador | Desktop antes | Desktop depois | Mobile emulado antes | Mobile emulado depois |
| --- | --- | --- | --- | --- |
| Prontidão inicial, ms | 929,1 | 1.299,9 | 695,9 | 1.154,6 |
| Organograma pronto, ms | 12.295,3 | 12.849,4 | 12.245,5 | 12.670,8 |
| FPS médio observado | 50,56 | 55,32 | 51,80 | 56,62 |
| Intervalo p95, ms | 33,3 | 16,8 | 16,8 | 16,9 |
| Maior intervalo de quadro por execução, ms | 416,7 | 333,3 | 350,0 | 316,7 |
| Quadros acima de 50 ms | 13 | 6 | 14 | 3 |
| Tarefas longas: quantidade / total em ms | 7 / 726 | 6 / 851 | 4 / 605 | 3 / 430 |

O pior intervalo individual entre as três passagens, diferente da mediana da linha acima, foi de **416,8 → 400,0 ms no desktop** e **383,3 → 316,7 ms no mobile emulado**. Houve menos quadros longos e aumento da média de FPS, mas permanecem travadas perceptíveis; os dados não sustentam promessa de 60 fps contínuos.

A prontidão aumentou 370,8 ms no desktop e 458,7 ms no mobile emulado. Parte do trabalho antes realizado durante a viagem passou à preparação. Isso também afeta o início da janela usada para os intervalos de quadro; a melhora média não deve ser interpretada como ganho isolado da GPU. No desktop, o total mediano de tarefas longas **piorou de 726 para 851 ms**, apesar da menor quantidade, enquanto no mobile emulado caiu de 605 para 430 ms. O custo inicial adicional e os picos residuais continuam como limitações.

Dados brutos versionados, com condições, recursos e erros de cada passagem:

| Cenário | Baseline | Depois |
| --- | --- | --- |
| Desktop | [1](validation/alvorada-2028/baseline/desktop-1.json), [2](validation/alvorada-2028/baseline/desktop-2.json), [3](validation/alvorada-2028/baseline/desktop-3.json) | [1](validation/alvorada-2028/after/desktop-1.json), [2](validation/alvorada-2028/after/desktop-2.json), [3](validation/alvorada-2028/after/desktop-3.json) |
| Mobile emulado | [1](validation/alvorada-2028/baseline/mobile-1.json), [2](validation/alvorada-2028/baseline/mobile-2.json), [3](validation/alvorada-2028/baseline/mobile-3.json) | [1](validation/alvorada-2028/after/mobile-1.json), [2](validation/alvorada-2028/after/mobile-2.json), [3](validation/alvorada-2028/after/mobile-3.json) |

Todas as 12 passagens registraram 37 nós, Canvas liberado ao final e nenhum erro de página.

## Reprodução

Executar a partir da raiz do checkout avaliado, com dependências do projeto instaladas. Playwright e Sharp são ferramentas dos scripts de diagnóstico/preparo, sem adição às dependências de produção. Se vierem de um runtime externo, configurar `PLAYWRIGHT_PATH` e `SHARP_PATH` com caminhos reais desse ambiente; não é necessário regenerar imagens para validar os arquivos já versionados.

Para preparar e servir a fixture compilada, usar comandos separados. O servidor de preview permanece aberto em um terminal; rodar os avaliadores em outro.

```powershell
npx vite build --config scripts/alvorada-qa.config.ts
npx vite preview --config scripts/alvorada-qa.config.ts --host 127.0.0.1 --port 4181 --strictPort
```

```powershell
node scripts/measure-alvorada.mjs http://127.0.0.1:4181 artifacts/alvorada/final-metrics
node scripts/measure-alvorada.mjs http://127.0.0.1:4181 artifacts/alvorada/final-captures --capture
node scripts/check-alvorada-interactions.mjs http://127.0.0.1:4181 artifacts/alvorada/final-interactions
```

Usar a mesma fixture e as mesmas condições no baseline, servido por checkout separado, sem alterar dados nem misturar resultados de build de desenvolvimento e produção. Para reproduzir o harness em `5797ab8d`, extrair somente o corpo de `FenasojaAlvoradaExperience` para a exportação `FenasojaAlvoradaExperienceView` que recebe `organizationalData`, mantendo o wrapper original responsável pelo hook; essa adaptação permite injetar a fixture sem portar as mudanças visuais ou de desempenho ao baseline. Copiar os arquivos de entrada/configuração QA e medir com o mesmo script. Não executar browsers, builds ou suítes concorrentes durante as passagens de medição.

Verificações pertinentes do código:

```powershell
npx tsc --noEmit -p tsconfig.app.json
npx vitest run src/features/alvorada src/test/alvorada src/test/organizationalResolver.test.ts
npx eslint src/features/alvorada src/components/brand/FenasojaBrand.tsx
npm run build
git diff --check
```

Regeneração opcional dos derivados, somente quando houver intenção de atualizar os assets:

```powershell
node scripts/prepare-alvorada-portraits.mjs
node scripts/prepare-harvest.mjs "CAMINHO_REAL_DO_PNG_ORIGINAL"
```

O primeiro comando de preparo busca as fontes públicas registradas; o segundo exige a imagem original do ImageGen documentada na proveniência. Ambos escrevem os derivados e devem ter seu diff revisado.

## Verificações e evidências finais

O avaliador de interações confere igualdade dos IDs das conexões efetivamente presentes, seleção sucessiva por busca, coletivo, integrante com múltiplas participações, limpeza, fechamento de detalhes, exclusão dos nós filtrados do foco, zoom e pan. Nas duas orientações móveis também confere pinça emulada e tamanho dos controles. A execução registra erros da página e capturas dos estados principais. Essas verificações não substituem inspeção visual de fotografia, contraste, continuidade da câmera e nomes extensos.

Os testes pertinentes incluem resolvedor e acesso, integração com portal, fases e recuperação WebGL, geografia e trajetória orbital, seleção e controles, layout, imagens registradas e descarte ao fim da apresentação. Os cenários de liberação da colheita preservam o Canvas até a cobertura opaca, inclusive quando a imagem carrega durante `brand-hold`, e verificam a pausa do relógio com a página oculta.

A rodada final, após a atualização da camada de nuvens, passou em 130 testes de 17 arquivos, 33 verificações de interação no navegador — 11 em cada viewport — e oito verificações adicionais da sequência completa, continuidade da animação com a preferência de movimento reduzido, controles ativos durante a entrada e fechamento/reabertura. Não foram registrados erros da página nesses cenários.

Dois testes de `alvoradaPortalIntegration` já falhavam no baseline com `No QueryClient set`. O ajuste acrescenta o provider de consulta ao harness de testes; não altera o acesso, os providers ou o fluxo autenticado da aplicação.

| Verificação | Resultado registrado |
| --- | --- |
| TypeScript | Passou com `npx tsc --noEmit -p tsconfig.app.json`. |
| ESLint do escopo alterado | Passou após o refinamento final. |
| Vitest pertinente | 130 testes passaram em 17 arquivos; [resultado estruturado](validation/alvorada-2028/checks/focused-tests.json). |
| Build da aplicação | Passou em 45,52 s; [log de produção](validation/alvorada-2028/checks/production-build.log). |
| Build da fixture de QA | Passou em 11,41 s; usado nas medições e capturas finais. |
| Interações desktop / mobile / horizontal | 33 verificações passaram, 11 por viewport, sem erros de página; [desktop](validation/alvorada-2028/checks/desktop.json), [mobile](validation/alvorada-2028/checks/mobile.json), [horizontal](validation/alvorada-2028/checks/landscape.json). |
| Sequência completa e fechamento/reabertura | Oito verificações adicionais passaram, incluindo controles durante a entrada e preferência de movimento reduzido, sem erros de página; [resultado](validation/alvorada-2028/checks/handoff.json). |
| Suíte ampla do repositório | Não executada nesta entrega; não se afirma que a suíte inteira passou. |

O build apresentou avisos de chunks maiores que 500 kB e de atualização da base Browserslist, associados à arquitetura e configuração preexistentes. O resultado do build não elimina essas pendências; a mudança não reconstrói o empacotamento geral da aplicação.

| Estado visual | Captura final |
| --- | --- |
| Planeta | [Desktop](validation/alvorada-2028/states/desktop-earth.png), [mobile](validation/alvorada-2028/states/mobile-earth.png) |
| Aproximação e Santa Rosa | [Desktop](validation/alvorada-2028/states/desktop-approach.png), [mobile](validation/alvorada-2028/states/mobile-approach.png) |
| Colheita e marca | [Desktop](validation/alvorada-2028/states/desktop-brand.png), [mobile](validation/alvorada-2028/states/mobile-brand.png) |
| Visão geral organizacional | [Desktop](validation/alvorada-2028/states/desktop-overview.png), [mobile](validation/alvorada-2028/states/mobile-overview.png), [horizontal](validation/alvorada-2028/states/landscape-overview.png) |
| Pessoa selecionada e linhas isoladas | [Desktop](validation/alvorada-2028/states/desktop-person.png), [mobile](validation/alvorada-2028/states/mobile-person.png), [horizontal](validation/alvorada-2028/states/landscape-person.png) |
| Comissão Central e integrante | [Coletivo](validation/alvorada-2028/states/desktop-collective.png), [integrante](validation/alvorada-2028/states/desktop-member.png) |
| Seleção durante a entrada e viagem completa | [Seleção na transição](validation/alvorada-2028/states/selection-during-handoff.png), [vídeo da sequência](validation/alvorada-2028/states/complete-journey.webm) |

## Limitações e acompanhamento

Os resultados desta fixture não certificam o volume integral do cadastro autenticado nem a latência de serviços de produção. A apresentação móvel exige exploração vertical; todos os integrantes não ficam simultaneamente visíveis. Texturas globais e limites territoriais servem de contexto geográfico, não de cadastro local ou imagem de satélite em tempo real. A colheita é uma ilustração identificada como tal na proveniência.

Não houve, por este protocolo, certificação em dispositivo físico, Safari/iOS, rede móvel real ou GPU de entrada. A preparação inicial ficou mais longa e ocorreram picos de até 400 ms na versão final; o refinamento melhora a apresentação e a fluidez média sem eliminar todas as travadas. O backend gráfico não verificado e as diferenças de prontidão entre versões limitam conclusões sobre desempenho físico e tempo do primeiro pixel.
