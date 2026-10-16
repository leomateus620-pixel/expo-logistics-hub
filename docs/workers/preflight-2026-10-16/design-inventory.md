# Workers Fenasoja — inventário visual de pré-implementação

Data: 16/10/2026, America/Sao_Paulo.

Este documento registra a inspeção para as Fases 0 e 1 solicitadas em conjunto. Não representa implementação nem aceite de qualquer fase. Não foram criadas telas, mascotes ou estilos dos workers neste levantamento.

## Prioridade das instruções

1. O pedido direto do Leonardo determina o escopo: Fases 0 e 1 juntas, uso de Product Design, animação dos bots, ausência de marketplace e publicação apenas mediante pedido explícito. Ao final da entrega autorizada, deve haver PR e parada antes da Fase 2.
2. As regras do repositório preservam o Mapa Comercial, seus dados históricos, o push FCM e a sincronização Google Calendar. O inventário não requer mudanças nesses módulos.
3. Os anexos fornecem referências visuais e uma proposta técnica. O pedido direto prevalece quando diverge do anexo: a pausa intermediária da “Etapa A” e os exemplos que ativam reduced-motion não substituem a solicitação de Fases 0 e 1 juntas e de ignorar reduced-motion nesta aplicação.
4. A regra do anexo de interromper diante de mudanças alheias no lockfile permanece relevante. A sincronização isolada identificou entradas ausentes de Drizzle/Postgres no lock npm, além das entradas de Motion. A decisão e os números dessa verificação estão no relatório de dependências do preflight; nenhuma instalação no checkout é inferida deste inventário.

Anexos inspecionados como referência: `adendo-ui-workers-fenasoja.md` e `prompt-instalacao-framer-motion.md`, em `/Users/leonardo/Downloads`.

## Tokens existentes

| Área | Evidência | Aplicação nos workers |
| --- | --- | --- |
| Primitivas da marca em OKLCH | `src/styles/tokens.css:23` | Referenciar as primitivas existentes, sem sobrescrevê-las. |
| Âncoras hexadecimais oficiais | `src/lib/fenasoja-brand.ts:14` | Usar em SVG e catálogo quando uma cor concreta for necessária. |
| Fundo, texto, superfícies e semântica | `src/styles/tokens.css:70` | Derivar os tokens locais de superfície, texto, borda e atenção. |
| Foco | `src/styles/tokens.css:112`; `src/index.css:51` | Reaproveitar `--ring` com anel de 2px e offset. |
| Raios | `src/styles/tokens.css:134`; `tailwind.config.ts:102` | Criar raios locais 12/16/24px e pill quando o briefing exigir. |
| Elevação 0–4 e aliases de sombra | `src/styles/tokens.css:137` | Reaproveitar contato e sombra ambiente em cards, composer e sheets. |
| Vidro e blur | `src/styles/tokens.css:162`; `src/index.css:3128` | Reservar vidro a barras e cards sobre gradiente; conservar fallback sólido. |
| Motion | `src/styles/tokens.css:173` | Existem 90/150/210/320/420ms; criar tokens locais 120/200/320ms para o briefing. |
| Easing, lift e press | `src/styles/tokens.css:179` | Há easing e lift de -2px; não alterar valores globais. |
| Tema escuro | `src/styles/tokens.css:195`; `tailwind.config.ts:6` | Respeitar a classe `.dark` já suportada pelo CSS. |
| Tipografia | `tailwind.config.ts:18`; `src/index.css:1` | Inter; números tabulares nos KPIs. |
| Entrada dos estilos | `src/main.tsx:5` | Tokens globais são carregados antes de `src/index.css`. |
| Utilitários semânticos | `src/lib/design-system.ts:1` | Reutilizar elevação, foco e superfícies quando compatíveis. |

Paleta confirmada: indigo `#121D85`, navy `#031834`, orange `#F2751A`, darkOrange `#E67E09`, gold `#F9C121`, lightGold `#FAD954`, cream `#F5E6CD`, softWhite `#F9FAFB`, blue `#1A6CCB`, green `#089D7E` e mutedIndigo `#534D90`.

