# Mapa Comercial — dock lateral esquerdo e rótulos progressivos

Redesenho estrutural da interface do Mapa Comercial para desktop, tablet e monitores grandes: o mapa 3D passa a ocupar praticamente toda a tela e todos os controles migram para um dock vertical à esquerda.

## 1. Nova arquitetura de layout

Hoje a página empilha, de cima para baixo: cabeçalho do módulo (título + seletor Parque/Exporural + Gestão), faixa de aviso da base, faixa horizontal de Segmentos com busca, e só então o mapa — mais controles flutuantes dentro do mapa.

Nova estrutura:

```text
┌──────────────────────────────────────────────┐
│ barra fina do módulo (voltar / marca / sair) │
├────────┬─────────────────────────────────────┤
│ DOCK   │                                     │
│ ícones │            MAPA 3D                  │
│ +      │        (largura e altura            │
│ painel │         praticamente totais)        │
│ expan- │                                     │
│ sível  │   resumo comercial + legenda        │
└────────┴─────────────────────────────────────┘
```

- O cabeçalho interno do mapa (`commercial-map-command-header`) deixa de existir; a barra fina do módulo continua sendo a única faixa superior.
- O mapa vira o único filho do viewport, ocupando 100% da área restante.

## 2. Dock lateral esquerdo

Novo componente `CommercialMapDock`, colapsado por padrão (faixa de ícones ~56px) e expansível (~300px) com transição suave. Grupos, de cima para baixo:

1. **Busca** — campo no estado expandido; ícone com popover no estado compacto (mantém `Ctrl/Cmd+K`).
2. **Área do mapa** — Parque completo / Exporural.
3. **Segmentos** — cards compactos (cor, nome, nº de lotes) com foco/filtro; no modo compacto viram pastilhas coloridas com tooltip.
4. **Visualização** — presets de câmera, 3D/lista, árvores, camadas, enquadrar seleção.
5. **Filtros e situações comerciais** — seção expansível (hoje no `MapToolbar`).
6. **Gestão** — seção só para quem tem permissão (editar geometria, calibrar, cadastrar lote, publicar, sincronizar base). Os diálogos atuais são reaproveitados sem alteração de lógica.

Comportamento: no tablet o dock inicia compacto e a expansão vira overlay sobre o mapa (sem reduzir o canvas); em desktop/monitor grande ele empurra o mapa e o canvas refaz o ajuste com o debounce de resize já existente. O dock não captura eventos de ponteiro fora de sua área.

## 3. Rótulos progressivos e mais discretos

Nova lógica de densidade em `mapPresentation.ts` / `mapMetadata.ts` / `useSemanticLabelVisibility`:

- Quatro níveis em vez de três: `far`, `medium`, `near`, `detail`.
- **Far**: apenas contexto máximo (marcos/venues de prioridade ≥ 94), com teto baixo (≈4 rótulos em desktop).
- **Medium**: segmento ativo, quadras e grandes estruturas (teto ≈16).
- **Near**: nomes de pavilhões, estruturas, portões e ruas (teto ≈36).
- **Detail**: lotes e rótulos detalhados (teto ≈72).
- Limiares por distância recalibrados com histerese mantida, para não piscar perto do corte.
- Entidade selecionada e a com hover continuam sempre visíveis, independentemente do nível.

Estilo: fundo translúcido esverdeado-escuro suave em vez do branco atual, borda de baixo contraste, tipografia menor e peso reduzido, sombra discreta; o rótulo ativo/selecionado ganha destaque dourado. Transição de opacidade curta na entrada/saída.

## 4. Textos removidos

- "Estado da base persistida" e a mensagem de origem em rascunho (faixa `commercial-map-source-notice`) — vira um ícone de status dentro do dock, com tooltip, só quando houver alerta real.
- "Projeto cartográfico em rascunho".
- Título "Parque completo" e sublinha "Referência cartográfica…" do cabeçalho interno (o escopo já aparece no dock).

## 5. Detalhes técnicos

- Novos: `components/dock/CommercialMapDock.tsx` (+ subcomponentes de seção) e `components/dock/commercial-map-dock.css`.
- Alterados: `CommercialMapPage.tsx` (layout e remoção do header), `MapToolbar.tsx` (reduzido a controles realmente flutuantes ou absorvido pelo dock), `SegmentLegend.tsx` (versão compacta para o dock), `commercial-map.css`, `mapPresentation.ts`, `mapMetadata.ts`, `CommercialMapCanvas.tsx` (níveis e tetos de rótulo), `commission-map-portals.css` (ajuste do escopo de comissão).
- Estado do dock (compacto/expandido, seção aberta) no `useCommercialMapStore`, persistido em `localStorage`.
- Mobile mantém o comportamento atual (drawers e busca compacta) — nada regride.
- Testes existentes de `mapPresentation`/viewport atualizados para os novos níveis.

## 6. Validação

Playwright em 1440x900, 1920x1080 e 1024x1366 (tablet): dock compacto/expandido, foco por segmento, filtros, gestão, ganho de área do mapa, densidade de rótulos em zoom distante/médio/próximo e ausência de bloqueio de pan/zoom.
