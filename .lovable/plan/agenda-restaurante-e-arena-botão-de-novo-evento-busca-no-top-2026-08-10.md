# Agenda Restaurante e Arena: botão de novo evento, busca no topo e filtros em ícone

Reorganização da faixa de comando do módulo: ação principal em barra larga sob o seletor de espaços, busca promovida ao cabeçalho e filtros recolhidos em um painel acionado por ícone.

## 1. Botão "Novo evento" em barra larga

- Nova barra horizontal logo abaixo do seletor Restaurante/Arena, ocupando 100% da largura do container.
- Toda a superfície é clicável (um único `button`), abrindo o mesmo formulário de criação já usado hoje (`startNewEvent`), com o espaço/ambiente ativo já vinculado.
- Design inspirado no "Novo evento" da Agenda Fenasoja: placa com ícone à esquerda, título forte + linha de apoio ("Cadastrar evento na Agenda Restaurante" / "…na Agenda Arena"), seta à direita, profundidade sutil e cor de ambiente (âmbar para Restaurante, azul para Arena).
- Altura mínima 64 px (56 px no mobile), foco visível, `aria-label` descritivo, e ocultação automática quando o usuário não tem permissão de criação.

## 2. Buscador no cabeçalho

- O campo "Buscar evento, solicitante ou patrocinador" sai da barra de filtros da agenda e passa para o cabeçalho escuro, ao lado do título "Agenda Restaurante e Arena".
- Versão compacta: altura 36 px, vidro translúcido sobre o navy, borda sutil, brilho discreto no foco, ícone de lupa e botão de limpar.
- Desktop: ao lado do título. Mobile: linha própria abaixo do título, largura total, altura 44 px.
- Mesmo comportamento de filtragem atual, com debounce curto.

## 3. Filtros em ícone expansível

- O seletor "TODAS AS ÁREAS" e demais controles da linha de filtros passam para um botão-ícone (funil) posicionado ao lado dos controles de período da agenda.
- Ao clicar, abre painel (popover no desktop, drawer inferior no mobile) com: Área/espaço, e os controles de período (Dia/Semana/Mês, data de referência, Hoje, navegação anterior/próximo) reunidos.
- Badge dourado com contador de filtros ativos; ícone com leve rotação no estado aberto; ação "Limpar filtros" quando houver algo aplicado.

## 4. Janela selecionada mais enxuta

- O bloco "Janela selecionada / Ocupação encontrada / Compartilhados" vira uma linha compacta de chips (texto menor, altura reduzida), posicionada logo abaixo do cabeçalho da agenda, alinhada à esquerda.
- Mantém os mesmos dados e o `role="status"` para leitores de tela.

## 5. Filtro padrão mensal

- O modo padrão da agenda passa de "Semana" para "Mês" ao abrir o módulo.

## Detalhes técnicos

- `VenueWorkspace.tsx`: novo bloco de ação abaixo do `venue-command-hero`, chamando `startNewEvent`; `agendaMode` inicial `"mes"`; remoção da `.venue-filter-bar` atual, com busca e filtros migrados; `venue-agenda-period` reduzido a chips.
- Novo contexto leve `VenueSearchContext` (provider em `VenueModuleShell.tsx`, consumo em `VenueWorkspace.tsx`) para o campo de busca viver no cabeçalho; fallback silencioso se ausente.
- Novo componente `VenueHeaderSearch.tsx` renderizado no `venue-module-shell__bar`.
- Novo componente `VenueAgendaFiltersTrigger.tsx` (Popover + Drawer mobile) espelhando o padrão de `CronogramaFiltersTrigger.tsx`.
- Estilos em `src/styles/venue-events-production.css` (barra de ação, chips da janela, painel de filtros) e `src/styles/venue-events-shell.css` (busca no cabeçalho).
- Atualizar `src/test/venueEventsPresentation.test.ts` com as novas asserções de apresentação.
- Validação com Playwright em 390x844 e 1440x900: abrir/fechar filtros, criar evento pela barra, buscar pelo cabeçalho, conferir ausência de overflow horizontal.