Não há sistema global de tema ativo identificado no código de entrada: a busca em `src` não encontrou `ThemeProvider` ou `setTheme`; `src/components/ui/sonner.tsx:1` consome `useTheme`. A existência de `next-themes` e de CSS escuro não comprova um seletor funcional. A implementação deve herdar `.dark`; a demonstração local dos dois temas pode ficar na revisão de design, sem criar um sistema global novo.

## Tokens e isolamento propostos

Arquivo futuro: `src/features/workers/styles/worker-tokens.css`, aplicado por `.workers-scope`.

- Superfície, frame, acento, atenção, texto e cores por worker: `--worker-surface`, `--worker-frame`, `--worker-accent`, `--worker-attention`, `--worker-ink`, `--worker-color`, `--worker-color-light` e `--worker-color-shadow`.
- Espaços locais em 4/8/12/16/24/32/48/64px, com nomes `--worker-space-*`.
- Raios e motion com o mesmo prefixo: `--worker-radius-*`, `--worker-duration-*` e `--worker-ease`.
- O adendo exemplifica `--space-*` e `--w-*`, mas também determina que tokens novos tenham prefixo `--worker-*`. A proposta usa o prefixo explícito mais restritivo e mantém o mesmo significado visual.
- O gradiente claro proposto no anexo combina azul-claro, softWhite e creme/laranja suave; a variante escura deriva de navy e indigo.

Escala tipográfica prevista: display 40/48px no desktop e 32/40px no mobile; H2 24/32; H3 18/26; corpo 16/24; legenda 13/18. Breakpoints: base 360–430px, md 768px, lg 1024px, xl 1280px; conteúdo até 1200px.

## Componentes: reutilização e lacunas

Foram encontrados 49 arquivos TSX em `src/components/ui`. Os componentes específicos dos workers ainda não existem.

| Necessidade | Base existente | Complemento local necessário |
| --- | --- | --- |
| Cards e informações | `card.tsx`, `badge.tsx`, `table.tsx`, `tooltip.tsx` | WorkerCard, WorkerChip, ResultChip e conteúdo de permissões. |
| Navegação e atalhos | `command.tsx`, `tabs.tsx`, `scroll-area.tsx` | Atalho Ctrl/Cmd+K, escolha de worker e navegação do workspace. |
| Copiloto e painéis | `sheet.tsx`, `drawer.tsx`, `dialog.tsx`, `resizable.tsx` | Shell contextual e tratamento de safe-area. |
| Composer | `textarea.tsx`, `button.tsx`, `popover.tsx` | Menções, envio, contexto, consentimento e estados disponíveis nesta fase. |
| Respostas | `collapsible.tsx`, `separator.tsx`, `progress.tsx` | ProgressSteps, citações, chips, SystemEvent e RunDivider. |
| Carregamento, vazio e falha | `skeleton.tsx`, `alert.tsx` | Skeletons e EmptyState próprios dos workers. |
| Ação confirmada | `card.tsx`, `alert-dialog.tsx` | ActionCard para a Fase 2; a revisão visual pode demonstrar estados sem executar ações. |
| Mascotes | Não há implementação de workers | WorkerMascot, formas SVG, vida, pausa e catálogo próprios. |

O botão padrão tem altura de 44px (`src/components/ui/button.tsx:20`); o tamanho `icon` tem 40px (`:23`). Controles de ícone dos workers precisam de classe local de pelo menos 44×44px. Não é necessário modificar o componente compartilhado.

O Skeleton existente usa pulse (`src/components/ui/skeleton.tsx:4`). Um wrapper local pode fornecer a aparência do briefing. O foco, a semântica de dialog/sheet e a navegação por teclado devem reaproveitar os primitives existentes.

## Contraste: correção necessária no adendo

Cálculo de luminância relativa conforme WCAG, com as cores oficiais opacas sobre branco `#FFFFFF`:

| Cor | Contraste aproximado | Texto normal AA (4,5:1) |
| --- | ---: | --- |
| Navy `#031834` | 17,73:1 | Passa |
| Muted indigo `#534D90` | 7,42:1 | Passa |
| Blue `#1A6CCB` | 5,18:1 | Passa |
| Green `#089D7E` | 3,42:1 | Não passa |
| Orange `#F2751A` | 2,86:1 | Não passa |
| Dark orange `#E67E09` | 2,86:1 | Não passa |
| Gold `#F9C121` | 1,66:1 | Não passa |

