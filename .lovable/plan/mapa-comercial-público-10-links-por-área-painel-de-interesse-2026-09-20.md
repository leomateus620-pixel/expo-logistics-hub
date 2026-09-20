# Mapa Comercial público — 10 links por área + painel de interesse

Consulta externa do mapa, um link por área, sem carrinho, sem dados internos. No sistema, novo painel em Mapa Comercial → Gestão → Interesse por áreas e lotes.

## O que já existe neste projeto (verificado agora)

Arquivos reais:
- `src/App.tsx` (rota `/mapa-comercial`, portais `/comissoes/:moduleSlug/*`)
- `src/features/commercial-map/CommercialMapPage.tsx`, `state/useCommercialMapStore.ts`
- `services/commercialMapService.ts` (inclui `COMMERCIAL_LOT_SELECT`, `expire_commercial_reservations`, `expire_commission_segment_reservations`), `hooks/useCommercialMap.ts`
- `services/lotPricing2028Service.ts`, `utils/lotPricing2028.ts`, `hooks/useLotPricing2028.ts`, `components/panels/LotPricing2028Panel.tsx`
- `utils/commercialPavilions.ts` (mapa B↔pavilhão), `utils/commercialPavilionModules.ts`, `utils/pavilionModuleCommercial.ts`, `utils/areaScope.ts`, `utils/permissions.ts`
- `data/commercialMapSegments.ts`, `components/shell/CommercialMapHeaderTools.tsx`, `components/canvas/*`, `sales/*`
- `src/modules/commissions/commissionMapPortalRegistry.ts` (não será tocado)

Dados confirmados no banco:
- 1.579 lotes ativos (1.408 AVAILABLE, 171 BLOCKED = Pavilhão 7/B10), todos com entidade própria e `parent_entity_id` preenchido (100%).
- Contagem por área: B1 189, B2 186, B3 257, B4 114, B5 103, B6 214, B8 81, B10 171 (excluído), externos 264 (ICS 105, Exporural 95, 64 sem segmento).
- Mapeamento confirmado em código/dados: B1→Pav.1, B2→Pav.14, B3→Pav.12, B4→Pav.8, B5→Pav.13, B6→Pav.3, B8→Pav.5, B10→Pav.7.
- `commercial_lot_pricing_2028`: 1.408 OK, 171 EXCLUIDO — Renovação e Segunda Etapa já disponíveis.
- `map_segments` só tem `exporural` e `industria-comercio-servicos`. **Não existe segmento `espaco-automovel` no banco**; os 64 lotes das quadras O, P, T, U, Q, V estão sem segmento.
- Entidades de B8 e B10 também estão sem `segment_id` → escopo deve usar `parent_entity_id`/UUID, nunca prefixo de nome.
- Capacidades existentes: `map.view`, `map.edit`, `map.edit_geometry`, `map.manage_lots`, `map.manage_sales`, `map.manage_contracts`, `map.manage_layers`, `map.admin`. Não há capacidade de analytics.

## Arquitetura proposta

Registro de escopos (novo `src/features/commercial-map/public/publicAreaRegistry.ts`) com os 10 slugs; cada um resolve para UUIDs canônicos:
- 7 pavilhões → `parent_entity_id` da edificação (B1, B6, B8, B4, B3, B5, B2).
- Exporural → `map_segments.slug = 'exporural'`.
- ICS externo → segmento ICS **menos** qualquer entidade com `metadata->>'pavilionPublicIdentifier'` (remove os módulos internos).
- Espaço do Automóvel → precisa de segmento persistido (ver Perguntas).

