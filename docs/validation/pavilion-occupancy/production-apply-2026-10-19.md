# Ocupação comercial dos pavilhões — aplicação em produção (2026-10-19)

- Commit: `0e969588` (PR #216). Backend do app (`VITE_SUPABASE_PROJECT_ID` = ambiente conectado).
- Arquivo: `supabase/migrations/20261019180000_commercial_pavilion_occupancy.sql`, SHA-256 `1d94151e8fa9e886826f032b167775e5d805226ba3b858cb9b8075eb792afb2b`.
- Aplicada uma vez pela ferramenta oficial como `drizzle/migrations/0022_commercial_pavilion_occupancy.sql` (conteúdo idêntico; diferença só na quebra de linha final). Nenhuma outra migration aplicada.
- Função: SECURITY DEFINER, STABLE; EXECUTE só para authenticated; anon sem EXECUTE (REST sem login: 401).

## Integridade (antes = depois)
commercial_lots 1637 · lot_sales 600 · lot_sale_orders 126 · lot_sale_order_items 600 · lot_contracts 79 · lot_contract_lots 0 · map_entity_geometries 1805.

## Validação com dados reais (sessão autenticada, admin com map.manage_contracts)
Todos os 12 pavilhões ativos: IDs, números e status idênticos a `commercial_lots` (P1 189, P3 214, P5 81, P7 57, P8 114, P12 257, P13 104, P14 186; 4 sem lotes). Nenhuma venda OPEN aparece como SIGNED; 0 inconsistências; nenhum campo de contato, documento, pagamento ou URL. Projeto inexistente/sem acesso: `MAP_PERMISSION_DENIED`.

## Dashboard (navegador, Pavilhão 12)
257 módulos, 8 etiquetas, 8 ramificações, 21 grupos, seleção de expositor, tela cheia (257 módulos, Esc fecha), PDF 3 páginas: 257 lotes / 33 vendidos / 30 em andamento / 194 disponíveis e os 10 nomes do mesmo snapshot; aviso "Documento anexado não comprova assinatura".

## Sem dados / pendente
- `lot_contract_lots` vazio: contratos por venda inteira e conflitos entre pedidos não têm caso real.
- Nenhum item `LEGACY_UNVERIFIED` retornado por estes pavilhões; contratos ativos não têm número preenchido.
- Usuário só com `map.view` e usuário de outra organização: não testados com sessão real (exigem outras contas).
