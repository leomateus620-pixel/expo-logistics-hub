
# Sincronização completa do banco (schema + dados) via CSVs

O projeto de origem `A2tcfX2gomzgq8eaSuEw` não está acessível neste workspace, então não consigo ler suas migrations nem seus dados diretamente. Vamos operar em duas frentes: (1) schema já está em grande parte alinhado (é o mesmo codebase remixado) e ajusto o que faltar via migration; (2) você exporta cada tabela como CSV do projeto de origem e eu importo aqui, sobrescrevendo tudo.

## Fase 1 — Você exporta os CSVs no projeto de origem

No projeto de origem, abra **Cloud → Advanced settings → Export data** e exporte **todas as tabelas do schema public** como CSV. As tabelas atualmente existentes nesta conta destino (que precisam receber dados) são:

```text
organizations, org_members, profiles, user_roles, user_capabilities,
commissions, official_committees,
guests, transports, transport_guests, transport_locations,
transport_weather_snapshots, transport_weather_alerts, weather_city_cache, weather_sync_jobs,
vehicles, vehicle_usage, fuel_records,
electric_carts, cart_reservations, cart_history,
scooters, scooter_reservations, scooter_history,
events, fenasoja_events, schedules, schedule_shifts, shift_assignments, tasks,
expenses, expense_documents, expense_approvals, expense_categories, reimbursements,
mobility_authorizations, committee_mobility_forms, committee_mobility_members,
public_form_links, public_mobility_forms, public_mobility_members, public_form_audit,
notification_recipients, audit_log, security_audit_reports
```

Anexe os arquivos no chat (pode ser em um ZIP). Confirme também se o projeto de origem tem alguma tabela `public.*` que **não** está na lista acima — se sim, me avise para incluir.

## Fase 2 — Alinhamento de schema (se necessário)

Assim que receber os CSVs, comparo o cabeçalho de cada um com as colunas atuais da tabela destino. Se houver colunas faltando/renomeadas/tipos diferentes, gero **uma migration única** que ajusta o schema (ADD COLUMN, ALTER TYPE, novas tabelas, novas policies + GRANTs) antes de qualquer INSERT. Se estiverem idênticos, pulo esta fase.

## Fase 3 — Sobrescrita total dos dados (TRUNCATE + INSERT)

Ordem executada em uma única transação para preservar FKs e triggers:

1. **Desabilitar temporariamente triggers de validação** (`validate_transport`, `validate_vehicle_usage`, `validate_cart_reservation`, `validate_scooter_reservation`, `validate_guest`, `cascade_delete_*`, `cleanup_transport_location_on_status_change`, `invalidate_old_weather_snapshots`) — os dados vindos da origem já são consistentes e re-validar pode rejeitar linhas legítimas.
2. **`TRUNCATE ... RESTART IDENTITY CASCADE`** em todas as tabelas listadas, respeitando a ordem inversa de dependências.
3. **COPY FROM STDIN** de cada CSV (via `psql`), na ordem de dependências:
   - Nível 0: `organizations`, `profiles` (já povoada por trigger `handle_new_user`; UPSERT), `user_roles`, `user_capabilities`, `org_members`, `commissions`, `official_committees`, `expense_categories`, `weather_city_cache`, `notification_recipients`
   - Nível 1: `guests`, `vehicles`, `electric_carts`, `scooters`, `events`, `fenasoja_events`, `schedules`, `public_form_links`, `committee_mobility_forms`
   - Nível 2: `transports`, `vehicle_usage`, `fuel_records`, `cart_reservations`, `scooter_reservations`, `schedule_shifts`, `tasks`, `expenses`, `public_mobility_forms`, `committee_mobility_members`, `mobility_authorizations`
   - Nível 3: `transport_guests`, `transport_locations`, `transport_weather_snapshots`, `transport_weather_alerts`, `cart_history`, `scooter_history`, `shift_assignments`, `expense_documents`, `expense_approvals`, `reimbursements`, `public_mobility_members`, `public_form_audit`, `audit_log`, `security_audit_reports`, `weather_sync_jobs`
4. **Reabilitar triggers** e rodar um `SELECT count(*)` por tabela para conferir totais com os CSVs (log em resposta).

## Fase 4 — Vinculação de usuários e itens fora do banco

Alguns pontos que **não** vêm no export do `public.*` e que você precisa saber:

- **`auth.users`** (contas de login) é gerenciado pelo Supabase e não é exportado. Os `user_id` que aparecerão em `org_members`, `user_roles`, `profiles`, `transports.motorista_user_id`, etc. **só funcionarão se os mesmos UUIDs existirem em `auth.users` deste projeto**. Se as contas ainda não existem aqui, ou os UUIDs são diferentes, o login vai falhar e RLS bloqueará tudo. Duas opções que decidiremos depois de ver os CSVs:
  1. Recriar cada usuário via Admin API neste projeto reaproveitando o UUID original (precisa que você me confirme a lista de e-mails) — mantém dados 100% ligados.
  2. Aceitar que só o Admin `fenasojalog@gmail.com` fará login e me passar o UUID novo dele; eu remapeio todos os `user_id` dos CSVs para esse único UUID.
- **Storage buckets** (`fuel-receipts`, `vehicle-documents`, `expense-documents`): os arquivos em si (comprovantes/PDFs) precisariam ser copiados à parte. Se você quiser trazê-los, exporte-os do painel de Storage do projeto origem e eu subo no destino mapeando pelos `storage_path` gravados nas tabelas.
- **Secrets de Edge Functions** já estão configurados neste projeto (`GOOGLE_MAPS_API_KEY`, etc.) — nada a fazer.

## Detalhes técnicos

- Toda a Fase 3 roda via `supabase--insert` (permite INSERT/UPDATE/DELETE) e/ou `psql` com `COPY FROM /tmp/<tabela>.csv WITH CSV HEADER` para performance em tabelas grandes (`audit_log` 1169 linhas, `cart_history` 522, `transport_weather_snapshots` provavelmente muitas).
- CSVs enviados por você ficam disponíveis em `/mnt/user-uploads/`, copio para `/tmp/` antes do `COPY`.
- Colunas geradas (`transports.km_rodados` GENERATED ALWAYS) são ignoradas no INSERT — projeto os valores automaticamente pelas colunas de origem/destino.
- Colunas com defaults (`created_at`, `updated_at`, `id`) são preservadas do CSV para manter o histórico exato.
- Ao final, um relatório mostra: total esperado (do CSV) × total inserido × diferenças por tabela.

## O que preciso de você para começar

1. Confirme este plano.
2. Envie o ZIP (ou os CSVs soltos) com os exports.
3. Diga se quer manter os `user_id` originais (opção 1) ou remapear tudo para um único admin (opção 2) — se preferir, decidimos depois de eu inspecionar os CSVs.
4. Diga se quer trazer os arquivos de Storage também.
