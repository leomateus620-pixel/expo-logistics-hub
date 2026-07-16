# Design System Fenasoja 2028

## Objetivo e limites

Este documento define a identidade visual e os critérios de consistência da migração para Fenasoja 2028. A mudança é de apresentação: rotas, autenticação, permissões, integrações, consultas, persistência e regras de negócio continuam sendo a fonte de verdade existente.

As duas fontes canônicas da identidade são:

- `src/styles/tokens.css`, para primitives e tokens semânticos consumidos pela interface;
- `src/lib/fenasoja-brand.ts`, para edição, nome do produto, hexadecimais, paleta de gráficos e RGBs usados fora do CSS, como PDFs e canvas.

Componentes devem consumir tokens semânticos (`background`, `foreground`, `primary`, `action`, `success`) antes de recorrer a uma cor primitiva. Novos valores hexadecimais não devem ser espalhados pelos módulos.

## Paleta oficial

| Primitiva | Hex | Papel principal |
| --- | --- | --- |
| Indigo | `#121D85` | Seleção, destaque institucional, navegação contextual e séries primárias |
| Navy | `#031834` | Estrutura, sidebar, cabeçalhos e texto sobre superfícies claras |
| Near-black navy | `#040203` | Superfícies escuras profundas e foreground no tema escuro |
| Orange | `#F2751A` | Ação primária, foco e estado ativo |
| Dark orange | `#E67E09` | Variação de interação do laranja |
| Gold | `#F9C121` | Avisos, marcos e séries secundárias |
| Light gold | `#FAD954` | Ênfase suave sobre navy |
| Cream | `#F5E6CD` | Apoio editorial e texto claro aquecido |
| Soft white | `#F9FAFB` | Cards, conteúdo inverso e superfícies claras |
| Blue | `#1A6CCB` | Informação e dados |
| Green | `#089D7E` | Sucesso e dados positivos |
| Muted indigo | `#534D90` | Série auxiliar e destaque de baixa prioridade |

O fundo geral é um neutro frio. Creme é uma cor de apoio, não o fundo dominante da aplicação. Orange fica reservado a ação, foco, seleção ou estado; não deve competir com Indigo como decoração genérica.

Como regra de composição, use aproximadamente 60% de superfícies neutras ou levemente tonalizadas, 30% de estrutura Navy/Indigo e 10% de Orange, Gold, Green e demais acentos semânticos.

### Pares de contraste protegidos

Os pares abaixo atendem WCAG AA para texto normal (mínimo 4,5:1) e são cobertos por teste automatizado:

| Foreground | Background | Contraste aproximado |
| --- | --- | ---: |
| Navy | Soft white | 16,97:1 |
| Soft white | Indigo | 13,05:1 |
| Navy | Orange | 6,19:1 |
| Navy | Gold | 10,71:1 |
| Navy | Cream | 14,43:1 |
| Soft white | Muted indigo | 7,10:1 |
| Soft white | Blue | 4,96:1 |
| Navy | Green | 5,18:1 |

Verde ou azul não devem ser combinados com foreground arbitrário: use o par semântico definido ou valide o contraste. Cor nunca é o único indicador de estado.

## Tokens semânticos

| Token | Uso |
| --- | --- |
| `--background` / `--foreground` | Plano global e texto principal |
| `--surface-1..3` | Elevação por contraste, sem simular vidro |
| `--primary` | Ênfase institucional e seleção |
| `--action` / `--action-foreground` | CTA primário e respectivo texto |
| `--secondary`, `--muted`, `--accent` | Ações e conteúdo de menor hierarquia |
| `--success`, `--warning`, `--info`, `--destructive` | Estados operacionais explícitos |
| `--border`, `--input`, `--focus-ring` | Delimitação, campos e foco perceptível |
| `--sidebar-*` | Estrutura e estados próprios da navegação lateral |
| `--chart-1..6` | Ordem consistente das séries de dados |

Escalas compartilhadas:

- raios: 8 px, 10 px, 12 px e 16 px como escala padrão; 24 px fica reservado a sheets e superfícies de tela cheia; evitar cantos de 32 px ou maiores;
- sombras: `xs`, `sm` e `md`, estreitas e de baixa opacidade;
- movimento: 150 ms para feedback imediato, 200 ms como padrão e 250 ms para transições estruturais;
- z-index: dropdown, sticky, backdrop, modal, toast e tooltip em uma escala única.

