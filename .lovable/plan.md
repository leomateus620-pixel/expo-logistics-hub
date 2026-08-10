# Agenda — redesenho dos cards de evento

Objetivo: elevar o design, a tipografia e a hierarquia de informação da lista de eventos da Agenda (Restaurante e Arena), destacando Data, Horário (início–fim), Empresa, Área/Espaço e Status (Confirmado/Solicitado).

## O que muda visualmente

Cada dia da agenda continua agrupado, mas com um cabeçalho de dia mais forte:
- Dia da semana em caixa alta com tracking amplo, número do dia em destaque tipográfico grande e mês/ano discretos ao lado.
- Marcador de trilha (timeline) com ponto e linha contínua, na cor do ambiente ativo (dourado para Restaurante, azul para Arena).

Cada evento vira um card com quatro zonas claras:

```text
┌───────────────────────────────────────────────────────────────┐
│ ▍ 19:00      Evento Sicredi                    [ Confirmado ] │
│ ▍ 22:00      Sicredi · Restaurante Fenasoja              ›    │
│ ▍ 3h         [Área: Salão Principal] [Empresa: Sicredi]       │
└───────────────────────────────────────────────────────────────┘
```

- **Bloco de horário** à esquerda: hora de início em tipografia tabular grande, hora de término abaixo em menor peso e, quando houver as duas, a duração calculada ("3h", "1h30"). Quando não houver término, mostra apenas o início.
- **Título** do evento com maior peso e melhor leading.
- **Metadados em chips**: Área/Espaço (ícone de mapa) e Empresa/Solicitante (ícone de prédio). Quando não houver vínculo, o chip aparece em estado neutro "Sem vínculo" em vez de texto solto.
- **Status** como pílula 3D à direita (Confirmado = verde, Solicitado = âmbar, Cancelado = vermelho), com barra lateral colorida no card refletindo o mesmo status.
- Card inteiro clicável, com hover/foco elevando sombra e deslocando o chevron; foco visível por teclado.

Elementos de identidade do módulo: gradientes sutis por ambiente, textura leve de vidro (liquid glass) nos cards, e a barra lateral de status como âncora visual da lista. Sem alterar cores fora dos tokens do projeto.

## Responsivo

- Desktop: horário, conteúdo, chips e status na mesma linha.
- Mobile: horário no topo em linha com o status; título abaixo; chips em wrap com alvos de toque de 44px.

## Detalhes técnicos

- `src/components/venue-events/VenueWorkspace.tsx` (`renderAgenda`, ~linhas 1329-1388): reescrever o markup de cada item para a nova estrutura semântica (bloco de tempo, título, chips, status), incluindo `end_at` e duração; nenhuma mudança de consulta ou lógica de dados.
- Formatação de horário/duração via helpers já existentes em `src/lib/venue-agenda` (ou funções locais puras, se não houver), sempre em `America/Sao_Paulo`.
- `src/styles/venue-events.css`: substituir os estilos `.venue-agenda-timeline` (~685-810, mais os blocos responsivos em 2929-2960 e 3092) pelo novo sistema de card, mantendo os tokens semânticos e as variantes por ambiente.
- Nenhuma alteração de banco, RLS ou hooks.
