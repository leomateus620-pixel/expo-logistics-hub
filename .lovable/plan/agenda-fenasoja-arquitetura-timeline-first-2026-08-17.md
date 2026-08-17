# Agenda Fenasoja — Arquitetura timeline-first

Refatoração completa de layout do módulo Cronograma e Eventos: a linha do tempo passa a ocupar praticamente toda a tela, e todo o resto (Google Agenda, preparação do ciclo, resumo da semana, novo evento, Dashboard/Pendências/Calendário/Concluídos, progresso do ciclo) vira controle compacto no topo azul ou dentro da barra de filtros da timeline.

## 1. Topo azul = camada executiva de comando

Barra única, altura reduzida (~56px desktop), contendo da esquerda para a direita:

- Voltar ao Portal (ícone) + ícone da agenda (mantém a marca gráfica).
- Remoção do texto "Agenda Fenasoja" (wordmark sai; o ícone identifica o módulo).
- Buscador deslocado para a esquerda, mais estreito e discreto; no mobile ele colapsa em ícone que expande em campo full-width.
- Ícone dedicado do Google Agenda com semáforo de estado: vermelho = desconectado, verde = conectado, âmbar = sincronizando. Clique abre um popover compacto com status, conta e ações (conectar / desconectar / sincronizar) — mesmas ações do widget atual.
- Indicador compacto de Preparação 2026–2028: anel/percentual pequeno com tooltip/popover trazendo data final, progresso e etapa.
- Resumo da semana mantido, em formato de pílula reduzida.
- Botão premium "Novo evento" no canto direito (ícone + rótulo curto, vira só ícone em telas menores), abrindo exatamente o fluxo de criação atual.
- Sair.

Cards grandes removidos da área principal: `CronogramaOperationalHeader` (Preparação + Google Agenda) e `CronogramaRegistrationAction` (barra horizontal Novo evento).

## 2. Navegação secundária discreta

- A faixa de abas grandes (Dashboard, Linha do tempo, Concluídos, Pendências, Calendário) sai da navegação principal.
- No canto superior esquerdo da área de conteúdo, junto aos filtros, entra uma barra compacta de ícones: Dashboard, Pendências, Calendário e Sem data — expansível (tooltip/rótulo ao abrir) e com estado ativo claro.
- A timeline é a visão padrão ao entrar no módulo.
- "Concluídos" deixa de ser menu concorrente: vira alternância dentro da própria timeline (chip "Incluir concluídos" / "Somente concluídos") na barra de filtros, reaproveitando a variante `completed` já existente do board.

## 3. Progresso do ciclo compacto

- O card lateral vertical "Progresso do ciclo / Ciclo 2026–2028" sai do formato atual.
- Vira um seletor compacto na barra de filtros da timeline: chips 2026 · 2027 · 2028 com contagem e etapa, mais um popover com o detalhe do progresso. Mantém a mesma função de selecionar ano e filtrar o ciclo.
- Com a coluna lateral eliminada, a timeline usa 100% da largura útil.

## 4. Timeline expandida

- Largura total (até ~1760px) e altura maior; a barra de período (mês em foco, "Ir para hoje", anterior/próximo) fica alinhada com filtros e ícones secundários em uma única linha de comando.
- Hierarquia reforçada: bloco "Hoje" em destaque, seguido de próximos eventos; passados/concluídos com peso visual reduzido, ainda acessíveis.
- Refino tipográfico e de espaçamento nos cards de evento: data/hora com maior peso, título dominante, chips de comissão/responsáveis mais leves, densidade maior sem perda de legibilidade.

## 5. Mobile e responsivo

- Mobile: topo azul compacto com ícone da agenda, busca colapsável, ícone Google Agenda com semáforo, progresso em micro-indicador e FAB/botão de Novo evento; navegação secundária como linha de ícones acima da timeline.
- Validação visual em widescreen, notebook (~1280), tablet (~834) e mobile (~390), verificando overflow, alinhamento, sobreposição, áreas de toque, abertura/fechamento de popovers e drawers e comportamento de scroll.

## Detalhes técnicos

Arquivos principais:
- `src/components/cronograma-eventos/CronogramaModuleShell.tsx` — reestruturação da barra azul; novos slots para Google Agenda, progresso, novo evento.
- Novos: `CronogramaGoogleStatusButton.tsx` (popover reaproveitando a lógica de `GoogleCalendarHeroWidget` / `useGoogleCalendarConnection`), `CronogramaPreparationPill.tsx` (usa `useFenasojaCycleProgress`), `CronogramaSecondaryNav.tsx` (ícones Dashboard/Pendências/Calendário/Sem data), `CronogramaCycleChips.tsx` (substitui `TimelineCycleNavigator`).
- Contexto leve para expor a ação "Novo evento" e a visão ativa da página para o shell (padrão já usado em `CronogramaSearchContext` / `CronogramaFiltersSlot`).
- `src/pages/CronogramaEventosPage.tsx` — remove `CronogramaCommandHeader`, `CronogramaRegistrationAction` e `CronogramaViewTabs` do fluxo desktop; timeline como visão padrão; `completed` passa a ser modo da timeline.
- `src/components/cronograma-eventos/CronogramaTimelineBoard.tsx` — remove a coluna lateral do ciclo e monta a barra de comando (nav secundária + filtros + chips de ciclo + navegação de período).
- Mobile: `mobile/MobileCronogramaHeader.tsx` e `mobile/MobileCronogramaNavigation.tsx` alinhados ao novo modelo.
- CSS: `cronograma-timeline-recovery.css`, `cronograma-timeline-flagship.css`, `cronograma-operational-header.css` (enxugado), `cronograma-header-search.css`, mais um arquivo para os novos controles do topo. Sem cores hardcoded — tokens do design system.

Preservado sem alteração: hooks de dados, RLS/escopo por usuário, criação/edição de eventos, drawer, workspace de relacionamentos, inteligência de reuniões, sincronização Google e filtros existentes. Testes em `src/test/cronograma*` serão ajustados aos componentes que mudarem de forma.
