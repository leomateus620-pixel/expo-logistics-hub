## Objetivo

Gerar um único PDF consolidado (`Relatorio_Geral_Operacao_Logistica_Fenasoja_2026_v3.pdf`) que une:

- **Parte A (executiva — do v2):** capa institucional, KPIs corrigidos (KM, combustível, equipe), gráficos, rankings, auditoria de KM e inconsistências.
- **Parte B (operacional integral — do v1 ampliado):** todos os módulos do sistema com seus registros consolidados do período 28/04 → 10/05/2026.

Mesmo design liquid glass (verde Fenasoja #19401E + dourado #DCBE50), tipografia, cabeçalho/rodapé e paleta do v2.

## Estrutura do PDF (≈ 25–30 páginas)

```
1.  Capa institucional
2.  Sumário executivo + índice
3.  KPIs principais (18 cards)
4.  Auditoria de KM (5.811 odômetro + 503 Defender = 6.314 oficial,
    vs. 4.410 Google, vs. 5.180 Botolli — explicação)
5.  Combustível detalhado (15 registros, R$ 3.337,06)
6.  Equipe Logística (9 membros oficiais)
7.  Gráficos: transportes/dia, KM/dia, ranking destinos,
    ranking hóspedes, distribuição por equipe
8.  Inconsistências e alertas
─── Parte B: Dados integrais por módulo ───
9.  Transportes (todos os registros do período)
10. Veículos + Uso de veículos + Abastecimentos
11. Hóspedes
12. Agenda / Eventos Fenasoja
13. Tarefas / Checklists
14. Carrinhos elétricos (frota + reservas + histórico)
15. Patinetes (frota + reservas + histórico)
16. Escalas + turnos + atribuições
17. Despesas + reembolsos + categorias
18. Autorizações de mobilidade + comitês
19. Equipe completa (org_members)
20. Notificações configuradas
21. Nota metodológica + assinatura
```

## Dados — fontes corretas (consolidadas do v2)

| Métrica | Valor oficial | Fonte |
|---|---|---|
| KM total operação | **6.314 km** | odômetros (5.811) + Defender estimado (503 via 71,87 L) |
| KM Google estimado | 4.410 km | `transports.distancia_estimada_km` (subestima urbano) |
| KM Botolli | 5.180 km | aggregate intermediário (informativo) |
| Combustível | **R$ 3.337,06 / 462,60 L** | 15 registros incluindo Defender 4x4 |
| Transportes | 32 | `transports` no período |
| Carrinhos — retiradas | 221 | `cart_history` |
| Equipe LOGÍSTICA | 9 membros | filtro `commission = 'LOGÍSTICA'` |

Cada módulo da Parte B traz: total de registros, criados no período, alterados, tabela completa com colunas-chave (igual `systemReportCollector` já define), e bloco de inconsistências detectadas.

## Implementação técnica

- Script Python em `/tmp/genrep_v3.py` usando `reportlab` (mesma stack do v2).
- Consultas via `psql` para extrair os dados de cada tabela do período.
- Reuso integral do estilo visual do v2 (cores, fontes, header/footer, KPI cards, tabelas alternadas verde/creme, headers verde escuro com texto dourado).
- Gráficos com `matplotlib` (já usados antes) embutidos como PNG.
- QA obrigatório: `pdftoppm` em todas as páginas, inspeção visual de overflow/clipping antes de entregar.
- Saída final: `/mnt/documents/Relatorio_Geral_Operacao_Logistica_Fenasoja_2026_v3.pdf` + `<lov-artifact>`.

## O que NÃO muda

- Nenhuma alteração no código do app (sem mexer em `SystemReportPage`, hooks ou tabelas).
- Operação puramente de geração de artefato em `/mnt/documents/`.
