# Cotas auxiliares dos pavilhões e acessos do Pavilhão 14

Implementação local de 26/09/2026, baseada em `d3ec0cc2`, branch
`codex/pavilion-dimension-annotations`. Plantas oficiais de setembro/2026,
Fenasoja 2028, página 1, fornecidas pelo usuário. Não houve escrita no backend.

## Auditoria anterior à implementação

| Pavilhão | Identificador existente | Boxes preservados | Referência |
|---|---|---:|---|
| 1 | B1 | 189 | `data/pavilion1CommercialReference.ts` |
| 3 | B6 | 214 | `data/pavilion3CommercialReference.ts` |
| 5 | B8 | 81 | `data/pavilion5CommercialReference.ts` |
| 8 | B4 | 114 | `data/pavilion8CommercialReference.ts` |
| 12 | B3 | 257 | `data/pavilion12CommercialReference.ts` |
| 14 | B2 | 186 | `data/pavilion14CommercialReference.ts` |

Os caminhos de implementação acima estão sob `src/features/commercial-map/`.
Os seis PDFs foram renderizados com Poppler e comparados com a cena existente
antes da integração. P13 não recebeu anotações nem mudanças em sua referência.

- Geometria/ilhas: runs e células normalizados em X/Z, consolidados em
  `utils/commercialPavilionModules.ts`. `CommercialPavilionModuleLayer.tsx`
  projeta os polígonos, os módulos instanciados e o atlas de numeração.
- Coordenadas: `createCommercialPavilionModuleProjectionFrame` e
  `projectCommercialPavilionReferencePoint`, seguidas pela posição e rotação Y
  do mesmo grupo do interior. B1/B2 usam a projeção de quarto de volta;
  orientações de câmera permanecem sob `CommercialMapCanvas`/`interiorView`.
- Áreas: `pavilionModuleOfficialAreas.ts`, `cell.areaM2` e, no cadastro,
  `lot.officialAreaSqm`. Identidade/status do lote vêm de
  `pavilionModuleCommercial.ts` e dos registros persistidos. Preços, carrinho,
  vendas, identidade visual de compradores e dashboard mantêm seus contratos.
- Labels: atlas existente no `CommercialPavilionModuleLayer`. Sem modificações.
- Acessos: `wallAccesses`, `commercialPavilionWayfinding.ts` e
  `CommercialPavilionWayfindingLayer.tsx`. Paredes/aberturas são produzidas por
  `commercialPavilions.ts` e `createLowPerimeter` no interior.
- Vertical/Horizontal/Aproximar: `InteriorViewControls.tsx` emite comandos;
  `useInteriorCameraRequest` e `CommercialMapCanvas.tsx` mantêm a câmera única.

## Implementação

`pavilionDimensionAnnotations.ts` contém 30 registros de apresentação, com
fonte, prioridade e âncora semântica. Não há área, preço, identidade de lote,
status, persistência ou registro comercial nesses objetos. O registro fica
fora de `CommercialPavilionModulePlan`, `cells`, `entities` e `lots`.

`pavilionDimensions.ts` resolve os pontos pelas referências geométricas
existentes. `CommercialPavilionDimensionsLayer.tsx` projeta esses pontos com a
câmera/grupo atuais em um único SVG não interativo. Não cria Canvas, renderer,
OrbitControls, texturas ou geometrias GPU. Não há listeners de seleção na camada.

As cotas principais aparecem no enquadramento geral; referências secundárias
dependem do tamanho projetado dos módulos, com histerese. O texto conserva
tamanho em pixels e orientação legível. Quando o corredor fica estreito,
o texto pode acompanhar seu comprimento, enquanto a linha mede a largura.
Colisões com polígonos de lotes, outras cotas, acessos, tooltips, controles e
painéis ocultam a anotação. A posição geométrica não é deslocada para caber.
As atualizações usam o `useFrame` existente e são ignoradas quando câmera,
grupo, viewport e obstáculos não mudaram.

Seleção de referências:

| Pavilhão | Prioridade principal | Complementos selecionados |
|---|---|---|
| 1 | 5,40 m nos dois corredores | 4,00 m lateral; 3,00/1,00 m de módulos |
| 3 | 4,40 m, uma indicação por corredor | 4,25 m no vazio inferior; 3,00/1,00 m |
| 5 | 5,60 m central | 3,00 m junto ao vão 62/63; frente de 1,50 m do box 01 |
| 8 | 3,35 m nos corredores | 3,00 m superior; 4,00 m da fileira lateral; 1,00 m |
| 12 | 5,00 m central | Uma referência por corredor externo; 3,00/1,00 m |
| 14 | 5,00 m central | 4,00 m superior/inferior; 3,50/1,00 m; Caminho do Bosque |

