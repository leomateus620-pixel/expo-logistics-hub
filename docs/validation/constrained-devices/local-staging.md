# Staging Supabase local isolado — preparação e pendência

O usuário autorizou staging local isolado durante esta tarefa. A disponibilidade foi verificada em 11/10/2026 no host macOS: Docker, Supabase CLI, psql, pg_ctl, Colima e Podman não estão no PATH; Docker.app, OrbStack.app, executáveis em `/opt/homebrew/bin`/`/usr/local/bin` e sockets Docker usuais também não existem. O runtime Node do Codex está disponível. **Nenhum serviço, banco, migration, seed, Storage ou Function foi iniciado/aplicado nesta verificação.** Esta é uma instrução de preparação, não evidência de teste comercial/RLS concluído.

O repositório contém 275 migrations, nenhum seed local e nenhum `supabase/.temp/project-ref`. O `supabase/config.toml` atual identifica o projeto publicado. Para o staging, usar uma configuração criada do zero em diretório separado; não copiar esse config nem credenciais, dumps, tokens ou objetos de Storage da produção.

## Dependências para desbloquear

Disponibilizar um Docker Engine compatível e ativo, Supabase CLI e um cliente psql. Registrar versões, imagem PostgreSQL/extensões, portas e SHA da base/candidato. A CLI local usa containers para Auth/API/Postgres/Storage; os comandos e o isolamento por workdir são descritos na [documentação oficial da CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) e na [referência de migration up](https://supabase.com/docs/reference/cli/supabase-migration-up).

Não foi instalado um substituto de banco, nem provisionado projeto cloud. A compatibilidade das 275 migrations com uma instalação vazia ainda precisa ser comprovada; várias migrations históricas presumem dados ou infraestrutura já existentes. Eventual falha deve ser registrada com arquivo/SQLSTATE, sem alterar RLS, política comercial ou migration de produção para apenas passar o ensaio.

## Por que migrations exigem uma etapa de isolamento

As migrations `20260722234000_google_calendar_oauth_hardening.sql`, `20260723004740_6391f529-764b-431b-b772-df501ad186f8.sql`, `20260723005339_ed2f47bd-0fa2-4eff-8fe0-fa728775ef89.sql`, `20260813234500_create_agenda_meeting_intelligence_v2.sql`, `20260814141403_966c3963-1c68-4bf8-af90-025c50cc9192.sql` e `20260814141536_4f807be9-c10e-4aca-aa6d-22a3c71e8992.sql` criam funções/schedules pg_cron/pg_net com destinos de workers publicados. Portanto o banco vazio deve iniciar **sem essas migrations**, e o launcher cron deve ser desligado e conferido antes de copiá-las/aplicá-las. Não invocar manualmente funções `invoke_*` neste staging. Configurações de e-mail/OAuth/push e credenciais de terceiros não são necessárias ao ensaio do mapa.

`cron.launch_active_jobs=off` impede o launcher de executar os jobs ativos e pode ser aplicado com `ALTER SYSTEM` + reload; essa configuração é documentada pelo [projeto pg_cron](https://github.com/citusdata/pg_cron#extension-settings). Se a imagem não reconhecer/aplicar esse parâmetro, parar antes de migrations. O staging também deve bloquear saída dos serviços locais para os hosts de produção durante ensaios de escrita; a forma depende do Docker/firewall disponível e ainda não foi aplicada neste host. Só desligar cron não é uma barreira para uma invocação manual de função pg_net.

## Início e comprovação de destino

Com as dependências disponíveis, preparar um diretório novo e exclusivo, por exemplo `/tmp/fenasoja-commercial-map-staging.local`. Não reutilizar um staging de outro projeto; se o diretório existir, inspecionar seu dono e conteúdo antes de continuar. Os comandos abaixo são roteiro não executado:

```sh
mkdir /tmp/fenasoja-commercial-map-staging.local
supabase init --workdir /tmp/fenasoja-commercial-map-staging.local
```

Editar **somente** o novo `/tmp/fenasoja-commercial-map-staging.local/supabase/config.toml`: project_id `fenasoja-commercial-map-local`; Auth site_url/redirect_urls para a origem loopback de frontend; nenhum provider/hook externo. Conferir portas livres (padrões API 54321/DB 54322/Studio 54323) e registrar qualquer mudança. Nesse momento `supabase/migrations` está vazio.

```sh
supabase start --workdir /tmp/fenasoja-commercial-map-staging.local
```

O startup/status pode mostrar chaves **locais**; guardá-las só em arquivos privados `.local`, sem transcript, commit ou relatório. Conferir que API, Auth e Storage anunciados são loopback e que o container PostgreSQL tem o project_id local. Conectar psql ao DB loopback, sem uma URL de produção; usar prompt de senha local se necessário:

```sh
PGHOST=127.0.0.1 PGPORT=54322 PGDATABASE=postgres PGUSER=postgres psql -X -v ON_ERROR_STOP=1
```

Dentro desta sessão, antes de migrations:

```sql
SELECT current_database(), inet_server_addr(), inet_server_port();
ALTER SYSTEM SET cron.launch_active_jobs = 'off';
SELECT pg_reload_conf();
SHOW cron.launch_active_jobs;
```

Exigir `off` em uma conexão nova; observar a versão/extensão da imagem. Confirmar o bloqueio de saída para produção antes do próximo passo. Copiar somente os arquivos versionados `supabase/migrations/*.sql` para o diretório novo preservando nome/bytes e aplicar localmente:

```sh
supabase migration up --local --workdir /tmp/fenasoja-commercial-map-staging.local
```

Não usar link, db push, db pull, --linked nem URL remota. Depois conferir, exclusivamente no DB local, `SHOW cron.launch_active_jobs`, número de migrations aplicadas, contagem de jobs e ausência de execuções (`cron.job_run_details`) e requests pg_net. Não publicar o conteúdo dos jobs, secrets/vault, headers, tokens ou credenciais. Não usar `db reset` como início rápido: ele pode recriar o banco antes da conferência de cron/isolamento.

## Dados, Storage, Functions e frontend

Após migrations/isolamento comprovados, criar usuários, organização, capabilities e dados comerciais **sintéticos** via Auth Admin/API local e RPCs normais; usar a planta oficial versionada da mesma revisão em ambas as condições. Nenhum lote de produção deve ser reservado, vendido, confirmado ou cancelado. O roteiro mínimo precisa de usuário `map.view`, usuário de comissão com capability segmentada, gestor Vendas/contratos e público com link criado no DB local. Um seed idempotente completo ainda não foi preparado porque o esquema vazio não pôde ser aplicado; inventar relações/grants sem o banco real daria falsa validação de permissões.

Os buckets privados do mapa devem vir das migrations. Subir apenas anexos/logos sintéticos; testar autorização de Storage, expiração de URL e contrato ORDER_ITEMS com um arquivo/múltiplos vínculos sem replicar blobs. A Function `commercial-sale-logo-urls` usa `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` do ambiente; copiar apenas essa Function para o scratch e servi-la localmente quando necessária, sem iniciar workers de Google/e-mail/push/Agenda. O template novo de CLI pode exigir ajustes de verify_jwt coerentes com a função; verificar na mesma versão de CLI sem copiar configuração externa inteira.

```sh
supabase functions serve commercial-sale-logo-urls --workdir /tmp/fenasoja-commercial-map-staging.local
```

Criar no checkout do frontend `.env.staging-local.local` privado/ignorado com `VITE_SUPABASE_URL` loopback e `VITE_SUPABASE_PUBLISHABLE_KEY` local. O cliente atual lê exatamente essas duas variáveis (`src/integrations/supabase/client.ts`). Executar Vite com `--mode staging-local` em origem separada, sem sessão/browser profile de produção. Antes de qualquer cenário de escrita, o harness deve recusar requisições Auth/REST/Storage/Functions a qualquer host fora do allowlist loopback; isso comprova o destino e deve falhar visivelmente se a configuração local não sobrepor a `.env` existente.

O ensaio não está concluído enquanto faltar a aplicação completa do esquema, seed local, allowlist de rede, Auth/Storage/Function local, Vendas/contratos/parcelas e RPCs/permissões reais. A fixture de frontend sem backend é útil para preservar imagem/ações de UI, mas não certifica essas transações nem acesso público/comissão autenticado.

## Parar e retomar

Interromper o processo `functions serve` e Vite explicitamente. Parar somente o projeto scratch:

```sh
supabase stop --workdir /tmp/fenasoja-commercial-map-staging.local
```

Não usar --no-backup nem remover volumes/pastas para parar. Na retomada, conferir novamente project_id/portas, loopback, bloqueio de saída e `cron.launch_active_jobs=off` antes de ações. Parar o staging não altera o deploy publicado nem o checkout/config de produção. Documentar recursos retidos e diretório para retomada; limpeza destrutiva é separada do encerramento normal.