Apesar do nome, darkOrange não resolve o contraste de texto pequeno sobre branco sugerido no adendo. Para texto, usar navy/indigo ou variante local comprovadamente mais escura; preservar cores vivas em mascotes, fundos e acentos. Chips e estados devem ser medidos sobre seus fundos efetivos nos dois temas.

## Motion e dependências verificadas

- `package.json:76` e `:78`: React/ReactDOM `^18.3.1`; `:119`: Vite `^5.4.19`; `:117`: TypeScript `^5.8.3`.
- Não há `motion` ou `framer-motion` declarados no pacote nem entradas nos lockfiles textuais inspecionados. Há GSAP `^3.15.0` (`package.json:65`), portanto a alegação ampla de ausência de bibliotecas de animação precisa dessa ressalva.
- Os três lockfiles mencionados existem: `bun.lock`, `bun.lockb` e `package-lock.json`.
- `package.json:106`, `:107` e `:115` declaram Drizzle Kit, Drizzle ORM e Postgres; essas declarações estão ausentes do `package-lock.json:86`, mas presentes em `bun.lock:96`. A dívida já é descrita em `AGENTS.md:25`.
- O [registry npm oficial de motion@14.3.0](https://registry.npmjs.org/motion/14.3.0) retornou a versão solicitada em 16/10/2026, com peer dependencies `react` e `react-dom` em `^18.0.0 || ^19.0.0`. Suas dependências diretas são `framer-motion: 14.3.0` e `tslib: ^2.4.0`.
- O [endpoint oficial de latest](https://registry.npmjs.org/motion/latest), consultado na mesma inspeção, também informou `14.3.0`. A versão fixada é compatível com React 18 do projeto. Isso verifica o pacote; não comprova instalação, bundle ou desempenho.

## Estratégia de implementação após resolver o preflight

1. Carregar `WorkersRoot` por `lazyWithRetry` (`src/lib/lazyWithRetry.ts:10`) nas rotas dos workers. Manter imports de `motion/react` dentro de `src/features/workers/**` e carregar o copiloto sob demanda, para que a biblioteca não entre no caminho inicial das telas existentes.
2. Usar `LazyMotion` com `strict` e `m.*`. Começar com `domAnimation`; carregar `domMax` apenas caso a solução aprovada de shared layout precise dele e medir esse custo separadamente.
3. Construir mascotes como SVG inline com gradientes e sombra de contato; animar somente transform/opacity. Usar seeds, timers limpos, pausa fora da tela/em aba oculta e um store de ponteiro compartilhado, sem re-render React por frame.
4. Aplicar a instrução direta de animação sem redução nos workers, mantendo todas as regras globais existentes. `src/index.css:3470` contém redução global com `!important`; animações CSS locais precisariam considerar essa cascata. Um provider Motion local com `reducedMotion="never"` evita mudar a política das demais telas.
5. Evitar números operacionais de demonstração apresentados como dados reais. No chat de leitura, resultados e links devem vir das tools autorizadas; rotinas, ações e customização administrativa permanecem nas fases correspondentes.
6. Medir antes/depois: chunk inicial (limite solicitado +1KB gzip), chunks lazy, pacote próprio dos mascotes, FPS com 12 mascotes e CLS do streaming. O orçamento do código próprio dos mascotes deve ser distinguido do vendor Motion lazy.
7. Produzir screenshots em 390×844 e 1280×800, claro/escuro, e comparações das telas existentes quando houver implementação e sessões adequadas. Este inventário não contém nem declara essas evidências.

## Limites deste relatório

Não houve alteração em tokens globais, componentes compartilhados, rotas, Sidebar, Mapa Comercial, FCM ou Google Calendar. Não houve publicação. Não foram executados screenshots, auditoria axe, perfil de FPS ou medição de bundle dos workers, pois a implementação não começou. A continuidade depende da resolução dos bloqueios reais listados no preflight geral.
