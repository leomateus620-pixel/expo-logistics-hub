## Sincronização via pg_dump completo (`fenasojalog_260715.backup`)

O arquivo enviado é um `pg_dump` custom (v18.4) contendo `auth.users` + todas as 45 tabelas `public.*`. Isso permite sobrescrever tudo neste projeto preservando UUIDs de usuários, IDs, timestamps e relações.

### Fase 1 — Preparação
- Extrair do backup, em `/tmp/`:
  - `auth_users.sql` — só `auth.users` (id, email, encrypted_password, raw_user_meta_data, created_at)
  - `public_data.sql` — dados de todas as 45 tabelas `public.*` (data-only, sem DDL)
- Conferir headers vs. schema atual deste projeto. O codebase é o mesmo (remix), então espera-se compatibilidade total; se algo divergir, gero **uma migration única** (ADD COLUMN / ALTER TYPE / policies + GRANTs faltantes) antes da Fase 3.

### Fase 2 — Restaurar `auth.users` com UUIDs originais
Não podemos escrever direto em `auth.users` via migration. Vou criar uma **edge function temporária `restore-auth-users`** (verify_jwt=false, chamada uma única vez com um token pré-compartilhado que você define):
- Lê a lista de usuários exportada (embutida no deploy).
- Para cada usuário chama `supabase.auth.admin.createUser({ id: <uuid_original>, email, password: <senha_temporária>, email_confirm: true, user_metadata })`, preservando o UUID.
- Retorna relatório: criados / já existentes / erros.
- Depois de rodar com sucesso, a função é deletada.

Você me confirma se prefere:
- **(a)** Uma senha temporária única para todos (ex.: `Fenasoja@2026`) — usuários trocam depois.
- **(b)** Manter os hashes originais do backup — nesse caso preciso inserir direto em `auth.users` via migration (mais invasivo, mas funciona; hoje é a única forma de preservar senhas).

### Fase 3 — Sobrescrever dados de `public.*`
Em uma única transação:
1. `SET session_replication_role = replica;` — desativa **todos** os triggers de validação (`validate_transport`, `validate_vehicle_usage`, `cascade_delete_*`, `invalidate_old_weather_snapshots`, etc.) e FKs durante a carga.
2. `TRUNCATE` em cascade de todas as 45 tabelas `public.*`.
3. Executar `public_data.sql` via `psql` (o pg_restore gera `COPY ... FROM stdin`, ordem correta de dependências já resolvida pelo `pg_dump`).
4. `SET session_replication_role = origin;` — reativa triggers.
5. `SELECT setval(...)` em todas as sequences se necessário (o dump já traz).
6. Relatório: `SELECT count(*)` por tabela × totais esperados do backup.

Como o tool `supabase--insert` aceita insert/update/delete e o psql do sandbox aceita insert, e a Fase 3 mistura TRUNCATE + COPY + SET, vou empacotar tudo em **uma migration única** (migrations aceitam qualquer DML/DDL e rodam com privilégio total).

### Fase 4 — Storage buckets (opcional)
Arquivos em `fuel-receipts`, `vehicle-documents`, `expense-documents` **não** estão no `pg_dump` (Storage é separado). Se quiser trazer, você exporta os arquivos do projeto origem (zip) e eu re-upo mantendo os `storage_path` gravados nas tabelas.

### Fase 5 — Limpeza
- Deletar a edge function `restore-auth-users`.
- Deletar arquivos temporários em `/tmp/`.

---

### O que preciso decidir antes de executar
1. **Senhas** (Fase 2): opção (a) senha única temporária, ou (b) preservar hashes originais via migration direta em `auth.users`?
2. **Storage** (Fase 4): trazer os arquivos ou pular?
3. **Confirmação**: aprovar para eu sair de plan mode e executar.