Diferenças documentais foram tratadas como referências visuais, preservando
o desenho existente: no P5, PDF 5,60 m versus corredor histórico 5,70 m;
no P1, PDF 5,40 m versus referência 5,42 m. No P8, os corredores são 3,35 m:
4,00 m identifica a profundidade das fileiras laterais, não sua largura livre.
Os 1,00 m impressos representam frentes/divisões de módulos; não foram
interpretados como novos corredores nem afastamentos comerciais.

### Pavilhão 14

O cadastro anterior colocava `front/rear` onde a planta descreve `left/right`,
e a projeção de quarto de volta trocava novamente os lados. Além disso, o
resolvedor de ícones descartava acessos estruturais. Corrigidos os lados da
fonte e habilitada explicitamente a apresentação desses acessos estruturais:
seis aberturas bidirecionais, três por lateral, nas faixas 4/5/4 m.

Os mesmos marcadores compartilhados são usados, com seta orientada pela normal
projetada da parede. As aberturas e os ícones usam o mesmo corredor/projeção;
os IDs de cada lado são distintos. “Caminho do Bosque” fica na lateral esquerda
da fonte, fora do contorno real da parede. Não foi criada vegetação ou estrutura.

## Evidências locais

- `before/matrix.json` e `after/matrix.json`: 36 casos cada, seis pavilhões ×
  três controles × dois perfis (1440×900 e 390×844).
- `before/` e `after/`: capturas por pavilhão, orientação e aproximação.
- SHA-256 de células, entidades e lotes idênticos antes/depois em todos os 36
  casos. Preservados os 1.041 módulos, seus números, polígonos, áreas e todo o
  conteúdo comercial presente nos fixtures. Isso não é uma leitura de produção.
- `interactions/report.json`: seleção real por raycast nos seis pavilhões em
  ambos os perfis, painel aberto sem sobreposição das cotas, clique passando pela
  cota sem selecionar lote, e pan iniciado sobre a anotação.
- Seis ciclos de três comandos em cada perfil após aquecimento: 6 geometrias,
  92 texturas e 201 programas no início/fim; um Canvas, renderer e OrbitControls.
  Contadores estáveis não provam ausência absoluta de vazamento de heap.
- Perda/restauração WebGL induzida em cada perfil: `ready/direct`, um Canvas,
  um renderer, um controle, seis ícones recuperados e `lastErrorCode: null`.
  O único contexto perdido em cada execução foi o induzido pelo teste.
- As cotas acrescentam zero draw calls. P14 passa de 8 para 20 no enquadramento
  geral devido aos 12 meshes dos seis ícones do componente compartilhado.
- `public/report.json`: P3/P14 × três controles × dois perfis, 12 casos com
  a página pública real e inventário local: um Canvas, sem erro JavaScript ou
  overflow horizontal, seis acessos e anotações compartilhadas.

Em aproximação extrema, uma anotação pode sair da região visível ou ser
ocultada por falta de espaço. Ela reaparece ao retornar/panear para sua âncora;
não é arrastada artificialmente com a viewport. Isso também vale para o Bosque.

## Verificações e limites

- 125 testes focados passaram (15 novos, incluindo projeção, não mutação,
  prioridade, colisões e orientação).
- Bateria ampliada: 60 passaram e um teste de `publicMapLifecycle.test.tsx`
  falhou. Reproduzido no baseline `d3ec0cc2` com
  `scripts/pavilion-dimensions-baseline.config.ts`: o teste espera o nome
  acessível `Lote Rural 1` ao abrir detalhes. Essa falha não foi ocultada nem
  alterada nesta tarefa. A navegação pública foi validada separadamente no browser.
- Dois testes existentes de ícones comparavam quebras LF literalmente;
  passaram a tolerar CRLF. Um teste de apresentação de P14 foi alinhado à
  função de altura plana já existente antes desta tarefa.
- TypeScript, ESLint dos arquivos alterados e build passaram na revisão final.
  O build mantém os avisos existentes de tamanho de chunks/Browserslist.
- Chrome/Windows, Intel UHD via ANGLE/D3D11, DPR 1. Mobile é emulação de viewport
  e toque; não houve ensaio físico em iPhone/Safari/Android, produção autenticada
  ou CI remoto. Não há afirmação de FPS universal ou certificação de dispositivo.
- Nenhuma migration, mudança de preço, venda, dashboard ou referência do P13.
  Alterações alheias em `.worktrees/` e `supabase/functions/mcp/index.ts` foram
  preservadas e não integram esta implementação.

## Reprodução

```powershell
npx vite --config scripts/interior-controls-qa.config.ts --port 4201
# Em outro terminal, com playwright disponível ou PLAYWRIGHT_MODULE configurado:
node scripts/pavilion-dimensions-qa.cjs after
node scripts/pavilion-dimensions-interactions-qa.cjs
node scripts/pavilion-dimensions-public-qa.cjs
npx vitest run --config scripts/pavilion-dimensions-baseline.config.ts src/test/publicMapLifecycle.test.tsx
```

Os scripts usam os componentes de produção com fixtures locais e não podem
gravar no backend. O teste de baseline é esperado falhar no caso documentado.
