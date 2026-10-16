# Compatibilidade da ativação no Lovable

16/10/2026. A PR #202 foi integrada; as migrations dos bots ainda não tinham sido executadas. O primeiro pedido de ativação foi interrompido **antes de qualquer migration/deploy**, por regras internas do Lovable, sem erro SQL retornado pelo banco.

O conector esclareceu as duas exigências: tabelas novas públicas não podem referenciar diretamente `auth.users`, e grants devem anteceder ENABLE RLS/policies. A migration ainda não aplicada foi corrigida somente nesses pontos. `user_id` permanece UUID obrigatório; identidade vem de `auth.uid()`, associação ativa à organização, políticas próprias e chaves compostas conversa/organização/usuário. Nenhuma policy foi alterada.

Arquivo funcional alterado: `supabase/migrations/20261016120000_workers_readonly_workspace.sql`. A segunda migration e o código da função permanecem iguais aos revisados na PR #202.

Validação: typecheck passou; 113 testes de registry/orquestrador/Agenda/public map passaram. As duas migrations e as assertions por proprietário/papel/organização passaram em PostgreSQL 16.14 local isolado, somente fixtures sintéticas; hashes em `activation-sql-validation.json`. Lint global executado: 1017 erros/74 avisos na base atual, incluindo o MCP regenerado pelo Lovable em main; esta correção contém somente SQL e relatório, sem mudanças TS/JS. As falhas históricas de lint não são apresentadas como verdes.

Risco residual: remoção da FK deixa a integridade de identidade dependente de Auth/RPC/RLS, como exige a plataforma. Testes locais não substituem verificação dos metadados e endpoint após deploy, nem um teste autenticado com contas reais por papel. Sem frontend, CSS, FCM, Calendar ou geometria alterados. Capturas visuais não se aplicam a esta correção de migration.

Ativação ainda deve ser confirmada pelo ambiente; este relatório não declara deploy concluído.
