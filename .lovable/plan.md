# Auditoria do modo Vendas — Mapa Comercial (somente leitura)

Nada foi alterado: sem edição de código, sem migração, sem publicação.

## O que está acontecendo, problema a problema

### 1. Pavilhões "cortados"/simplificados ao entrar em Vendas — CONFIRMADO
`SalesModeLayer.tsx:33-52` liga `setReducedGraphics(true)` globalmente. Esse sinal não serve só para ambientação: ele percorre praticamente toda a cena.
- `CommercialMapAdaptiveQuality.tsx:77-80,127-140` — trava a resolução num piso reduzido e desliga a amostragem adaptativa (`adaptiveQualityRuntime.ts:171-184`).
- `CommercialPavilionInteriorScene.tsx:371,409-411,433,452` — remove as vigas estruturais do pavilhão e reduz sombras de 1024 para 256.
- `CommercialPavilionModuleLayer.tsx:238,298,330,365,403` — textura de 2048→1536, fontes menores, some o rótulo de m² do módulo, anisotropia 8→2.
- Mesma prop chega a ruas, estruturas de referência, rodovias e acessos (`RoadInfrastructure`, `FenasojaReferenceStructures`, `br344Geometry.ts:149`, `arenaAccessStructure.ts:145-199`), reduzindo espessuras e amostragem de geometria.
Causa-raiz: usar um interruptor global de qualidade para expressar "esconder ambientação". Não é LOD por distância nem bug de geometria.

### 2. Card VENDAS fraco
`sales-mode.css:1-58` — fundo `hsl(var(--card)/0.92)` com blur, sem hierarquia; o seletor de etapa (`.sales-cart__stage`) é um par de botões planos sem trilho nem indicador, e o contador/rótulos usam o mesmo peso tipográfico do resto.

### 3. Clique em lote externo não monta multi-seleção — CONFIRMADO (duas causas somadas)
- O clique no canvas chama `setSelectedEntityId`, que em `useCommercialMapStore.ts:304-320` força `activePanel: 'details'` — por isso a sidebar padrão abre no modo Vendas.
- `SalesModeLayer.tsx:55-59` só observa `selectedEntityId` e sempre faz `addLot` (nunca alterna). Clicar de novo não remove; e como o id selecionado não muda ao reclicar o mesmo lote, o efeito nem dispara.
- Barreira decisiva: `salesEntry.ts:4-13` aceita apenas `AVAILABLE | RESERVED | IN_NEGOTIATION`. Hoje **os 1.579 lotes estão BLOCKED**, então nenhum clique adiciona nada.

### 4. Módulos internos sem seleção direta — CONFIRMADO
O clique do módulo em `CommercialPavilionModuleLayer.tsx:703-719` só faz `setSelectedModuleId`. `SalesModeLayer` não observa `selectedModuleId`; a inclusão depende do botão no `PavilionModuleCard`.

### 5. Checkout aparecendo cedo
`SalesCheckoutDialog` é montado sempre (`SalesModeLayer.tsx:100`) e o botão "Finalizar venda" existe mesmo com carrinho vazio/sem valor válido.

### 6. Por que tudo está BLOCKED — investigado no banco
- Default da coluna é `AVAILABLE`; portanto o BLOCKED foi gravado por processo.
- 262 lotes externos têm histórico com motivo "importado da referência oficial 2026.3; validação comercial pendente" (função `sync_commercial_map_reference_2026`, que contém o literal BLOCKED).
- Os 1.315 módulos de pavilhão **não têm nenhum registro em `lot_status_history`** — foram criados já BLOCKED pela carga de módulos, sem decisão comercial.
- Zero vendas, reservas, negociações e contratos.
Conclusão: é bloqueio técnico/legado, não bloqueio comercial.

### 7/8/9/10
Preservação de ruas/quadras/rótulos hoje é colateral do `reducedGraphics`; não há camada própria de "ambientação". Seleção não persiste porque `enterInterior/exitInterior` mexem em `selectedEntityId`, e o carrinho depende desse id. Áreas, preços, regras, esquinas, geometrias, IDs e P7 não foram tocados nesta auditoria.

## Arquitetura de correção proposta

1. **Preset visual de Vendas em vez de `reducedGraphics`**
   Novo estado `salesPresentationActive` no `useCommercialMapStore`, consumido apenas pelas camadas de ambientação (árvores, vegetação, clima/chuva, pessoas/atividades, parque de diversões, distrito residencial, efeitos noturnos, iluminação). Pavilhões, módulos, ruas, quadras, lotes e rótulos essenciais continuam na qualidade padrão. `SalesModeLayer` deixa de tocar em `reducedGraphics`.

2. **Interação própria do modo Vendas**
   Guarda de intenção: enquanto Vendas ativo, o clique em lote externo chama `toggleLot` e **não** abre a sidebar (`setSelectedEntityId` com flag `suppressPanel`, ou ação dedicada `selectForSales`). O clique de módulo (`CommercialPavilionModuleLayer`) passa pelo mesmo despachante, alternando o módulo no carrinho. Destaque visual do lote/módulo "no carrinho" via `moduleStateById`/estado de seleção já existente.

3. **Seleção persistente**
   O carrinho já vive no `useSalesStore` (fora do store do mapa) — basta não limpar seleção em `enterInterior/exitInterior` e manter a troca Renovação/2ª Etapa apenas recalculando preços (já é o comportamento de `setStage`).

4. **Elegibilidade comercial sem bulk-update cego**
   Regra segura proposta: introduzir distinção explícita entre bloqueio técnico e comercial, usando `blocked_reason`/metadata. Um lote é liberável quando: não tem venda/reserva/negociação/contrato, tem `official_area_sqm > 0`, tem preço resolvido na view `commercial_lot_pricing_2028` (status OK), e seu BLOCKED é técnico (sem histórico ou com o motivo de importação 2026.3). Execução em RPC idempotente com dry-run obrigatório, registrando `lot_status_history` com motivo auditável. P7 (B10/171 módulos) permanece intocado e sem preço. Nenhum BLOCKED de origem desconhecida é liberado — vai para relatório de pendências.

5. **Card VENDAS**
   Segmented control real (trilho + indicador ativo) para Renovação/2ª Etapa, superfície opaca com contraste, total em destaque, lista de itens com m² e valor por linha, e ações só habilitadas com seleção válida. O checkout só monta quando há seleção válida e sem itens sem preço.

## Testes obrigatórios
- Preset visual: pavilhões e módulos mantêm parâmetros de qualidade padrão em modo Vendas; apenas camadas de ambientação são ocultadas.
- Clique externo alterna entrada/saída do carrinho e não abre `activePanel: 'details'`.
- Clique em módulo interno alterna o módulo; 3 lotes selecionados somam m² e valores item a item.
- Persistência de seleção ao entrar/sair do interior de pavilhão e ao trocar de etapa.
- Elegibilidade: dry-run lista exatamente os candidatos; reexecução não altera nada; nenhum lote de P7 liberado ou precificado; lote com venda/reserva nunca liberado.
- Checkout bloqueado com carrinho vazio ou contendo P7.

## Riscos
- Tocar no despachante de clique pode afetar navegação/filtros existentes — guardas restritas a `salesModeActive`.
- Trocar `reducedGraphics` por preset pode alterar performance em aparelhos fracos; manter fallback automático pela qualidade adaptativa.
- Liberação de status é a única mudança de dado real: exige dry-run aprovado antes de qualquer gravação.