## Decisões de migração

| Antes | Fenasoja 2028 |
| --- | --- |
| Identidade 2026 baseada em imagens raster nas superfícies principais | Lockup 2028 em SVG/código, nítido em qualquer densidade e sem download de imagem de marca |
| Gradientes, brilho, blur e glassmorphism recorrentes | Superfícies sólidas, bordas discretas e contraste estrutural |
| Cards grandes e repetitivos em grids de vitrine | Faixas de métricas, linhas densas e grupos operacionais |
| Cores locais por componente | Primitives e papéis semânticos centralizados |
| Animações decorativas contínuas e entrada encenada | Movimento curto, funcional e removível por preferência do usuário |
| Destaques com faixas laterais grossas | Ícone, label, estado e ação com hierarquia direta |
| Desktop comprimido no celular | Refluxo estrutural, menu móvel e overlays próprios para a tarefa |
| Exportações com paletas locais | RGB derivado da mesma paleta canônica da interface |

## Aplicação por superfície

### Marca e shell

- Use `FenasojaBrand` para lockup, variante compacta e marca reduzida.
- Sidebar e cabeçalhos estruturais usam Navy; item ativo usa Indigo e/ou Orange de modo localizado.
- O nome visível do produto é “Fenasoja 2028”. Evite reconstruir o lockup com texto e cores locais.
- Em superfícies claras, preserve uma hierarquia simples: título, contexto e ação. Eyebrows são opcionais e não devem aparecer em toda seção.

### Navegação

- Mantenha o mapa de rotas, guards, capabilities e redirecionamentos existente.
- A navegação lateral desktop deve ser estável; no mobile, use um menu acionável por botão com nome acessível.
- O estado ativo precisa ser distinguível por mais de um sinal, como cor e peso/ícone/aria-current.
- Badges devem representar contagem ou estado real. Orange não é ornamento.

### Componentes e superfícies

- Cards padrão têm superfície sólida, borda de 1 px e sombra curta opcional.
- Evite cards aninhados quando separadores, linhas ou agrupamentos semânticos resolvem a hierarquia.
- Não use tilt 3D, cursor glow, grain, grid decorativo ou blur de fundo em componentes operacionais.
- Use badges para estados curtos; use alertas ou texto auxiliar quando houver consequência ou ação necessária.
- Skeletons devem respeitar a geometria do conteúdo e não simular dados.

### Formulários e controles

- Labels permanecem visíveis; placeholder não substitui label.
- Inputs e botões compartilham altura, raio e foco. O alvo interativo deve ter pelo menos 44 × 44 px em telas de toque.
- Erros ficam próximos ao campo, com texto e sem depender apenas de vermelho.
- A ação principal usa `action`; cancelar e voltar permanecem secundários.
- Estados disabled, loading e sucesso precisam preservar o texto ou um nome acessível.

### Dados, tabelas e dashboards

- Priorize leitura operacional: métricas em faixa, cabeçalhos fixos quando úteis, alinhamento de números e densidade previsível.
- Não invente métricas, tendências ou status para preencher layout.
- Gráficos usam `--chart-1..6`; `FENASOJA_2028_CHART_COLORS` espelha a mesma ordem para superfícies não CSS. Legendas e tooltips devem repetir o rótulo, não apenas a cor.
- Em telas estreitas, tabelas podem reordenar conteúdo em linhas ou cartões compactos; nenhuma coluna crítica pode desaparecer sem alternativa.

### Mapa comercial

- Navy, Indigo e Orange compõem o chrome do produto: cabeçalho, busca, ferramentas, painéis e seleção.
- Cores cartográficas, de terreno, ocupação, risco, status físico e geometria mantêm sua semântica própria.
- Não altere projeção, calibração, shapes, coordenadas, entidades, regras comerciais ou pipeline de seleção por motivo visual.
- A referência cartográfica oficial 2026 deve continuar identificada como 2026; a identidade 2028 não reclassifica a origem dos dados.

### Cronograma de eventos

- A moldura do módulo e suas ações seguem a identidade 2028.
- A linha do tempo preserva datas, anos, dependências, marcos e histórico reais do ciclo 2026–2028.
- Eventos históricos devem continuar mostrando seu ano de origem. O label “2028” identifica o produto, não modifica registros.
- Overlays móveis precisam de cabeçalho, rolagem, ação principal e área segura próprios; não são modais desktop reduzidos.

