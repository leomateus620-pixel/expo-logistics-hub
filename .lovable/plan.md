# Auditoria somente leitura — voluntários (06/11/2026)

Nenhum arquivo, dado, permissão ou e-mail foi alterado. Todas as consultas foram de leitura.

## Ambiente
- Workspace: espelho interno do Lovable do projeto `756eeb64…`, sincronizado com GitHub `leomateus620-pixel/expo-logistics-hub` (main). Branch local de edição `edit/edt-9f1f294c…`, HEAD `19d54148`. O remote local não mostra o nome do GitHub; a ligação vem da sincronização do projeto.
- Backend: `supabase/config.toml` project_id = `btfaumhroqtqzxomqorx`. psql com role `sandbox_exec` (só SELECT/INSERT).
- Última migração Drizzle: `0026_commercial_sales_analytics`. Última em `supabase/migrations`: `20261028130000_commercial_contract_list_export.sql`.

## Schema
- `commissions`: id, org_id, nome, slug, is_active, unit_type (CHECK comissao|assessoria|conselho), display_order, is_official, is_legacy, normalized_name, created_at, updated_at. Sem coluna de edição. UNIQUE(id, org_id).
- `commission_responsibles`: id, org_id, commission_id, user_id (nulo permitido), display_name, normalized_name, responsible_type (CHECK pessoa|equipe), relationship_role (CHECK principal|corresponsavel|copresidente|equipe_apoio), is_primary, active, display_order, timestamps. FK (commission_id, org_id) → commissions CASCADE. Não existe valor `voluntario`; hoje voluntário = `equipe_apoio`.
- `org_members`: org_id, user_id, role (org_role), nome_exibicao, cargo, telefone, avatar_color, is_active, commission_id, status, is_core_team, data_nascimento. UNIQUE(org_id, user_id). Sem coluna de foto.
- `user_capabilities`: user_id, org_id, capability. UNIQUE(user_id, org_id, capability).
- RLS ativada nas quatro tabelas.
- Políticas: SELECT por `is_org_member`; INSERT/UPDATE/DELETE em commissions e commission_responsibles só admin/gestor; org_members DELETE só admin, INSERT admin/gestor ou o próprio usuário; capabilities visíveis ao próprio usuário ou admin/gestor, e `venue_*` só admin.
- Grants (ACL): anon, authenticated e service_role têm todos os privilégios nas quatro tabelas e em profiles; sandbox_exec tem SELECT/INSERT. Quem bloqueia o anon é a RLS.

## Funções relevantes (SECURITY DEFINER = t)
is_org_member, get_user_org_role, has_capability, venue_has_capability, commission_leadership_user_ids, cronograma_visible_event_ids, cronograma_managed_commission_ids, cronograma_can_view_planning, trg_event_commission_assignment_push, tg_comissao_evento_google_sync (todas t); _cronograma_apply_event_commissions e _cronograma_apply_subevent_commissions (f).
- Convites e contas: edge functions `create-user`, `provision-fenasoja-users`, `admin-reset-password`. Não há função SQL de convite.

## Buckets
commercial-sale-logos, cronograma-event-attachments, expense-documents, fuel-receipts (público), map-contracts, map-references, vehicle-documents, venue-event-documents, workers-commercial-reports. **Não há bucket de avatar.** As fotos são assets do projeto (`src/assets/person-*.asset.json` e `/alvorada/portraits/`), mapeadas por nome normalizado ou por user_id em `personPhotos.ts`.

## Unidades
- 38 ativas, todas na org `985888b8-155f-4bbe-b6b9-6bef2893d99b`: 36 oficiais e 2 legadas sem integrantes (`etnias`, `relacoes-institucionais`). A lista completa (id, slug, nome, tipo, integrantes ativos e quantos têm conta) está no resultado da consulta.
- Destaques: central 10/10, ccpf 4/4, assessoria-de-marketing 3/3, assessoria-de-relacoes-internacionais 3/3, relacoes-estrategicas 2/2, assessoria-de-imprensa 2/2, assessoria-juridica 2/2, assessoria-projetos-e-captacoes-institucionais 2/1, soja-store 9/2. As demais têm 1/1.
- Inativa: `fotografia`.
- Integrantes ativos por papel: principal 39 (39 com conta), corresponsavel 13 (13), copresidente 1 (1), equipe_apoio pessoa 10 (3), equipe_apoio equipe 1 (0).

## Soja Store (`63baa491-c2c7-4e24-8db1-af1cfd6236bf`)
- 9 integrantes ativos: 1 principal (`c3e01950…`, is_primary) e 8 equipe_apoio, sendo 1 com conta (`f0520c35…`) e 7 sem conta.
- org_members ligados à unidade: `b18f694b…`, `c3e01950…` e `f0520c35…`, todos com papel leitura e ativos.
- Permissões: `c3e01950…` tem cronograma_eventos_access, cronograma_scoped_access e map.view. `f0520c35…` tem essas três e também cronograma_eventos_write.
- Fotos: 8 nomes mapeados para assets do projeto em `personPhotos.ts`. Nenhuma está no banco ou em bucket.
- Eventos: 4 ligados à unidade (status planejado/concluido). Somando todos os eventos ligados, há 16 linhas de responsáveis externos e cerca de 50 user_ids de membros. Só os IDs são reportados.

## Capacidade de execução
- Migrations SQL exatas: pela ferramenta oficial de migração do projeto, que registra no Drizzle, depois de aprovação. O psql daqui não altera schema.
- Edge functions: `deploy_edge_functions` empacota os arquivos do workspace, com o mesmo fluxo de backup e restauração usado nos turnos anteriores.

## Próximo passo proposto
Quando você aprovar, implementar os voluntários conforme a especificação que você enviar.
