# FENASOJA — faixa histórica contínua

Entrega local de 14/10/2026, branch `codex/fenasoja-continuous-history`. A PR #200 está incorporada na `main` em `e14bf0c0`; esse foi o ponto de partida do worktree. O checkout financeiro original foi preservado. Implementação preparada para PR conforme autorização do usuário; deploy não faz parte desta entrega.

## Diagnóstico e substituição

A PR #200 tinha quatro campanhas em posições laterais, seleção mobile de duas, fases reveal/highlight/closing/done, janela de 1.400 ms, sessão v1 concluída e faixa inferior `stacked`. Esses contratos foram substituídos no componente, controlador, animação, layout, preparação e testes. Os relatórios anteriores foram arquivados em [legacy](legacy/validation-pr200.md).

Permanece um único controlador de história. `released` continua vindo de `FenasojaPortalHero.onIntroReleased`; `paused` continua vindo do diálogo. O primeiro card conserva o launcher, nome acessível, prefetch em foco/hover/toque e restauração de foco. O contador e a infraestrutura Alvorada não foram alterados. Administrador segue quinto, Financeiro quarto e Comissões sexto com expansão. Resolvers, rotas, capabilities, autenticação, RLS e banco não mudaram.

## Acervo autenticado

**12 edições distintas renderizadas:** 1998 → 2004 → 2006 → 2008 → 2010 → 2012 → 2014 → 2016 → 2018 → 2022 → 2024 → 2026.

O catálogo registra as 25 edições, mas somente `status === 'recuperada'` entra no motor. Faltam as edições 1–11, 13 e 14: 1966, 1974, 1976, 1979, 1981, 1984, 1987, 1990, 1992, 1994, 1996, 2000 e 2002. Não geram elementos, placeholders ou imagens substitutas. Novas peças autenticadas entram pelo catálogo, variantes e lock de integridade, sem alterar o motor.

[Manifesto recebido](source/catalogo-25-edicoes.json), [procedência e pesos por arquivo](assets.md) e [cronologia conferida](verified-chronology.json). O histórico oficial e o manual de 2026 confirmam a numeração; o adiamento de 2020 corresponde à 23ª edição realizada em 2022, e o reagendamento de 2024 mantém a 24ª edição. O catálogo distingue anúncios de revista, projeto gráfico de 2018, capa de programa de 2022 e banner institucional de 2026.

Foram incorporados 24 WebPs locais, duas variantes por edição, 256 × 192 e 512 × 384. Todas as artes são integrais e usam contain/srcset/sizes; originais ficam em documentação, fora de produção. As quatro campanhas anteriores foram reconciliadas por edição, sem duplicatas. Manifestos e referências históricas continuam preservados.

| Conjunto completo das 12 peças | Bytes |
|---|---:|
| Variante 256 | 141.000 |
| Variante 512 | 436.610 |
| Símbolo oficial local existente, separado | 15.484 |

`currentSrc` confirmou a variante 256 em desktop e mobile no navegador usado. O ciclo completo nessa densidade usa 141 KB de campanhas; a variante 512 inteira supera a antiga meta de 350 KB e seu peso está documentado. Esses totais não representam todo o portal/Alvorada. Vídeos e capturas não são assets de runtime.

## Composição e movimento medidos

Navy estático, faixa única, proteção central com bordas suaves e marca em primeiro plano. `FenasojaBrand` mantém símbolo, texto HTML, acabamento metálico e badge. A marca não recebe animação. A proteção acompanha sua largura medida; a caixa usa grid para eliminar o espaço de baseline e centralizar o lockup real.

Cada grupo físico contém as 12 peças em ordem inversa. Com deslocamento positivo, a chegada pela esquerda é cronológica. O último gap pertence ao grupo medido, e o track anima exatamente um grupo. Repetições são clones decorativos do mesmo catálogo. A quantidade é `max(3, ceil((largura − passo) / comprimento_grupo) + 2)`, suficiente para cobrir o card sem uma cópia por edição.

| Apresentação | Miniatura | Gap | Grupo medido | Velocidade | Duração derivada |
|---|---:|---:|---:|---:|---:|
| Desktop/tablet | 96 × 72 px | 20 px | 1.392 px | 16 px/s | 87.000 ms |
| Mobile compacto | 42,65625 × 32 px | 12 px | 655,96875 px | 12 px/s | 54.664,0625 ms |

A diferença entre 656 px nominal e 655,96875 px real vem do arredondamento CSS; a animação usa a medida real, não o nominal. `duração = grupo / velocidade`. O loop é linear e infinito, sem highlight, encerramento ou estado concluído.

A preparação prioriza a janela visível mais três entradas futuras, com no máximo três jobs de carga/decode. A janela necessária e a próxima entrada precisam estar decodificadas antes de avançar; uma conexão lenta preserva a posição enquanto o portal continua disponível. Falhas são omitidas e remapeiam a âncora. Nenhum lazy loading de imagens transformadas governa o carregamento.

SessionStorage v2 guarda edição âncora, fração do stride e pausa escolhida. Ignora a v1 concluída. Resize/orientação conservam a referência na extremidade esquerda e o deslocamento relativo. Aba oculta, viewport, diálogo e pausa manual congelam a posição. Reduced-motion, Save-Data ou ausência de WAAPI mostram a marca estática sem carregar o acervo. O controle é irmão do launcher; clones são aria-hidden e não há anúncios contínuos.

## Verificação visual no navegador

App real no Codex In-app Browser. Prévia de produção: `http://127.0.0.1:8083/portal`. As capturas têm dimensões registradas em [capture-files.json](continuous/evidence/capture-files.json); a captura de viewport CSS 1920 px tem buffer de imagem de 1912 px, registrado sem alterar as medições DOM; as medições de viewport/layout estão em [responsive.json](continuous/evidence/responsive.json).