### PDFs, impressão e exportações

- Use `FENASOJA_2028_RGB`; não duplique arrays RGB nos geradores.
- Cabeçalho e rodapé podem usar Navy/Indigo, com Orange ou Gold apenas em chamadas e marcadores.
- Texto deve permanecer selecionável quando o formato permitir, e tabelas precisam repetir cabeçalhos entre páginas.
- Dados, filtros e nomes de arquivo seguem o contexto operacional real. A nova marca não altera cálculos ou conteúdo exportado.
- Revise amostras em A4 e no modo de impressão, incluindo quebras, margens e contraste em escala de cinza.

## Referências 2026 preservadas intencionalmente

“2026” não deve ser substituído de forma global. Permanecem válidos:

- base cartográfica oficial, raster, calibração, fontes e controles de implantação/sincronização do mapa 2026;
- sementes, eventos, datas e arquivos-fonte do cronograma que representam o ciclo histórico 2026–2028;
- período operacional histórico de eventos em maio de 2026 e demais datas persistidas;
- nomes de migrations, fixtures, testes e arquivos que registram proveniência técnica;
- identificadores de tabela, query/cache key, storage key, capability, integração e rota;
- filtros e regras cuja referência a 2026 é parte da lógica de negócio ou do dado real.

Esses casos devem ser contextualizados na interface quando necessário, não rebatizados. Qualquer mudança neles exige uma demanda de dados ou negócio separada.

## Acessibilidade e movimento

- Texto normal deve atingir 4,5:1; texto grande e elementos não textuais essenciais, 3:1.
- Foco por teclado é visível com `--focus-ring` e não pode ser removido sem substituto equivalente.
- Ordem de tabulação acompanha a ordem visual; dialogs, menus e sheets devolvem foco ao acionador.
- Ícones sem texto recebem nome acessível; ícones decorativos são ocultos da árvore de acessibilidade.
- Estados expandido, selecionado, atual e inválido usam os atributos ARIA correspondentes.
- Layouts devem ser verificados sem overflow em 320 px ou mais, com zoom de 200% e sem depender de hover; cenários não exercitados precisam ser registrados no handoff.
- `prefers-reduced-motion: reduce` elimina movimento não essencial e reduz transições ao mínimo.
- Não há animação contínua decorativa. Transições de 150–250 ms comunicam mudança de estado ou contexto.

## Responsividade

- Desktop denso é a referência para operação, especialmente em 1366 × 768 e 1920 × 1080.
- Tablet precisa reordenar navegação, filtros e painéis sem ocultar ações críticas.
- Mobile usa camada estrutural própria: menu, sheets, rodapé fixo quando necessário e `safe-area-inset-*`.
- Quebras e altura útil devem ser verificadas em orientação retrato e paisagem.
- Conteúdo rolável deve ter um único proprietário claro; evite scroll horizontal na página inteira.

## Performance

- Marca principal é SVG/código; assets raster legados de branding não devem entrar no bundle inicial.
- Os rasters de branding em `src/assets/` permanecem versionados apenas como legado histórico. Não são importados pela aplicação nem emitidos pelo build e não devem voltar a ser usados como identidade corrente.
- Blur, filtros e sombras largas são evitados para reduzir custo de composição.
- Lazy loading de rotas e cache/persistência existentes são preservados.
- Movimento usa propriedades baratas (`transform` e `opacity`) apenas quando necessário.
- O build deve ser revisado quanto a chunks, imagens legadas e regressões de tamanho; mudanças de negócio não são uma solução aceitável para regressão visual ou de bundle.

## Matriz de aceite

