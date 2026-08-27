# Terreno realista: Área Motor Home e Área Test Drive

Duas áreas do Mapa Comercial (`AREA-MOTORHOME` e `TEST-DRIVE`) são hoje renderizadas como lajes planas com a cor genérica de estacionamento (bege `#d4b985`), sem textura. Como são lajes com 0,055 de altura e deslocamento de profundidade negativo, elas também escondem visualmente as vias que as cruzam: a estrada de pedra/saibro que sai do Portão 1 (acesso 1) e passa ao lado da Área Motor Home, e o eixo asfaltado Portão 10 → Portão 1 que segue até a lateral do lote 12, cortando a área de test drive.

O trabalho é exclusivamente de visualização (nenhuma alteração de geometria oficial, banco, cadastro ou lógica comercial).

## O que muda

1. **Textura de grama na Área Motor Home** — superfície de gramado natural com variação de tom, manchas de solo seco e granulação fina, aplicada em toda a área, substituindo a cor chapada. Mantém rótulo, seleção, hover e destaque de filtro como hoje.

2. **Textura própria para a Área de Test Drive** — piso de saibro/brita compactada com faixas de rolagem sutis e grama nas bordas, dando leitura de pátio de manobras real em vez de bloco bege.

3. **Vias voltam a aparecer por cima das duas áreas** — as lajes deixam de ganhar prioridade de profundidade sobre as vias, e a altura visual delas é reduzida abaixo da faixa de rodagem. Resultado: a via do Portão 1 atravessa visível ao lado da Área Motor Home, e o eixo Portão 10 → Portão 1 fica contínuo através da área de test drive até a lateral do lote 12, sem interrupções nem z-fighting.

## Detalhes técnicos

- Novo módulo `src/features/commercial-map/components/canvas/openGroundTextures.ts`: gera texturas `CanvasTexture` procedurais e determinísticas (`grass`, `compactedGravel`) no mesmo padrão de `commercialPavilionTextures.ts` — ruído com semente fixa, sem assets binários, cache por tipo, `RepeatWrapping` com repetição derivada das dimensões do polígono para escala física coerente.
- Novo registro `TEXTURED_OPEN_GROUND` mapeando `publicIdentifier` → tipo de textura (`AREA-MOTORHOME` → grama, `TEST-DRIVE` → saibro), consultado em `GenericEntityMesh` (`CommercialMapCanvas.tsx`).
- Em `GenericEntityMesh`, quando a entidade estiver no registro:
  - o material recebe `map` (com `colorSpace` SRGB), `roughness` alta e cor base neutra em vez de `CLASSIFICATION_COLORS.PARKING`/tint de segmento;
  - UVs planares geradas a partir de X/Z do polígono, para a textura não esticar em áreas retangulares longas;
  - `polygonOffsetFactor/Units` positivos (empurram a laje para trás) em vez do `-2` atual, e altura visual reduzida (~0,03) apenas na geometria de apresentação — a elevação de apoio usada pelas vias `supportAware` permanece intacta em `parkAccessSpatialPlanAdapter.ts`.
  - `dispose` das texturas segue o padrão de limpeza já existente no componente.
- Nenhuma alteração em `officialReference2026.ts`, migrations, RLS ou dados de lotes; contornos, rótulos e interação preservados.

## Validação

- Playwright no `/mapa-comercial`: captura das duas regiões confirmando textura aplicada e as duas estradas visíveis atravessando as áreas.
- Conferir que seleção/hover e o modo infraestrutura continuam corretos nas duas áreas.
