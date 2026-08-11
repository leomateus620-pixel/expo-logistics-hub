# Cronograma — barras não acompanham mais a rolagem no desktop

## Diagnóstico (confirmado no código)

No desktop (≥900px), três barras com `position: sticky` e offsets calibrados para o layout antigo (quando o cabeçalho do módulo era fixo) ficam flutuando sobre o conteúdo ao rolar a página:

1. **Barra de abas** (Dashboard / Timeline / Concluídos / Pendências / Calendário — `.cronograma-command-dock`): `sticky top-[84px] z-20` inline em `CronogramaEventosPage.tsx:1003`. Gruda a 84px do topo e os cards deslizam por baixo do vidro translúcido (prints da Timeline, Concluídos e Calendário).
2. **Barra azul "Visão operacional"** (`.cronograma-cycle-bar`): fica sticky **por acidente** — compartilha a classe `.cronograma-cycle-navigator`, que recebe `position: sticky` + `top: 14.75rem` em telas ≥1180px (`src/index.css` ~998 + `cronograma-operational-overrides.css:20`). Por isso trava no meio da tela sobre os gráficos do Dashboard (print 2) e nas visões Pendências/Calendário.
3. **Barra do mês "Ir para hoje"** (`.cronograma-temporal-nav`): sticky com `top: 14.75rem` (`cronograma-timeline-recovery.css:154`) — flutua ~236px abaixo do topo cobrindo os eventos. O scroll automático para o mês atual usa `scroll-margin-top: 18.75rem` (300px), calibrado para a pilha antiga de barras — resultado: o mês atual "desce" junto e fica encoberto.

No mobile nada disso acontece porque abaixo de 900px o app usa outra árvore de componentes (`MobileCronograma*`), que não renderiza essas barras — por isso "no mobile está normal".

## Mudanças

### 1. Barras voltam a rolar junto com o conteúdo (apenas CSS)

Arquivo: `src/styles/cronograma-timeline-recovery.css` (camada de recovery, carregada depois dos estilos legados — nenhum CSS posterior reintroduz sticky nesses elementos; verificado).

- **Barra do mês**: remover `position: sticky` do bloco `.cronograma-page .cronograma-temporal-nav` (linha ~154), mantendo todo o visual (bordas, gradiente, sombra).
- **Novo bloco `@media (min-width: 900px)`** (só desktop, mobile intacto):
  - `.cronograma-page .cronograma-command-dock { position: static; }` — barra de abas rola junto com a página (especificidade 0,2,0 vence o `.sticky` do Tailwind).
  - `.cronograma-page .cronograma-cycle-bar { position: static; }` — barra azul "Visão operacional" deixa de grudar sobre Dashboard/Pendências/Calendário.
  - `.cronograma-page .cronograma-month-section, .cronograma-page .cronograma-year-empty-state { scroll-margin-top: 0.75rem; }` — como não há mais barras fixas, o scroll automático ("Ir para hoje" e a abertura da Timeline) posiciona o mês rente ao topo, sem o deslocamento de 300px.
- **`@media (min-width: 1180px)`**: `.cronograma-page .cronograma-timeline-shell .cronograma-cycle-navigator { top: 0.75rem; }` — a coluna lateral "Progresso do Ciclo" continua fixa (ela tem coluna própria, não cobre conteúdo), mas gruda no topo em vez de flutuar a 236px.

Nenhuma mudança em componentes TSX e nenhuma mudança abaixo de 900px (mobile continua exatamente como está).

### 2. Feriados voltaram ao banco — limpeza novamente

O print do Calendário mostra "Feriado municipal" em 01/05/2028. Query confirmou: **30 registros de feriado retornaram** (2026-06-04 → 2028-06-15), embora o seed e os tipos já tenham sido limpos. Causa provável: o hook `useCronogramaEventos` re-seeda automaticamente "eventos oficiais faltantes" — um cliente com bundle antigo cacheado (service worker) os recriou. O código atual não os recria mais.

- **Migração SQL** (submetida para aprovação):
  ```sql
  DELETE FROM public.cronograma_eventos
  WHERE event_type = 'feriado'
     OR category = 'Feriados e datas especiais';
  ```
  Todas as tabelas filhas têm `ON DELETE CASCADE` — a exclusão é limpa.

## Detalhes técnicos

- Cascata garantida: `timeline-recovery.css` é importado por `CronogramaEventosPage.tsx` depois de `index.css` e `cronograma-operational-overrides.css`; os únicos `sticky` em CSS posterior são do workspace do evento (fora do escopo).
- Regras mobile existentes (`top: 64px` da dock, `scroll-margin-top` de 19.5rem/21.5rem) ficam intactas abaixo de 900px.
- Mudança é CSS-only + 1 migration; risco baixo, sem alteração de lógica.

## Validação

1. Query confirmando 0 eventos de feriado no banco.
2. Typecheck limpo.
3. Playwright (se houver sessão ativa; caso contrário, após seu próximo login): nas 5 visões (Dashboard, Timeline, Concluídos, Pendências, Calendário), rolar a página e confirmar que nenhuma barra sobrepõe o conteúdo; na Timeline, confirmar que "Ir para hoje" e a carga inicial posicionam o mês atual visível no topo; conferir que a lateral "Progresso do Ciclo" acompanha sem cobrir nada; validar que o mobile (<900px) segue inalterado.
