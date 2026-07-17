## Objetivo
Persistir os 8 compromissos institucionais listados na mensagem no módulo Cronograma e Eventos, categorizados como **"Representações"**, ano de ciclo **2026**, visíveis na Linha do Tempo e demais visões (Calendário, Categoria, etc.).

## Eventos a cadastrar (todos categoria "Representações", 2026)

| # | Data | Horário | Título | Local |
|---|------|---------|--------|-------|
| 1 | 20/07/2026 | 09:00 | Reunião com Jacson | Casa Fenasoja |
| 2 | 20/07/2026 | 14:00 | Reunião com Rodrigo | Casa Fenasoja |
| 3 | 20/07/2026 | 19:00 | Lançamento do Festival Gastronômico | Auditório do IFFar |
| 4 | 21/07/2026 | 07:15 | Café do Sindilojas | Botolli |
| 5 | 24/07/2026 | 08:00–11:00 | Encontro Regional de Inovação e Empreendedorismo | Auditório do Parque |
| 6 | 24/07/2026 | 12:00 | Almoço 10 anos Eficiência Buffet | Restaurante B. Industrial |
| 7 | 01/08/2026 | 10:00 | Ato de inauguração da Praça Pedro Carpenedo (obs: programação inicia 08:30) | Praça em frente Centro Cultural |
| 8 | 12–13/08/2026 | 07:15 (saída) | Eli Summit Ijuí (saída: SEMEAR AGRO HUB, RS 344 Km 39, 1100 — Timbaúva, Santa Rosa) | Ijuí |

## Como será feito

Uso da ferramenta de inserção do banco (Cloud) gravando diretamente em `public.cronograma_eventos` com os campos exigidos pelo esquema atual:

- `org_id` = organização única existente
- `category = 'Representações'`, `event_type = 'representacao'`
- `source_year = 2026`, `source_key = 'representacao-<slug>-<data>'` (garante idempotência caso rode 2x)
- `start_date`, `end_date`, `start_time`, `end_time`, `event_time` (texto amigável)
- `status = 'planejado'`, `priority = 'media'`, `has_exact_date = true`
- `is_official_seed = false`, `source_sheet = 'Cadastro manual — Representações'`
- `title` em MAIÚSCULAS (padrão do projeto), `location`, `description` (com observações — ex.: "Programação inicia 08:30" no item 7 e endereço de saída no item 8)
- `linked_commissions = '[]'`, `subevents = '[]'`, `lock_version = 1`

Grava tudo em uma única transação (`INSERT ... VALUES (...), (...), ...`) para atomicidade.

## Persistência e integração

- A `cronograma_eventos_full` (view usada pelo hook `useCronogramaEventos`) reflete automaticamente os novos registros — a Linha do Tempo passa a exibir julho e agosto/2026 com os cards.
- `_cronograma_log` não é chamado neste caminho porque estamos inserindo em nome do sistema, sem `auth.uid()`; para manter trilha, gravaremos uma linha em `audit_log` com resumo "8 eventos de Representações cadastrados".
- Não são criadas comissões/responsáveis relacionais (não foram informados). Podem ser adicionados depois pela UI via RPC já existente.

## Fora de escopo
- Criação de subeventos (nenhum foi descrito).
- Vínculo com comissões ou responsáveis (sem dados).
- Alterações de UI/tema.

Se aprovado, executo a migração de dados e confirmo com uma leitura mostrando os 8 registros criados.
