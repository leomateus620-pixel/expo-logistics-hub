# Registro mestre — data e horário separados, rótulo de ambiente em card

## 1. Bloco de tempo dividido em duas colunas

Hoje data, início, fim e duração ficam empilhados no mesmo espaço estreito. Passa a haver duas zonas independentes, lado a lado, com divisória sutil entre elas:

```text
┌──────────┬────────────┬───────────────────────────────┬──────────────┐
│   14     │  19:00     │ Evento Sicredi                │ [Confirmado] │
│   JAN    │  ─         │ [Área] [Empresa] [Resp.]      │        ›     │
│   2026   │  23:30 4h30│                               │              │
└──────────┴────────────┴───────────────────────────────┴──────────────┘
```

- **Coluna Data**: dia em tipografia grande tabular, mês em caixa alta com tracking, ano discreto abaixo. Fundo de placa levemente elevada (liquid glass), cantos arredondados, brilho na cor do ambiente (dourado no Restaurante, azul na Arena).
- **Coluna Horário**: início em destaque na cor do ambiente, traço vertical/conector, término abaixo em peso menor e a duração como pílula compacta ao lado do término — nunca empilhada em quatro linhas.
- As duas colunas têm larguras fixas e alinhamento vertical consistente, então todos os cards da lista ficam perfeitamente alinhados na mesma grade.
- Sem horário definido: a coluna de horário mostra um estado neutro "Horário a definir" em vez de "--:--".

## 2. Rótulo do ambiente ao lado de "Todos os eventos"

O texto amarelo solto "Restaurante" some. No lugar entra uma pílula com moldura:

- Placa arredondada com borda, fundo translúcido e leve profundidade (sombra interna + realce superior), com um ponto indicador na cor do ambiente antes do nome.
- **Restaurante**: âmbar/dourado escurecido para contraste legível (não o amarelo atual), texto em tom escuro sobre fundo âmbar suave.
- **Arena**: azul índigo com fundo azul suave.
- A animação de troca de ambiente é mantida, agora aplicada à pílula inteira (entra por baixo com leve desfoque e um brilho breve na cor do ambiente).
- No modo escuro, os tons invertem para fundo translúcido escuro com texto claro, mantendo contraste AA.

## Detalhes técnicos

- `src/components/venue-events/VenueWorkspace.tsx` (`renderEvents`, ~1600-1675): separar o `<span className="venue-agenda-card__time venue-event-card__time">` em dois elementos irmãos — `venue-event-card__date` (dia/mês/ano) e `venue-event-card__hours` (início, fim, duração) —, ajustar o `aria-label` e envolver o rótulo do ambiente em `<span className="venue-events-registry__scope-chip">` mantendo o `key={venueId}` para a animação.
- `src/styles/venue-events.css`: mudar `.venue-event-card` para `grid-template-columns: auto auto minmax(0,1fr) auto`; novos blocos `.venue-event-card__date` e `.venue-event-card__hours` (larguras mínimas fixas, divisória dashed, tokens semânticos); substituir as regras de cor de `.venue-events-registry__scope` pelo estilo de pílula com variantes `data-venue`; atualizar o bloco responsivo `@media (max-width: 48rem)` para colocar data e horário lado a lado em uma linha e o corpo abaixo.
- Sem mudanças de dados, consultas, filtros ou lógica de negócio.
- Verificação com Playwright em 1440x900 e 390x844 (alinhamento das colunas, contraste do rótulo, ausência de overflow) e atualização de `src/test/venueEventsPresentation.test.ts` se as asserções tocarem o bloco de tempo.