| Viewport CSS | Altura externa do card | Centro real da marca X/Y | Overflow |
|---|---:|---:|---|
| 320 × 720 | 90 px | 0 / 0 px | não |
| 360 × 800 | 90 px | 0 / 0 px | não |
| 390 × 844 | 90 px | 0 / 0 px | não |
| 430 × 932 | 90 px | 0 / 0 px | não |
| 768 × 1024 | 114 px | 0 / 0 px | não |
| 1366 × 768 | 114 px | 0 / 0 px | não |
| 1920 × 1080 | 114 px | 0 / 0 px | não |
| 844 × 390 | 114 px | 0 / 0 px | não |

O navegador usa pointer fino no landscape acima; o ramo coarse, inclusive landscape, mantém miniaturas de 32 px e card compacto, com cobertura controlada de componente. O mobile caiu de 176 para 90 px; desktop manteve 114 px. Não há crescimento causado pelas artes. Texto a 200% em 320 px reserva somente a altura da marca mais 32 px, sem overflow; todas as ações de acesso continuam dentro dos cards. [Captura](continuous/evidence/text-zoom-200-320.jpg) e [medidas](continuous/evidence/text-zoom-200-320.json).

Testes reais de interação: pausar/retomar, abrir e fechar Ecossistema, restauração do foco no launcher e remoção de inert, Administrador → `/login/admin`, retorno com posição/pausa preservadas, expansão/recolhimento de Comissões. A sessão anônima conserva o fallback protegido do Ecossistema. Loading/falhas, preferência de movimento, Save-Data, aba oculta e cleanup têm testes controlados; não se afirma autenticação administrativa real ou um aparelho físico.

## Vídeo, emenda e perfil limitado

[Vídeo MP4](continuous/evidence/seam-2026-1998.mp4), [trecho GIF](continuous/evidence/seam-2026-1998.gif), [amostras](continuous/evidence/motion-samples.json) e [medidas da emenda](continuous/evidence/motion-summary.json).

A gravação final usa o app real servido pelo Vite em 8082 e a fixture local `scripts/portal-history/seam.html`, que restaura uma sessão pausada próxima da emenda. A retomada ocorre pelo controle real. O movimento permanece a 16 px/s; não há aceleração, seek da animação ou frames gerados. Foram capturados screenshots completos e recortado somente o cabeçalho depois da captura. O MP4 mantém os intervalos reais de amostragem; o GIF é um trecho do mesmo registro. As cópias equivalentes antes/depois do reset são comparadas por posição, não pelo índice DOM.

Foram registrados **276 frames em 27.953 ms**, todos com a faixa em movimento. A marca real apresentou desvio máximo **0 px nos dois eixos**. Na emenda, cópias equivalentes avançaram **1,6011 px em 102 ms**, sem salto, pausa ou vazio; a chegada pela esquerda registrada foi 1998 → 2004 → 2006 → 2008, após a peça de 2026.

O perfil local em 320 × 800 usa o build de produção através de `scripts/portal-history/limited-mobile.mjs`: latência de 1,2 s e 30 KB/s por resposta de campanha, mais 8 ms de trabalho artificial por frame. É uma carga controlada, sem emulação de um modelo de telefone. Resultados e captura: [JSON](continuous/evidence/limited-mobile-profile.json), [mobile](continuous/evidence/limited-mobile-320.jpg). O portal permanece navegável enquanto o acervo prepara; ao fim, as 12 edições distintas estão carregadas e o loop continua.

Em 30.016,5 ms, o perfil registrou **1.801 frames**, mediana **16,7 ms**, p95 **17,1 ms**, máximo **18,8 ms**, **zero long tasks acima de 50 ms** e somente **11 alterações de atributos no host**. São medidas desse perfil controlado, sem generalização para todos os aparelhos.

## Checks e arquivos alterados

- Typecheck: passou.
- Build de produção: passou; aviso histórico de chunks de mapas/Three/Rapier permanece.
- ESLint dos arquivos alterados de implementação e testes: zero erros/avisos.
- Vitest pertinente: **161 testes, 11 arquivos, todos passaram**; após o ajuste final de prioridade de carga (janela visível antes das futuras), os 40 testes de história/integração Alvorada foram executados novamente e passaram.
- Integridade: **52 caminhos verificados**, incluindo 24 variantes, 12 originais, documentação e aliases históricos.
- `git diff --check`: passou. Não se apresenta lint global ou toda a suíte histórica como aprovados.

Principais arquivos: `FenasojaPortalHistory.tsx`; `history/artCatalog.ts`, `galleryTimeline.ts`, `galleryAnimation.ts`, `galleryLayout.ts`, `prepareGalleryAssets.ts`; `portal-history.css`; `CommissionPortalPage.tsx`; exceção de reduced-motion em `commission-portal.css`; testes de história/assets/Alvorada/contrato; scripts de preparação/QA; catálogo, proveniência e evidências. Package.json e lockfile não mudaram. Foram usados os CLIs do package.json com Node embutido porque o wrapper npm não está no PATH.

Os testes obsoletos de 1.400 ms/done/stacked/par mobile foram substituídos por movimento positivo, ordem de chegada, equivalência da emenda, múltiplas voltas, pausa/retorno/resize, sessão v1/v2, decode gradual, falhas e StrictMode. Checks de acesso continuam presentes. A revisão final acrescentou regressão para pausa → retomada → navegação antes do primeiro início, evitando salvar uma pausa antiga.

[Design QA atual](../../design-qa.md) · [comparação desktop](continuous/evidence/comparison-desktop.jpg) · [comparação mobile](continuous/evidence/comparison-mobile.jpg).
