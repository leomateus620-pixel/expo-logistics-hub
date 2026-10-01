# Prova local de PostgreSQL e PostgREST

Em 01/10/2026, o smoke passou com PostgreSQL 16.15 e PostgREST 16.4 reais, portáteis, em `127.0.0.1:65439` e `127.0.0.1:5195`. O banco isolado usou dados sintéticos explicitamente identificados por `FIXTURE-*`. Nenhuma credencial, linha comercial ou banco publicado foi utilizado. Os processos encerraram e ambas as portas ficaram livres ao terminar.

## Reprodução no Windows

Na raiz do checkout, com Python, Node e PowerShell disponíveis:

```powershell
python scripts/dashboard/db-smoke-runtime.py
./scripts/dashboard/db-smoke.ps1
```

Os binários, dados temporários, JWT local e logs ficam exclusivamente em `.git/dashboard-db-runtime`. O script configura o PATH apenas no processo para localizar `libpq`, abre os processos ocultos e encerra os processos que criou em `finally`. Não instala serviços nem altera o PATH do usuário ou da máquina. Cada execução cria um banco novo; a fixture nunca deve ser aplicada a um banco Supabase existente.

Os binários PostgreSQL vêm do ZIP EDB indicado pela [página oficial do PostgreSQL para Windows](https://www.postgresql.org/download/windows/). A extração seletiva verifica o CRC dos arquivos ZIP; não verifica um SHA256 oficial de todo o arquivo de 373 MB. O ZIP [PostgREST 16.4](https://github.com/PostgREST/postgrest/releases/tag/v16.4) foi verificado contra o SHA256 publicado `29a5b56e5a09b7168bb552ef14aa7ade40bf0a81dd0687cffa86610187b89d78`. Fontes, tamanhos e hashes dos executáveis estão em [runtime-sources.json](runtime-sources.json).

## Resultados

- A view anterior veio da migration `20260926082845_1ddb8e8c-6673-4949-b593-3f3752d7fdbd.sql`, com `security_invoker=on` já existente preservado. Antes da alteração, o HTTP comprovou `42703` para `entity_id` e `PGRST200` para o embed.
- A migration `20261001193000_commercial_dashboard_financial_embed.sql` foi aplicada duas vezes. As 24 colunas existentes conservaram nomes e ordem; `entity_id` foi acrescentada ao final e `security_invoker=on` permaneceu ativo.
- O smoke extrai o `COMMERCIAL_LOT_SELECT` atual do serviço, remove whitespace como `.select()` do Supabase e usa os mesmos filtros de projeto, arquivamento e ordem por `id`, com páginas de 1.000 e `financial_entity.pricing.limit=1`. Não cria uma rota alternativa na aplicação.
- O embed real retornou objeto, vinculado ao mesmo `lot_id` e `entity_id`. Duas regras empatadas produzem duas linhas na view; empates em ambas as etapas produzem quatro. Com o limite do cliente, a leitura conservou 1.205 raízes distintas nas páginas 1.000 + 205, com um preço embutido por entidade. Ambiguidade, overrides manuais, valor zero e área ausente foram preservados.
- Histórico de dois registros `OPEN` permaneceu separado. Gestor recebeu sete vendas; leitor comum recebeu nenhuma; comissão recebeu somente as duas `CONFIRMED` do segmento autorizado. Comissão leu 1.100 lotes (1.000 + 100), e anônimo recebeu zero. A view respeitou lotes e entidades ocultos de outro projeto.

Tempo HTTP local por página, com `Prefer: count=exact`, incluindo leitura do JSON:

| Perfil | Linhas por página | Tempo em ms |
| --- | --- | --- |
| Gestor | 1.000 / 205 | 579 / 495 |
| Leitor | 1.000 / 205 | 556 / 549 |
| Comissão | 1.000 / 100 | 434 / 422 |
| Anônimo | 0 | 10 |

Esses tempos medem somente a fixture local, sem demonstrar desempenho de produção. O `unboundedTieProbe` é um diagnóstico de um lote com limite de raiz de uma linha; não estabelece o comportamento de uma página inteira sem o limite do filho. A consulta utilizada pela aplicação, com esse limite, foi validada integralmente.

Os JSONs [view-before.json](view-before.json), [view-after.json](view-after.json), [http-before.json](http-before.json) e [db-smoke-result.json](db-smoke-result.json) contêm somente metadados e resultados sintéticos. As expressões RLS foram reproduzidas, mas as funções auxiliares de organização/capability/segmento usam claims JWT locais para isolar o teste. Isso valida a aplicação dessas policies pelo PostgreSQL e o embed pelo PostgREST; não comprova configuração de autenticação, aplicação da migration ou autorização real em produção. A publicação exige aplicar a migration no ambiente autorizado e executar a verificação remota documentada pelo projeto.
