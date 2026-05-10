## Atualização V9 — Seção de Hóspedes enriquecida (base V8)

Mantém **100% do design e demais conteúdos do V8**. Altera somente a Seção 5 — Hóspedes & Atendimentos — para tornar a informação rica, completa e auditável.

### Dados oficiais do banco (validados em `guests` + `transport_guests`)

- **23 hóspedes cadastrados** no período da feira
- **14 hóspedes transportados** (com ao menos 1 viagem vinculada)
- **9 hóspedes sem transporte** (estadia própria / autossuficientes)
- **32 vínculos hóspede ↔ transporte** — bate exatamente com os 32 transportes concluídos

### Distribuição por hotel (todos os 23)

| Hotel | Hóspedes |
|---|---|
| Imigrantes | 9 |
| Benos Hotel | 7 |
| Centro Santo Ângelo | 1 |
| Prefeito Mantei | 1 |
| Villas Hotel | 1 |
| Imigrantes → Guia Lopes | 1 |
| Em casa | 1 |
| Sem hotel informado | 2 |

### Hóspedes transportados (14) — ordenados por viagens

| Convidado | Hotel | Transportes |
|---|---|---|
| Walter Lehenbauer + 3 acompanhantes | — | **9** |
| Luis Fernando Muñoz | Imigrantes | 4 |
| Verônica Muccini Longhi | Imigrantes / Guia Lopes | 4 |
| Alexandre Gadret e esposa | Prefeito Mantei | 2 |
| Erasmo Battistella | — | 2 |
| Luiz Carlos Molion | Benos Hotel | 2 |
| Paulo Guedes | Imigrantes | 2 |
| Daniel Carnio Costa | Benos Hotel | 1 |
| Daniel Popov | Benos Hotel | 1 |
| Família Walter | Imigrantes | 1 |
| Paulo Hermann | Imigrantes | 1 |
| Renato Buranello | Benos Hotel | 1 |
| Rosane de Oliveira | Centro Santo Ângelo | 1 |
| Tiago Maique | Benos Hotel | 1 |
| **TOTAL** | — | **32** |

### Hóspedes cadastrados sem transporte (9)

Cristian de Leon Fedrizzi Petalas e Cláudio Zigiotto (Band), Daniel Fontana, Jerônimo Goergen, Júnior Gilliard e Thiago Facco, Mariângela da Cunha, Ricardo Emílio Zimmermann, Rodrigo Salton Schneider, Rodrigo Simch, Valmor (Presidente do PT).

### Mudanças no PDF (somente Seção 5)

1. **KPI grid** — manter (23 / 14 / 9), adicionar 4º card "VÍNCULOS DE VIAGEM = 32" para amarrar com a Seção 1.
2. **Texto introdutório** — parágrafo curto explicando que a feira recebeu 23 convidados oficiais distribuídos em 8 hospedagens, e que as viagens cobriram 14 deles (9 deslocaram-se por meios próprios).
3. **Tabela "Distribuição por hospedagem"** — 8 linhas + total (23).
4. **Tabela "Hóspedes transportados — viagens vinculadas"** — substitui a tabela atual (que estava incompleta com 7 linhas e tudo "1"). Agora 14 linhas + total = 32. Colunas: Convidado · Hotel · Viagens.
5. **Bloco "Cadastrados sem transporte (9)"** — parágrafo em fonte SMALL listando os 9 nomes.
6. Layout: a Seção 5 passa a ocupar **2 páginas** (separadas por `PageBreak`) para evitar overflow. Tabelas com `KeepTogether` quando couber.

### Implementação

- Duplicar `/tmp/genrep_v8.py` → `/tmp/genrep_v9.py`.
- Atualizar `OUT` para `Relatorio_Geral_Operacao_Logistica_Fenasoja_2026_v9.pdf` e `CHART_DIR` para `/tmp/charts_v9`.
- Substituir o bloco "p8: Hóspedes" (linhas ~367–387) pelo novo conteúdo descrito acima. Sem tocar em capa, KPIs gerais, frota, KM, carrinhos, eventos, equipe, mobilidade, auditoria ou conclusão.

### QA obrigatório

- Rodar o script e validar exit code 0.
- `pdftoppm -r 90` em todas as páginas.
- Inspecionar visualmente as páginas da nova Seção 5: sem texto cortado, sem overflow de tabela, totais batendo (23 hospedagem, 32 viagens), 14 nomes presentes, 9 não-transportados listados.
- Conferir que páginas anteriores e posteriores continuam idênticas ao V8.

### Entregável

`Relatorio_Geral_Operacao_Logistica_Fenasoja_2026_v9.pdf`
