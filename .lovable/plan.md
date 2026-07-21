## Objetivo
Adicionar ao módulo **Cronograma e Eventos** os 20 eventos do documento `EVENTOS_FENASOJA_2026_2.docx`, todos vinculados à **Comissão CENTRAL** e à responsável **ZÉLIA SAVOLDI**. O evento "Encontrão dos voluntários" (26/09/2026) já existe e será ignorado.

## Regras de data
- Datas com dia e mês preenchidos → salvas como data exata (`has_exact_date = true`).
- Datas com **dia "00"** → salvas **sem data** (`start_date = NULL`, `has_exact_date = false`). O mês, quando existir, entra apenas como referência no campo `month_label`.

## Categoria e tipo
- Categoria: **Representações** (mesma criada anteriormente para lançamentos institucionais).
- `event_type`: `representacao` para lançamentos/aberturas/encerramentos; `evento_institucional` para Domingo Macanudo, Brincando com Sojinha, Jantar, Noite das Homenagens, Encontrão etc.

## Eventos a cadastrar

| # | Data | Título | Local |
|---|------|--------|-------|
| 1 | sem data / 2026 | Lançamento da identidade visual da Fenasoja 2028 | Restaurante Fenasoja |
| 2 | sem data / ago 2026 | Lançamento Fenasoja Festa dos Imigrantes – Argentina (em Santa Rosa) | Auditório do Parque |
| 3 | sem data / fev 2027 | Lançamento Fiesta del Té – Santa Rosa | Auditório do Parque |
| 4 | sem data / mar 2027 | Lançamento Exposición Agroindustrial Oberá (em Santa Rosa) | Auditório do Parque |
| 5 | sem data / 2027 | Soy Summit | MEA (a confirmar) |
| 6 | 07/03/2027 | Domingo Macanudo | Parque |
| 7 | 12/09/2027 | Domingo Macanudo | Parque |
| 8 | 23/10/2027 | Brincando com Sojinha | Parque |
| 9 | 20/02/2028 | Evento 100 dias para a Fenasoja | Restaurante Fenasoja |
| 10 | 10/03/2028 | Lançamento da 3ª edição da Revista Turma do Sojinha | Centro Cívico |
| 11 | 12/03/2028 | Domingo Macanudo | Parque |
| 12 | 20/03/2028 | Lançamento Fenasoja Porto Alegre | A definir |
| 13 | 06/04/2028 | Lançamento Fenasoja Posadas | Sede do Governo |
| 14 | 07/04/2028 | Lançamento da Fenasoja em Oberá | A definir |
| 15 | 28/04/2028 | Soy Summit | Centro Cívico |
| 16 | 28/04/2028 | Jantar Berço Nacional da Soja | Restaurante Fenasoja |
| 17 | 29/04/2028 | Abertura Oficial da Fenasoja | Restaurante Fenasoja |
| 18 | 02/05/2028 | Noite das Homenagens | Auditório do Parque |
| 19 | 07/06/2028 | Café com Expositores – Divulgação do Vice-Presidente da Fenasoja 2030 | Auditório do Parque |
| 20 | 20/06/2028 | Encerramento das atividades da Fenasoja 2028 | Restaurante Fenasoja |

*Observação:* o sistema já possui registros com títulos parecidos (ex.: "Evento 100 dias - Imprensa", "Lançamento Fenasoja - Argentina / Paraguai / locais"). Conforme sua orientação, apenas o "Encontrão dos voluntários" será ignorado; os demais serão cadastrados como novos itens conforme o documento oficial.

## Detalhes técnicos
- Inserção direta em `public.cronograma_eventos` (org da CENTRAL) via ferramenta de dados.
- `source_key` único no formato `doc-eventos-2026_2-<slug>-<n>` para permitir upsert idempotente e evitar duplicar caso o plano seja reexecutado.
- Snapshots preenchidos: `commission_id` = CENTRAL, `commission_slug` = `central`, `commission_name` = "CENTRAL", `responsible_name` = "ZÉLIA SAVOLDI".
- Vínculos relacionais inseridos em `cronograma_evento_comissoes` (CENTRAL como `participante`/`principal`) e `cronograma_evento_responsaveis` (Zélia com `responsible_type='member'`, `is_primary=true`, `org_member_user_id` = `38e7e8d3-4c66-4279-92ea-961b70ee4e80`).
- Registro em `audit_log` da carga em lote para rastreabilidade.
