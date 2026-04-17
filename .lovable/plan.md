

## Diagnóstico

O `WeatherMiniSummary` foi adicionado ao `AgendaPage.tsx`, mas provavelmente:
1. Está renderizando só quando `e._source === 'transport'`, mas a condição/filtro não bate;
2. Ou está renderizando mas escondido visualmente (CSS, ou só aparece quando há snapshot — sem snapshot retorna `null`).

Vou inspecionar para confirmar.
