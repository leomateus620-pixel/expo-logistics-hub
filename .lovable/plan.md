# Exporural — revisão, sem numeração fixa e desbloqueio dos 56 lotes

## Resultado da revisão (feita agora no banco)
- 100 lotes ativos (65 R + 35 S): 44 Disponíveis e 56 Bloqueados. Todos têm metragem oficial cadastrada.
- Valores por m² seguem a regra oficial 2028: Quadra R R$ 27,50 / R$ 24,20 / R$ 16,50 (Renovação) conforme a faixa; Quadra S R$ 11,00 (Renovação) e R$ 12,00 (2ª Etapa). Totais batem com metragem × preço/m².
- Problemas encontrados:
  - **Q-R-60, Q-R-61 (bloqueados), Q-R-64 e Q-R-65 (disponíveis) estão sem valor** — não há regra de preço para eles.
  - **Q-R-62 e Q-R-63 estão com R$ 0,00** por valor editado à mão.

## O que será feito
1. **Tirar as numerações fixas de cima dos lotes da Exporural** no mapa (administrativo e Vendas). O número continua aparecendo ao passar o cursor/tocar e na ficha ao clicar no lote. Cadeado e vermelho dos vendidos continuam.
2. **Desbloquear os 56 lotes** (Bloqueado → Disponível), registrando no histórico de cada lote. Os que já têm preço ficam prontos para venda.
3. **Q-R-60/61/64/65 sem preço**: aplicar o mesmo preço/m² dos vizinhos da mesma faixa (R$ 16,50 Renovação / R$ 18,00 2ª Etapa), salvo orientação diferente sua.
4. **Q-R-62/63 com R$ 0,00**: manter como estão (foram editados à mão), a menos que você peça para voltar ao valor da regra.

## Detalhes técnicos
- Numeração: em `CommercialMapCanvas.tsx`, `numberedEntities` deixa de incluir entidades `hasRevisedExporuralNumbers` fora do modo público (links públicos mantêm o comportamento atual). `PublicLotNumbers` não é removido.
- Desbloqueio: UPDATE em `commercial_lots.status` restrito aos 56 lotes BLOCKED do segmento Exporural não arquivados + `lot_status_history`/`map_activity_logs`. Isso substitui a regra do AGENTS.md "nascem BLOCKED até precificação aprovada" apenas por decisão explícita do usuário.
- Preço dos 4 lotes: ampliar a faixa da regra oficial em `commercial_price_rules` (não override manual), para a view `commercial_lot_pricing_2028` resolver o valor.
- Conferência final: nenhum lote Exporural BLOCKED, nenhum SEM_REGRA, mapa sem placas numéricas.
