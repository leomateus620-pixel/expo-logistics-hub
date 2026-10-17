# Base pública da Equipe Fenasoja (PR #209) — aplicação e publicação

## Conferência já feita (somente leitura)
- Checkout contém `20261017070000_workers_knowledge_base.sql` (34 KB), `20261017080000_workers_kb_seed.sql` (10,2 MB) e o espelho `drizzle/migrations/0018_workers_knowledge_base.sql`.
- `build-kb-seed.mjs --check`: revisão 2026-10-17, 2.786 entradas, 12.134 perguntas, 17 colisões, seed SHA256 `a891edad…1e26`.
- Banco: tabela `kb_entries` ainda não existe (nada parcial). Predecessores 0014 (persistência) e 0017 (identidade) foram aplicados nas rodadas anteriores pela ferramenta oficial.
- Executor real: a ferramenta oficial de migrations do Lovable, que grava no histórico Drizzle (`drizzle/migrations/0012`–`0017`). Portanto o caminho é o **Drizzle**, não o histórico Supabase. `LOVABLE_DB_MIGRATION_URL` não está disponível no sandbox, então `deploy-kb.mjs --apply` não pode rodar; o equivalente é a ferramenta oficial.

## Etapas
1. Conferir que o SHA de `0018` e de `20261017070000` são idênticos e que o predecessor `0017` está no journal; conferir hash do seed contra `data/kb/manifest.json`.
2. Aplicar o esquema uma única vez pela ferramenta oficial, com o conteúdo exato do arquivo (retirando só `BEGIN`/`COMMIT` se existirem, como nas rodadas anteriores). Não aplicar o espelho em separado.
3. Aplicar o seed como migration seguinte. Ele tem 10 MB; se a ferramenta recusar pelo tamanho, **parar e relatar** — não fatiar, não reimportar JSON/CSV, não inserir dados por outro caminho sem sua autorização.
4. Conferir carga: 372/1.245 (Fenasoja), 2.414/10.889 (expandida), registro de versão 2026-10-17 e hash. Qualquer `KB_SEED_COUNT_MISMATCH`/downgrade interrompe.
5. Smoke: rodar `kb-smoke.sql` com sessão de usuário autenticado real (via sessão minimizada do preview); sem sessão, marcar como pendente — leitura administrativa não conta como RLS.
6. Reimplantar `workers-orchestrator` com os módulos compartilhados do mesmo commit (registro de ferramentas conferido com `--check`).
7. Frontend: publicar somente se você confirmar na aprovação (regra do projeto: não publicar sem pedido explícito — este pedido conta como explícito; publicarei após passos 1–6 OK).
8. Testes funcionais em `/equipe-ia` com as 6 perguntas, mascote/três pontos, reabertura e persistência (`ai_messages`, `ai_usage`, auditoria, evento KB). Testes de recusa/isolamento só com sessões reais; caso contrário, pendentes.
9. Relatório: commit, executor, migrations, contagens, smoke, deploy, pendências.

## Não será feito
- Embeddings (`opcional-embeddings.sql`), feature flag, edição de migrations antigas, duas execuções do DDL, alterações em FCM, Google Sync, Agenda Meeting ou Mapa Comercial.
