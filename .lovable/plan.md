

# Adicionar Visualização Fullscreen do Mapa

## O que muda

Ao clicar no mini-mapa dentro do Dynamic Island, abre um modal fullscreen com o mapa ampliado mostrando a posição do motorista, destino e rota. Inclui controles de zoom e botão para fechar.

## Implementação

### 1. Criar componente `FullscreenMapDialog` (`src/components/transport/FullscreenMapDialog.tsx`)

- Dialog/Sheet fullscreen usando `Dialog` do shadcn
- `DialogContent` com `className="max-w-[100vw] w-screen h-screen p-0"` (sem padding, tela inteira)
- Renderiza `DriverLocationMap` com `className="h-full w-full"` e `zoomControl: true`
- Overlay superior com: origem → destino, badge "Ao vivo", botão fechar (X)
- Overlay inferior com velocidade e "Obtendo localização..." se aplicável
- Props: `open`, `onOpenChange`, mesmas props do `DriverLocationMap` (latitude, longitude, accuracy, speed, driverName, routePolyline, destLatLng, destLabel, origemLabel)

### 2. Atualizar `DriverLocationMap` para aceitar prop `zoomControl`

- Adicionar prop opcional `zoomControl?: boolean` (default `false`)
- Passar para `L.map(container, { zoomControl })` ao criar o mapa
- Isso permite zoom controls no fullscreen sem alterar o mini-mapa

### 3. Integrar no `TransportDynamicIsland`

- Adicionar state `const [mapFullscreen, setMapFullscreen] = useState(false)`
- Envolver o mini-mapa com `<button onClick={() => setMapFullscreen(true)}` com `cursor-pointer` e ícone `Expand` discreto no canto
- Renderizar `<FullscreenMapDialog>` passando as mesmas props do mapa inline
- Importar `Expand` do lucide-react

### Arquivos
1. `src/components/transport/FullscreenMapDialog.tsx` — novo componente
2. `src/components/DriverLocationMap.tsx` — adicionar prop `zoomControl`
3. `src/components/TransportDynamicIsland.tsx` — state + botão expand + dialog

