# Cronograma: seletor enxuto, timeline padrão e barra com grãos de soja

## 1. Reduzir o seletor de visões

Manter apenas: Dashboard, Linha do tempo, Concluídos, Pendências e Calendário.
Remover "Por ano", "Por categoria" e "Reuniões centrais" do seletor (desktop e mobile), incluindo os blocos de conteúdo dessas visões que hoje só são acessíveis por elas.

## 2. Linha do tempo como visão inicial

Ao entrar no módulo sem parâmetro de visão, o sistema abre direto na Linha do tempo em vez do Dashboard. O Dashboard continua acessível pelo seletor. Links antigos com `?view=year|category|meetings` passam a cair na Linha do tempo em vez de quebrar.

## 3. Remover o card "Ciclo oficial · Fenasoja 2028 · 2026—2028"

Retirar o chip do canto direito da barra superior do módulo, reequilibrando o espaçamento entre o título e o botão "Sair".

## 4. Barra superior fixa com estética de grãos de soja

A barra azul fixa ganha uma camada decorativa: grãos de soja dourados em profundidade (variação de tamanho, opacidade e leve desfoque), com brilho suave e halo quente à direita, mantendo o azul institucional como base. O texto e os botões continuam legíveis (contraste AA), a camada fica atrás do conteúdo, sem capturar cliques, e é suavizada em telas pequenas e com `prefers-reduced-motion`/`reduced-transparency`.

## Detalhes técnicos

- `src/components/cronograma-eventos/cronogramaViews.ts`: remover as 3 definições; `resolveCronogramaView` retorna `'timeline'` como padrão e normaliza valores legados.
- `src/components/cronograma-eventos/types.ts`: retirar `'year' | 'category' | 'meetings'` de `CronogramaView`.
- `src/pages/CronogramaEventosPage.tsx`: remover os blocos `activeView === 'year' | 'category' | 'meetings'` e componentes que ficarem sem uso.
- `src/lib/cronograma-timeline.ts`: `buildCronogramaViewSearchParams` deve omitir `view` para `'timeline'` (padrão) e gravar `view=overview` explicitamente.
- `src/components/cronograma-eventos/CronogramaModuleShell.tsx`: remover o chip `cronograma-module-chip-3d`.
- `src/index.css`: novo pseudo-elemento decorativo em `.cronograma-module-bar` com o padrão de grãos (SVG/gradientes em camadas, `z-index: 0`, `pointer-events: none`), preservando o `sticky` e o blur atuais.
- Ajustar os testes que referenciam as visões removidas ou a visão padrão (`src/test/cronogramaTimeline.test.tsx`, `cronogramaRouteRecovery.test.tsx`, `cronogramaMobilePresentation.test.tsx` se aplicável).
