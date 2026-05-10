## Objetivo

Gerar `Relatorio_Geral_Operacao_Logistica_Fenasoja_2026_v6.pdf` em `/mnt/documents/`, mantendo **exatamente** o design institucional do V5 (capa verde profunda com círculo decorativo + faixas douradas, cabeçalho/rodapé fixos, KPIs em grid, tabelas verde/dourado, gráficos matplotlib) — porém com os ajustes pedidos.

## Mudanças em relação ao V5

1. **KM oficial = 5.811 km** (apenas odômetro físico). Remover a soma "+503 Defender estimado". O Defender entra na frota mas com KM real registrado (ou marcado como "sem odômetro" se for o caso — sem inventar estimativa).
2. **Sem estimativa de custo por km** (R$ 4.104,10 / R$ 0,65 × km). Remover a coluna/linha de "Custo estimado da frota" em todas as seções e KPIs.
3. **Combustível = somente o real gasto no período** (R$ 3.337,06, incluindo abastecimento da Defender). Manter como o único indicador financeiro de combustível.
4. **Carrinhos elétricos:** adicionar o **total de horas de uso** consolidado (somatório de `duration_min` das sessões fechadas → converter em horas) e horas médias por carrinho. Inserir em KPI + na seção própria.
5. **Remover seção de Checklist & Tarefas** inteira (e retirar o KPI "13 / 1 / 12 tarefas"). Renumerar páginas.
6. **Remover seção/parágrafos de "Inconsistências resolvidas / mudanças V4 → V5"** e qualquer texto comparando versões. O V6 não menciona versões anteriores nem reconciliações — é apresentado como o relatório oficial e final.
7. **Polimento visual geral**: revisar espaçamentos, alinhamento dos cards, quebras de página, hierarquia tipográfica, evitar viúvas/órfãs em parágrafos, garantir respiro entre seções, gráficos com paleta consistente (verde → dourado), tabelas sem linhas cortadas no rodapé.

## Dados a usar (V6 oficial)

| Indicador | Valor |
|---|---|
| Transportes concluídos | 32 |
| KM oficial | **5.811 km** (odômetro físico) |
| Combustível real | **R$ 3.337,06** (inclui Defender) |
| Veículos utilizados | 7 |
| Carrinhos elétricos (frota) | 22 |
| Retiradas / Devoluções | 221 / 228 |
| **Horas totais carrinhos** | calcular via `cart_history` (sessões fechadas) |
| **Horas médias por carrinho** | total ÷ 22 |
| Hóspedes cadastrados / transportados | 23 / 14 |
| Eventos vinculados | 19 |
| Equipe Logística (oficiais) | 9 |
| Autorizações de mobilidade | 195 |
| Ações auditadas | 476 |

Valores de horas serão obtidos consultando `cart_history` (ações `retirada`/`devolucao`) via `supabase--read_query` antes de gerar o PDF, pareando retirada → próxima devolução por `cart_id` e somando os minutos.

## Estrutura do PDF (10 páginas)

1. Capa institucional (idêntica ao V5)
2. Sumário Executivo + grid de KPIs (sem tarefas, sem custo estimado, com horas de carrinhos)
3. Análise de Transportes (texto + gráficos transportes/dia e km/dia)
4. Ranking de destinos + tabela diária
5. KM e Emissões — número oficial **5.811 km**, CO₂ ≈ 1.336 kg, **sem custo estimado**
6. Frota Botolli — tabela por veículo com KM e combustível real (sem coluna de custo estimado)
7. Carrinhos Elétricos — KPIs (22 / 221 / 228 / **horas totais** / **horas médias**), gráfico de uso por dia, top responsáveis
8. Hóspedes & Atendimentos
9. Eventos Vinculados (19) + Equipe Logística (9)
10. Mobilidade & Auditoria + Conclusão Institucional

## Implementação técnica

- Duplicar `/tmp/genrep_v5.py` → `/tmp/genrep_v6.py`.
- Antes de gerar, rodar `supabase--read_query` em `cart_history` (período 28/04 a 11/05/2026) para calcular horas totais e horas médias.
- Ajustar dicionário de KPIs: trocar KM, remover custo estimado, remover bloco de tarefas, adicionar horas.
- Remover funções/seções: `build_checklist_section`, `build_inconsistencias_section` (ou equivalentes do V5).
- Atualizar tabela da frota Botolli: remover coluna "Custo estimado (R$)".
- Polimento: revisar `Spacer`, `KeepTogether`, larguras de coluna, padding de cards, alinhamento vertical de números grandes.
- Atualizar header/footer e metadados para "v6".

## QA obrigatório

- `pdftoppm -jpeg -r 130 v6.pdf qa/page` em todas as páginas.
- Conferir página por página: capa idêntica, KM = 5.811 (nunca 6.314), nenhum "custo estimado" / "0,65", combustível = R$ 3.337,06, horas de carrinhos visíveis, **sem** seção de checklist, **sem** menção a V4/V5/inconsistências, sem patinetes.
- Validar quebras de página, alinhamento de tabelas e cards, ausência de overflow/clipping.
- Iterar até zero defeitos visuais.

## Entregável

`<lov-artifact path="Relatorio_Geral_Operacao_Logistica_Fenasoja_2026_v6.pdf" mime_type="application/pdf"></lov-artifact>`
