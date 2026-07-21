## Remoção de duplicidades em `cronograma_eventos`

Manter 1 registro por título (o mais antigo do ciclo) e apagar os 6 excedentes, junto com seus vínculos relacionais.

### Registros que serão removidos

| Título | ID removido | Ano mantido |
|---|---|---|
| Confraternização de Natal | `236b9e77…c64eb6c40147` (2027) | 2026 |
| Definir empréstimo veículos BOTOLLI | `d1f6c757…5538d66e222c` (2028) | 2027 |
| Definir Operação Estacionamento - MEGA | `55d588bf…9cbce361b11b` (2028) | 2027 |
| FIESTA NACIONAL DEL INMIGRANTE | `806e65a1…19eae3fba368` (2027) | 2026 |
| Lançamento da EXPODIRETO - POA / Não-Me-Toque / Carazinho | `247e127f…c2272535f459` (2028) | 2027 |
| Lançamento Fenasoja - Argentina / Paraguai / locais | `a165e3b7…86ecaa59651d` (2028) | 2027 |

### Operações (uma migração transacional)

1. `DELETE` em `cronograma_evento_comissoes` para os 6 IDs.
2. `DELETE` em `cronograma_evento_responsaveis` para os 6 IDs.
3. `DELETE` em `cronograma_subeventos` para os 6 IDs (limpeza defensiva).
4. `DELETE` em `cronograma_eventos` para os 6 IDs.

Nenhuma alteração de código é necessária — só limpeza de dados.

Aprove para eu executar.