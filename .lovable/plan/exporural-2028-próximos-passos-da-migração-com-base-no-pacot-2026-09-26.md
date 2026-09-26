# Exporural 2028 — próximos passos da migração (com base no pacote do Codex)

O próprio pacote do Codex avisa que a nova planta **ainda não pode ir para o banco**. O preflight já foi feito e não gravou nada. Por isso, este plano faz a migração em etapas com travas: primeiro prepara tudo e resolve os bloqueios com você, depois aplica as mudanças de forma segura e reversível.

## Etapa 1 — Preparar e guardar a base atual (sem mudar nada visível)
- Reextrair o pacote `Exporural_2028_Arquivos_para_Lovable.zip` e conferir a integridade dos arquivos (manifesto com 100 lotes, crosswalk com 55 correspondências, preflight, SQL proposto, rollback e verificação pós-migração).
- Tirar uma cópia completa da Exporural atual (95 lotes R/S, 108 entidades, geometrias, áreas e revisão 2026.4 v5) para rollback, seguindo `rollback_por_snapshot.md`.
- Repetir o preflight logo antes da escrita, para garantir que nada mudou (sem vendas, reservas, contratos ou colisões nos lotes R/S).

## Etapa 2 — Resolver os bloqueios apontados pelo Codex (precisa da sua decisão)
Vou gerar uma **tela de revisão/relatório** mostrando, lote a lote, o antes e o depois, para você aprovar cada grupo:
1. **Renumerações (25)** — ex.: lote antigo X passa a ser Y.
2. **Divisões (7)** e **reparcelamentos (4)** — de onde vem cada novo lote.
3. **Ajustes de limite (6)** e a **via transversal**.
4. **Apoios B37/B38** sobrepostos aos lotes S-22/S-23/S-24 — manter, mover ou remover.
5. **Q-S-36** — hoje ativo; a proposta o elimina.
6. **568,78 m² sem número** — virar lote novo, área comum ou via.
7. **Diferença de área (desvio de até 7,66%)** — usar a metragem oficial da planilha (padrão do sistema) em vez da área desenhada.

Suas respostas viram o arquivo de aprovações que falta (`approvals_resolvidas.json`). Sem ele, o SQL do Codex continua travado de propósito.

## Etapa 3 — Aplicar a migração (só depois da aprovação)
- Uma migração única, idempotente e restrita ao segmento Exporural: renomear/dividir/criar/arquivar lotes conforme as aprovações, registrando a origem de cada lote novo (linhagem) e mantendo o histórico.
- Os 13 lotes preservados continuam com os mesmos IDs e metragens.
- Lotes eliminados são **arquivados**, nunca apagados.
- Preços saem da regra oficial 2028 já existente; os valores editados à mão continuam valendo nos lotes preservados.
- Nenhuma mudança em outros segmentos, pavilhões, vendas ou links públicos (os links refletem a nova planta em até 30 segundos).

## Etapa 4 — Conferência
- Rodar `verificacao_pos_migracao.sql`: totais 65 R + 35 S, soma de áreas oficiais, sem sobreposições, sem lotes órfãos.
- Conferir mapa, Modo Vendas, Painel e um link público da Exporural.
- Se algo falhar, restaurar pela cópia da Etapa 1.
- Nada será publicado sem pedido seu.

## Detalhes técnicos
- Snapshot em `map_reference_migration_snapshots`; linhagem em `map_lot_lineage`; novas versões em `map_geometry_versions` (revisão 2026.5).
- Fontes: `commercial_lots`, `map_entities`, `map_entity_geometries`; preços pela view `commercial_lot_pricing_2028`, preservando `commercial_lot_price_overrides`.
- `migration_proposta.sql` será adaptado para ler as aprovações e abortar se o preflight divergir; SQL de migração separado das consultas de dados.
- Registro das decisões em `roadmap.md` e da regra de linhagem em `AGENTS.md`.