| Área | Cobertura exigida | Evidência esperada |
| --- | --- | --- |
| Tokens e contraste | Paleta TS, RGB, charts e pares AA | `npm.cmd test -- src/test/fenasojaBrandTokens.test.ts` |
| Build de produção | Aplicação completa | `npm.cmd run build`; sem erro e sem assets raster legados de marca no output |
| Regressão automatizada | Suíte Vitest completa | `npm.cmd test`; toda a cobertura automatizada permanece verde |
| Qualidade estática | Arquivos alterados | ESLint focado e `git diff --check`; dívida global preexistente é reportada separadamente |
| Portal e login | 1366 × 768, 390 × 844 | Marca, foco, formulário, erro e acesso por teclado |
| Dashboard e módulos | 1920 × 1080, 1366 × 768, 768 × 1024, 390 × 844 | Hierarquia, menu, densidade, loading/empty/error e ausência de overflow |
| Formulários e overlays | Tablet e mobile, retrato/paisagem | Labels, validação, teclado, scroll, sheet/modal e áreas seguras |
| Mapa comercial | Desktop, tablet e mobile autenticados | Chrome 2028; geometria, legenda e referência oficial 2026 preservadas |
| Cronograma | Desktop, tablet e mobile autenticados | Ciclo 2026–2028, criação, filtros, timeline e overlays preservados |
| Tabelas e relatórios | 1366 × 768 e 390 × 844 | Cabeçalho, alinhamento, filtros, reflow e conteúdo completo |
| PDFs e impressão | Amostras reais em A4 | Marca/paleta, paginação, cabeçalho repetido, contraste e dados íntegros |
| Acessibilidade | Teclado, zoom 200%, contraste e reduced motion | Sem bloqueio de foco, nome acessível ausente, dependência exclusiva de cor ou animação essencial |
| Performance | Bundle de produção e navegação entre rotas | Sem branding raster legado no bundle inicial; sem regressão perceptível de interação |

Antes da publicação, a PR deve registrar os comandos executados, resultados, viewports inspecionados e qualquer dívida preexistente que não faça parte desta migração.

## Registro da migração — 16/07/2026

### Verificação técnica

- TypeScript: `npx.cmd tsc -p tsconfig.app.json --noEmit` — aprovado.
- Tokens: `npm.cmd test -- src/test/fenasojaBrandTokens.test.ts` — 1 arquivo, 12 testes aprovados.
- Regressão automatizada: `npm.cmd test` — 13 arquivos, 125 testes aprovados.
- Build: `npm.cmd run build` — aprovado com 4.639 módulos; nenhum raster legado de branding foi emitido.
- Integridade do diff: `git diff --check` — aprovado; apenas avisos de normalização LF/CRLF.
- ESLint focado nas fundações e shells novos — aprovado. O lint global permanece exatamente na linha de base herdada: 959 erros e 30 avisos, sem acréscimo desta migração.
- Avisos de build conhecidos: base Browserslist/caniuse-lite com 13 meses e chunks superiores a 500 kB.

### Verificação visual autenticada

- As 18 rotas operacionais principais, 60 rotas compartilhadas das comissões e 9 visões administrativas por comissão foram abertas sem redirecionamento indevido ou overflow horizontal no viewport desktop de referência.
- Dashboard, portal, mapa, cronograma, transportes e relatório foram verificados em 1920 × 1080, 1366 × 768, 768 × 1024, 1024 × 768, 390 × 844 e 430 × 932.
- O limite de 320 × 700 e zoom emulado de 200% também foram exercitados nas seis telas críticas, sem overflow horizontal do documento.
- Menu móvel, seletor de visões do cronograma, formulário de evento em tela cheia, formulário de transporte e calendário expandido foram abertos e fechados sem gravação. O calendário captura o foco, torna o fundo inerte e devolve o foco ao acionador após `Escape`.
- A referência cartográfica oficial 2026, o ciclo 2026–2028 e os registros históricos permanecem identificados; a moldura do produto usa Fenasoja 2028.
- O console final das telas críticas não apresentou erros. Permanecem apenas os dois avisos herdados de future flags do React Router v7.

### Limites registrados

- As duas imagens visuais citadas no briefing não estavam no diretório de anexos; somente `goal-objective.md` estava disponível. O lockup foi derivado da paleta e da direção textual, sem comparação de fidelidade com as imagens ausentes.
- PDFs A4 e impressão não foram renderizados manualmente nesta rodada; geradores, cores centralizadas, testes e build foram verificados.
- Não houve simulação específica de daltonismo nem comparação quantitativa de bundle antes/depois.
- Existem tokens `.dark`, mas não há alternância de tema escuro exposta ao usuário; a validação visual cobriu o tema claro com superfícies inversas Navy.
- A sessão autenticada redireciona as rotas públicas de login aos módulos permitidos; os guards foram preservados, mas o preenchimento do formulário de login não foi repetido para não encerrar a sessão de validação.
