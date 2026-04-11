

# Split Navigation View — Vista aérea + Terceira pessoa

## Contexto atual

- Mapas usam **Leaflet** (2D, raster tiles) via `DriverLocationMap.tsx`
- Tela fullscreen atual: `FullscreenMapDialog.tsx` — um único mapa com overlays
- Estado da viagem centralizado em `TransportDynamicIsland.tsx` (location, polyline, ETA, etc.)
- Rota real vem da Google Routes API via edge function `estimate-return`

## Limitação técnica

Leaflet **não suporta** tilt (pitch) ou bearing (rotação de câmera). Para a vista em terceira pessoa com câmera inclinada e rotação dinâmica, é necessário um engine WebGL.

**Solução**: Usar **MapLibre GL JS** (open-source, gratuito, suporta pitch/bearing/zoom nativamente) apenas para o mapa de navegação. O mapa aéreo continua com Leaflet existente.

## Arquitetura

```text
FullscreenMapDialog (refatorado)
├── Top bar: origem → destino + status ao vivo
├── Split container (50/50)
│   ├── NavigationMap3D (MapLibre GL) — câmera 3ª pessoa
│   │   └── pitch:60, bearing:heading, zoom:16, follow driver
│   └── DriverLocationMap (Leaflet) — vista aérea existente
│       └── fitBounds rota completa
├── Metrics overlay: ETA, distância, velocidade, motorista
└── Actions: Detalhes, Finalizar
```

## Componentes

### 1. `src/components/transport/NavigationMap3D.tsx` (novo)

Mapa MapLibre GL com:
- Tile source: OpenStreetMap vector tiles (free, via `demotiles.maplibre.org` ou similar raster fallback)
- `pitch: 60` (câmera inclinada)
- `bearing`: atualizado suavemente com heading do veículo (calculado entre posições consecutivas)
- `center`: posição do driver, offset para baixo (mostra caminho à frente)
- Marcador do veículo (ícone direcional)
- Polyline da rota restante (trecho à frente)
- Zoom dinâmico baseado em velocidade
- `easeTo` para transições suaves (sem saltos)
- Throttle de updates (200ms min)

### 2. `src/components/transport/FullscreenMapDialog.tsx` (refatorado)

- Layout split 50/50:
  - **Desktop** (>768px): side-by-side horizontal
  - **Mobile**: vertical stack (navegação em cima, aéreo embaixo)
- Top bar glass com rota + status + badge "Ao vivo"
- Bottom bar glass com métricas (velocidade, ETA, distância, motorista)
- Separador visual elegante entre mapas (linha fina com label)
- Manter botão fechar
- Adicionar botões de ação (Detalhes, Finalizar) no overlay inferior

### 3. `src/lib/heading.ts` (novo helper)

- `calculateHeading(prev, current)`: calcula bearing entre dois pontos GPS
- `smoothHeading(prev, next, factor)`: interpolação suave para evitar saltos

### 4. Props adicionais

`FullscreenMapDialog` recebe nova prop `heading` (calculada no `TransportDynamicIsland` a partir de posições consecutivas) e `onCycleStatus`/`onDetail` para ações.

## Fluxo de dados

```text
TransportDynamicIsland
  ├── location (GPS real-time) ──┐
  ├── livePolyline ──────────────┤
  ├── destCoords ────────────────┼──→ FullscreenMapDialog
  ├── liveDestRoute (ETA/km) ────┤      ├── NavigationMap3D (MapLibre)
  ├── heading (calculado) ───────┤      └── DriverLocationMap (Leaflet)
  └── speed ─────────────────────┘
```

Ambos os mapas compartilham as mesmas props — sem duplicação de estado.

## Responsividade

| Breakpoint | Layout |
|---|---|
| Mobile (<768px) | Stack vertical: navegação 55%, aéreo 45%. Métricas compactas. |
| Tablet/Desktop | Side-by-side 50/50. Cards de métricas mais espaçosos. |

## Dependência

- Instalar `maplibre-gl` (~300KB gzip) via npm
- Sem custo de API — usa tiles OSM gratuitos

## Arquivos

| Arquivo | Ação |
|---|---|
| `package.json` | Adicionar `maplibre-gl` |
| `src/components/transport/NavigationMap3D.tsx` | Novo — mapa 3ª pessoa com MapLibre GL |
| `src/lib/heading.ts` | Novo — cálculo de heading/bearing |
| `src/components/transport/FullscreenMapDialog.tsx` | Refatorar — split view 50/50 + métricas + ações |
| `src/components/TransportDynamicIsland.tsx` | Calcular heading entre posições e passar ao dialog |

