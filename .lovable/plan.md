## Situação atual confirmada

- Supabase conectado ao projeto Fenasoja (project ref `btfa…qorx`, ambiente Lovable Cloud da plataforma em produção). Nenhuma criação de projeto novo será feita.
- Nenhuma tabela `venue_*` existe no banco (`SELECT ... FROM pg_tables ... venue_%` retornou 0 linhas).
- Os dois arquivos de migration existem no repositório e ainda não foram registrados:
  - `supabase/migrations/20260727160000_create_venue_events_domain.sql` (1.318 linhas)
  - `supabase/migrations/20260727160100_create_venue_events_transactions.sql` (4.006 linhas)
- Página `/eventos-restaurante-arena` renderiza o estado de erro "O domínio operacional não pôde ser carregado" exatamente porque o schema ainda não existe.
- `supabase_migrations.schema_migrations` não é legível pelo usuário exec (permissão negada), mas a ausência total de objetos `venue_*` já comprova que as migrations não rodaram.

## O que será feito

### 1. Aplicar as duas migrations na ordem correta
Via ferramenta nativa de migration do Lovable/Supabase, submeter em duas execuções sequenciais (uma por arquivo, conteúdo integral, sem cortes):

1. `20260727160000_create_venue_events_domain.sql` — cria tabelas `venue_*`, enums, views (`venue_stakeholder_directory`, `venue_counterpart_balances`), bucket privado `venue-event-documents` (limite 20 MB + MIME types), habilita RLS, cria policies, constraints, índices e adiciona tabelas ao `supabase_realtime`.
2. `20260727160100_create_venue_events_transactions.sql` — cria as RPCs `venue_get_permissions`, `venue_check_availability`, `venue_save_event`, `venue_transition_event`, `venue_upsert_stakeholder`, `venue_upsert_agreement`, `venue_upsert_space`, `venue_upsert_space_block`, `venue_update_checklist_item`, `venue_update_resource`, `venue_register_document`, `venue_get_audit_history`.

Regras respeitadas: nada de `db reset`, nada de DROP em massa, nada de edição das migrations já escritas; se uma delas falhar, o erro exato (statement + objeto) é reportado e uma migration aditiva posterior será criada — nunca uma edição retroativa.

### 2. Verificação estrutural (introspecção read-only via `psql`/`read_query`)
Após cada migration, confirmar:
- tabelas `venue_*` presentes;
- views `venue_stakeholder_directory` e `venue_counterpart_balances` presentes;
- bucket `venue-event-documents` privado com 20 MB e MIME types;
- `relrowsecurity = true` em todas as tabelas do domínio;
- policies de admin/leitura/auditoria/storage presentes;
- índices e constraints únicas de conflito criados;
- publicação `supabase_realtime` inclui as tabelas operacionais;
- todas as 12 RPCs listadas existem com assinatura esperada.

### 3. Validação de segurança e permissões
Consultas de introspecção nas policies para confirmar a matriz (admin, gestor, operador, sem `venue_events_access`, `full_access` sem escalada, isolamento por `org_id`, redação de metadados sensíveis). Se possível, executar chamadas RPC assumindo o JWT de contas seed (Leonardo admin) e uma conta operador para validar bloqueios reais — não apenas `service_role`.

### 4. Smoke test funcional
Contra a organização Fenasoja 2028 já existente (é a única organização real; não haverá criação de "org de QA fictícia"). Ações mínimas via RPC autenticada usando o usuário admin (Leonardo):
- criar/editar patrocinador, contrato, espaço, bloqueio, evento;
- atualizar checklist e recurso;
- registrar documento (upload no bucket + `venue_register_document`) e depois excluir;
- transições de status (aprovar, rejeitar, cancelar, no-show);
- ler `venue_counterpart_balances` e `venue_get_audit_history`.
Todos os registros criados no smoke test serão limpos ao final (marcador de teste no título + delete pós-validação) para não poluir a org operacional.

### 5. Idempotência, concorrência e contrapartida
- Repetir `venue_save_event` com a mesma `idempotency_key` → mesmo id retornado, sem duplicata.
- Repetir com payload divergente → rejeição.
- `expected_version` desatualizado → conflito otimista.
- Duas reservas sobrepostas no mesmo espaço → segunda rejeitada.
- Bloqueio de espaço impede reserva incompatível.
- Consumo de contrapartida dentro/no limite/excedente + aprovação/rejeição recalculam `venue_counterpart_balances` corretamente.
- Desativar patrocinador com evento ativo é bloqueado.

### 6. Validação da UI autenticada
Playwright headless usando a sessão Supabase injetada (Leonardo):
- `/portal` e `/eventos-restaurante-arena` carregam sem o alerta "A migration precisa ser aplicada";
- CRUD real (criar espaço → criar evento → aprovar) reflete no banco e persiste após reload;
- viewport desktop (1280) e mobile (390) — sem overflow horizontal, foco visível, targets ≥ 44px;
- console limpo.

### 7. Testes automatizados e build
- `tsgo` (typecheck) escopado ao módulo;
- `bunx vitest run src/test/venueOperations.test.ts src/test/venueMigrations.contract.test.ts src/test/commissionPortal.test.tsx src/test/loginExperience.test.tsx src/test/commissionPortalAccessibility.test.ts`;
- eslint focal nos arquivos de `src/hooks/useVenueOperations.ts`, `src/components/venue-events/**`, `src/lib/venue-operations.ts`;
- as 17 falhas herdadas do Cronograma serão reportadas separadamente sem alteração de comportamento.

### 8. Relatório final
- Project ref parcialmente mascarado (`btfa…qorx`);
- versões de migration registradas;
- objetos/policies/RPCs/bucket/realtime verificados com queries de introspecção;
- matriz de permissões testada;
- resultados de idempotência/conflito/concorrência/contrapartida;
- evidência do CRUD autenticado (screenshots + rows persistidas);
- dados de smoke test usados e como foram removidos;
- resultados dos testes;
- limitações que sobrarem (incluindo as 17 falhas herdadas do Cronograma), sem omissão.

## Critérios de parada segura
Se qualquer statement das migrations falhar, a execução é interrompida imediatamente; o statement, objeto e mensagem são reportados; o banco fica no estado deixado pela transação da migration (o mecanismo nativo do Supabase executa cada migration em transação — falha ⇒ rollback). Nesse caso proponho uma migration aditiva de correção, sem editar as duas originais.

## Fora de escopo
- Alterar arquivos das migrations já escritas.
- Criar novo projeto Supabase.
- Inserir mocks/fixtures permanentes ou fallback offline.
- Corrigir as 17 falhas antigas do Cronograma (reportadas, não silenciadas).