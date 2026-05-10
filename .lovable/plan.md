## Objetivo

Gerar `Relatorio_Geral_Operacao_Logistica_Fenasoja_2026_v5.pdf` em `/mnt/documents/` reproduzindo o **design institucional** do PDF enviado (capa verde profunda com círculo decorativo, faixas douradas, cabeçalho/rodapé fixos em cada página, tipografia hierárquica, cards de KPI em grid 3×N) **populado com os dados corrigidos do V4**.

## Identidade visual (espelhar o upload)

- Capa: fundo verde escuro `#0F3D1F`, círculo decorativo verde `#1F6B3A` no canto superior direito, duas faixas douradas `#E2C24A` (topo e base do bloco central), título branco bold grande, subtítulo "Período · 28/04/2026 a 10/05/2026" em dourado, bloco "STATUS DA OPERAÇÃO / Operação concluída com excelência" no rodapé.
- Páginas internas: faixa fina verde no topo com "FENASOJA 2026 · LOGÍSTICA" em branco + período/data em cinza claro à direita, conteúdo em fundo branco, títulos de seção em verde escuro com underline dourado, rodapé "Relatório Geral da Operação Logística · Fenasoja 2026  ·  Página N".
- KPIs: cards em grid 3 colunas — label em uppercase dourado pequeno, número grande em verde escuro bold, descrição em cinza.
- Tabelas: header verde escuro com texto dourado, linhas alternadas brancas/creme, bordas finas.
- Gráficos (matplotlib): barras verdes com gradiente para dourado, eixos limpos, sem moldura.

## Dados a usar (do V4 / corrigidos)

| Indicador | Valor |
|---|---|
| Transportes concluídos | 32 |
| KM consolidado oficial | **6.314 km** (5.811 odômetro + 503 Defender 4x4) |
| Combustível | **R$ 3.337,06** (inclui Defender) |
| Custo estimado da frota | R$ 4.104,10 (6.314 × 0,65) |
| Veículos utilizados | 7 |
| Carrinhos elétricos (frota) | **22** |
| Retiradas / Devoluções carrinhos | 221 / 228 |
| Hóspedes cadastrados / transportados | 23 / 14 |
| Eventos vinculados | 19 |
| Tarefas total / concluídas / pendentes | 13 / 1 / 12 |
| Equipe Logística (oficiais) | **9 membros** |
| Autorizações de mobilidade | 195 |
| Ações auditadas | 476 |
| **Patinetes** | **REMOVIDO** |

Auditoria de KM exibida em destaque (seção própria) explicando as 3 fontes que existiam no sistema (Dashboard 5.811 odômetro / Botolli 5.180 / Relatório antigo 4.520) e justificando o número oficial **6.314 km**.

## Estrutura do PDF (10–12 páginas)

1. **Capa** institucional (idêntica ao upload, sem mudança visual)
2. **Sumário Executivo** + grid 4×3 de KPIs (12 cards, sem Patinetes)
3. **Análise de Transportes** — texto + gráfico "Transportes por dia" + "KM por dia"
4. **Ranking de destinos** + tabela diária com totais (32 / 6.314)
5. **KM, Odômetro e Emissões** — auditoria das 3 fontes + número oficial 6.314, custo R$ 4.104,10, CO₂ ≈ 1.452 kg
6. **Frota Botolli** — tabela por veículo (incl. Defender 4x4) com KM e custo
7. **Carrinhos Elétricos** — KPIs (22 / 221 / 228), gráfico de uso por dia, top responsáveis
8. **Hóspedes & Atendimentos** — KPIs + top palestrantes transportados
9. **Eventos Vinculados (19)** + **Equipe Logística (9 membros oficiais)** com tabela nome/cargo
10. **Checklist & Tarefas** + **Mobilidade & Auditoria** (195 autorizações, 476 ações)
11. **Inconsistências resolvidas** — conciliação KM, combustível, carrinhos
12. **Conclusão Institucional** — parágrafo final + linha-resumo com os números corretos

## Implementação técnica

- Script Python `/tmp/genrep_v5.py` usando `reportlab` (Platypus + Canvas para capa/cabeçalhos) e `matplotlib` para 3 gráficos (transportes/dia, km/dia, uso carrinhos/dia).
- Reaproveitar cores e estrutura de `genrep_v4.py` mas **redesenhar capa e cabeçalhos** para espelhar o upload (círculo decorativo via `canvas.circle`, faixas douradas via `canvas.rect`).
- Fontes: Helvetica-Bold para títulos, Helvetica para corpo (built-in, sem risco de glifos faltando).

## QA obrigatório

- `pdftoppm -jpeg -r 130 v5.pdf qa/page` em todas as páginas.
- Inspeção visual de cada página: confirmar capa idêntica ao upload, ausência de "Patinetes", carrinhos = 22, KM = 6.314, combustível = R$ 3.337,06, equipe = 9.
- Verificar overflow de tabelas, alinhamento de cards, rodapé/cabeçalho em todas as páginas.
- Iterar até zero defeitos visuais.

## Entregável

`<lov-artifact path="Relatorio_Geral_Operacao_Logistica_Fenasoja_2026_v5.pdf" mime_type="application/pdf"></lov-artifact>`
