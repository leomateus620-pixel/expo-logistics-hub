# Agenda Restaurante e Arena — registro de eventos mais limpo e organizado

## 1. Remover o card "Organização ativa"

O bloco escuro "ORGANIZAÇÃO ATIVA / Fenasoja 2028" sai do cabeçalho do módulo. A área de ações do topo fica apenas com o botão "Sair", liberando espaço para a busca principal ao lado do título.

## 2. Cabeçalho de "Todos os eventos"

```text
REGISTRO MESTRE                                  [2026] 2027  2028   ⚙ Filtros (2)
Todos os eventos · Restaurante                                       97 de 97
```

- Ao lado de "Todos os eventos" aparece o nome do ambiente ativo — "Restaurante" ou "Arena" — em peso menor e cor do ambiente (dourado / azul).
- Ao trocar de espaço no seletor, a palavra faz uma transição animada (a antiga desliza e desfoca para cima, a nova entra por baixo, com um brilho breve na cor do ambiente). Essa animação é intencionalmente mantida mesmo com preferência de movimento reduzido, apenas encurtada.
- À direita do título entra um seletor segmentado de recorte temporal: **2026 · 2027 · 2028**, em pílulas compactas, com indicador deslizante e contagem de eventos por ano em superscrito discreto. Padrão: ano corrente do ciclo (2026).

## 3. Filtros em ícone

A barra larga de filtros atual (busca + status + área + ano + Revisar) é removida. Em seu lugar, um botão-ícone "Filtros" no mesmo padrão do menu Agenda (popover no desktop, drawer no mobile), com badge dourado de filtros ativos, contendo:

- Status do evento
- Área / espaço
- Alternância "Somente revisar (N)"
- Alternância "Incluir histórico (até 2025)"
- Ação "Limpar filtros"

A busca deixa de existir dentro da lista: passa a usar o campo já existente no topo, ao lado de "Agenda Restaurante e Arena" (mesmo contexto de busca compartilhado).

## 4. Eventos anteriores a 2026 viram histórico

Por padrão, a lista mostra apenas eventos de 2026 em diante. Eventos de 2025 e anteriores ficam acessíveis pela alternância "Incluir histórico" no painel de filtros, e quando ligada aparecem em um grupo separado marcado como "Histórico". O seletor de anos oferece somente 2026, 2027 e 2028.

## 5. Cards de evento no padrão da Agenda

Cada linha vira um card com a mesma linguagem dos cards da aba Agenda:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ▍ 11:00   Almoço de Ideias                            [ Confirmado ] │
│ ▍ 15:00   [Área: Restaurante Fenasoja] [Empresa: Acisap]             │
│ ▍ 4h      [Resp.: Não definido] [Sem contrapartida]              ›   │
└──────────────────────────────────────────────────────────────────────┘
```

- Bloco de horário à esquerda com data (dia/mês), início, término e duração em tipografia tabular.
- Título em destaque, com chips de Área e Empresa (ícones de mapa e prédio) e chips secundários para Responsável e Contrapartida.
- Status em pílula 3D à direita, com barra lateral colorida no card refletindo o status; ícone de conflito quando houver.
- Agrupamento mensal mantido, com cabeçalho de mês tipográfico e contador.
- Card inteiro clicável, hover elevado, foco visível por teclado, e no mobile o horário/status vão para o topo com chips em wrap.

## Detalhes técnicos

- `VenueModuleShell.tsx`: remover o bloco `venue-module-shell__organization`; limpar os estilos correspondentes em `venue-events-shell.css` e ajustar o layout do topo para dar mais largura à busca.
- Novo `VenueEventsFiltersTrigger.tsx` espelhando `VenueAgendaFiltersTrigger.tsx` (Popover + Drawer, badge de contagem).
- Novo `VenueEventsYearSelector.tsx` (segmented control 2026–2028).
- `VenueWorkspace.tsx`: remover `venue-filter-bar--agenda` de `renderEvents`; estado `yearFilter` passa a padrão `"2026"` com novo estado `includeHistory` (default `false`) filtrando `eventYear(event) >= "2026"`; `availableYears` fixado em 2026/2027/2028; substituir `EventRow` por um novo card `venue-event-card` alinhado ao `venue-agenda-card`; título do painel recebe o rótulo do ambiente com `key` no elemento para disparar a animação de troca.
- Estilos novos em `src/styles/venue-events.css` (card, seletor de anos, animação de troca de ambiente) e ajustes em `venue-events-production.css` (cabeçalho do painel em duas zonas).
- Atualizar `src/test/venueEventsPresentation.test.ts` com asserções da nova estrutura.
- Validação com Playwright em 390x844 e 1440x900: troca de ambiente, seletor de anos, popover/drawer de filtros e ausência de overflow horizontal.