Banco (novas tabelas + RPC, migração versionada):
- `public_map_links`: escopo, slug, `token_hash`, ativo, `revoked_at`, `created_by`, auditoria. Token só existe em claro no momento de gerar/regenerar; nada de catálogo público.
- `public_map_visits` / `public_map_events`: telemetria com `event_id` idempotente, `session_id` pseudônimo, `page_view_id`, sem PII.
- RPCs `SECURITY DEFINER` com `search_path` fixo: `public_map_scope(token)`, `public_map_inventory(token)`, `public_map_lot(token, lot_id)`, `public_map_track(token, evento)`. Toda leitura valida token→escopo antes de retornar; lote fora do escopo = erro. Sem SELECT amplo para `anon`.
- Allowlist de saída: id, identificador, pavilhão/quadra, geometria, área oficial, disponibilidade publicável, esquina, infraestrutura, R$/m² e total de Renovação e Segunda Etapa, `resolution_status`. Nunca compradores, contratos, notas internas, preço mínimo, reservas, histórico.

Front:
- Rota pública `"/areas/:slug/:token"` montada por entry separado, sem providers de admin/auth; deep link direto ao interior do pavilhão ou ao enquadramento do segmento.
- Reuso do canvas e do motor de planta atuais; nada de reconstruir mapa ou preço.
- Ficha pública nova (`PublicLotDetails`) — `PavilionModuleCard` continua interno (vaza vínculo/contrato).
- Sem manutenção de reservas no carregamento público; paginação preservada (>1000 linhas).
- Fallback em lista no mesmo escopo quando WebGL falhar; nunca abre o parque completo.
- Namespace de cache próprio (`['public-map', token]`), limpo ao trocar de link.
- Formatação pt-BR/BRL; sem área ou preço → "Metragem não informada" / "Valor sob consulta"; tratar SEM_AREA, SEM_REGRA, REGRA_AMBIGUA, EXCLUIDO (Pavilhão 7 fica fora dos links).

Painel interno:
- Nova ação em `CommercialMapHeaderTools` (`managementActions`) → "Interesse por áreas e lotes": visitas, sessões, ranking de áreas e lotes, série diária, heat sobre a geometria existente e a lista dos 10 links (status, copiar, ativar/desativar, regenerar).
- Nova capacidade `map.analytics.view` (com `map.admin`/`full_access` herdando) em `utils/permissions.ts`; agregações no servidor, UTC no banco e America/Sao_Paulo na UI.
- Taxa de interação = sessões com seleção ÷ sessões com visita (nunca chamada de conversão de venda).

## Ordem de implementação

1. Registry dos 10 escopos + resolução por UUID + testes de isolamento.
2. Migração: tabelas de links e telemetria, RPCs com allowlist, RLS.
3. Entry e rotas públicas + ficha pública + fallback em lista.
4. Telemetria e agregações.
5. Painel de gestão e capacidade.
6. Validação: matriz 10×10, revogação, payload limpo, ICS externo sem módulos internos, mobile/a11y, regressão de admin, portais e Modo Vendas.
7. Configuração de `PUBLIC_MAP_ORIGIN`/`VITE_PUBLIC_MAP_ORIGIN` e emissão dos 10 links quando a publicação externa existir.

## Riscos

- Escopo por nome reintroduzido em helpers (`areaScope`, wayfinding) devolvendo entidades de fora — mitigado por filtro no servidor e testes por escopo.
- B8/B10 sem `segment_id`: qualquer lógica baseada em segmento quebraria o Pavilhão 5.
- Vazamento por camadas reutilizadas (labels, tooltips, busca) — ficha e loaders públicos separados.
- Custo de render em mobile com 257 módulos (B3) — só o escopo é carregado.

## Depende de infraestrutura

Os links só funcionam fora de `fenasojagestao.com` depois que `PUBLIC_MAP_ORIGIN` existir (domínio/entry publicado). Até lá tudo fica pronto e testável, sem publicar.

## Perguntas bloqueantes

1. "Espaço do Automóvel" não existe como segmento no banco (64 lotes nas quadras O, P, T, U, Q e V, hoje sem segmento). Posso criar o segmento canônico `espaco-automovel` com essas quadras, ou esse link fica de fora nesta etapa?
2. Confirma incluir as quadras Q e V nesse escopo? Elas estão na lista de exclusão do segmento automotivo no código atual.
3. A disponibilidade publicável deve mostrar status real (Disponível/Reservado/Vendido) ou apenas "Disponível / Sob consulta"?
