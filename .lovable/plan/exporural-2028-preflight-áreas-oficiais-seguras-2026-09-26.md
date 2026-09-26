# Exporural 2028 — Preflight + áreas oficiais seguras

## Contexto
O relatório `RELATORIO_PARA_LOVABLE.docx` (Codex, 25/09/2026) propõe 100 parcelas R/S e uma via transversal, mas **bloqueia explicitamente a migração geométrica**: diferenças de calibração/área (desvio máx. 7,66%), apoios B37/B38 sobrepostos aos lotes S e `approvals_resolvidas.json` não resolvido. Escopo aprovado pelo usuário: **preflight somente-leitura + aplicação das áreas oficiais apenas dos lotes com identidade inequívoca**. O usuário enviará os arquivos complementares (manifesto, geometrias, SQLs) em seguida.

## Fase 1 — Preflight (somente leitura, sem alterar nada)
Consultas de leitura no banco vivo para comparar com a proposta do relatório:

- Inventário atual da Exporural: contagem de lotes R/S, `public_identifier`, áreas oficiais, status, `is_archived`.
- `map_projects`: `reference_revision`, `active_version`, `is_published` (relatório espera referência `2026.4-exporural.1`, versão 5).
- `map_entities` / `map_entity_geometries` do segmento Exporural: versões de geometria atuais (o contador deve avançar a partir do banco, nunca ser sobrescrito com 6).
- Verificar existência/ausência de Q-S-36 e Q-R-66 (a proposta os elimina).
- Verificar vínculos comerciais ativos nos lotes R/S: vendas CONFIRMED, reservas ativas, negociações, contratos — qualquer lote com vínculo fica fora de qualquer alteração.
- Conferir as vias existentes (Bruno Schwartz, Johan Muller, Gustavo Bessel, Emanuel Brachmann, 15 de Novembro, Pastor Albert Lehenbauer, Ubiretama, Ubiretama-Lateral-R55, Leste-Exporural).
- Entregar um diagnóstico: o que está igual, o que diverge, o que é seguro atualizar.

## Fase 2 — Áreas oficiais seguras (migração idempotente)
Aplicar **somente metragem oficial (`official_area_sqm`)** dos lotes cuja identidade é inequívoca:

- Somente lotes classificados no relatório como "Preservação candidata" (mesmo código antes/depois, ex.: Q-R-16 → Q-R-16), casados por `public_identifier` + UUID real do banco.
- Excluir automaticamente: lotes com venda, reserva, negociação ou contrato; lotes com renumeração/divisão/reparcelamento pendente; qualquer lote não encontrado ou duplicado.
- Não tocar em: geometria, polígonos, âncoras, status, preços, regras de preço, overrides manuais, vias, B37/B38, Pavilhão 7, demais segmentos.
- Registrar cada alteração em `map_activity_logs` (lote, área anterior → nova área, data/hora), mantendo rastreabilidade.
- Migração idempotente: rodar de novo não muda nada.

## Fora de escopo nesta entrega (bloqueados pelo próprio relatório)
- Renumeração de códigos (ex.: Q-R-18 → Q-S-18), divisões e reparcelamentos.
- Nova via transversal e passagens individualizadas.
- Novas geometrias/calibração (aguarda responsável cartográfico + arquivos).
- Destinação dos 568,78 m² sem número e cadastro/preço de novas parcelas (ficam BLOCKED, sem preço, até liberação).
- Quando os arquivos complementares chegarem, avalio a integração do patch/SQLs como etapa separada, com novo plano.

## Validação
- Releitura pós-migração conferindo cada área alterada contra a tabela do relatório.
- Conferir que contagens de entidades/lotes, vendas, preços e links públicos permanecem inalterados.
- Testes existentes do mapa comercial + typecheck/build.
- Nada será publicado em produção.

## Detalhes técnicos
- Leituras via ferramentas de consulta do banco (SELECT apenas).
- Alterações via migração única com `UPDATE commercial_lots SET official_area_sqm` filtrado por UUIDs verificados no preflight, com guarda `WHERE` que aborta se o lote tiver vínculo comercial ou identificador divergente.
- Preço/m² exibido é derivado (área × regra/override), então sidebar, Modo Vendas, Dashboard e links públicos refletem a nova metragem automaticamente na próxima leitura (links públicos em até ~30 s).
