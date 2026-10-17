# Base pública da Equipe Fenasoja — publicação adaptada ao executor oficial

## Fatos verificados
- Banco: nenhum objeto da KB existe; o histórico aplicado vai até 0017. A única pendência é a 0018 (journal sem snapshot, contém `BEGIN`/`COMMIT`, não aplicada).
- Executor oficial: migrator Drizzle; o código (`drizzle-orm/pg-core/dialect.js`, linha 60) executa as migrations pendentes dentro de `session.transaction(...)`. Logo, remover `BEGIN`/`COMMIT` explícitos mantém a atomicidade. Isto será reconfirmado na etapa 1 com uma migration de teste que falha propositalmente (nada é persistido).
- Seed atual: 105 blocos `INSERT` em tabelas temporárias `ON COMMIT DROP` + promoção. Não pode ser fatiado tal como está.
- Limite real: a ferramenta de migrations aceita só DDL e o SQL é enviado como texto na chamada; 10 MB não cabem nas chamadas. O acesso do ambiente ao banco (papel `sandbox_exec`) permite `INSERT` em fluxo a partir de arquivo, sem passar o conteúdo pela conversa.

## Desenho
```text
0018 (reorganizada)  esquema KB idêntico, sem BEGIN/COMMIT
0019 (nova, DDL)     workers_private.kb_seed_stage_parts(version, source_hash, part_no, part_hash, kind, payload jsonb)
                     + workers_private.kb_seed_stage_manifest(version, source_hash, total_parts, entries, questions)
                     + função workers_private.kb_promote_seed(version, source_hash)
                     grants: nada para anon/authenticated; INSERT/SELECT só para o papel de carga, revogado na 0020
partes (dados)       ~40 partes de ~250 KB; ON CONFLICT DO NOTHING (retomável); hash por parte conferido
promoção             1 chamada = 1 transação: valida manifesto, número e hash das partes, hash total,
                     downgrade/imutabilidade, upsert entradas, sincroniza perguntas, poda só IDs gerenciados,
                     confere 372/1.245, 2.414/10.889, registra publicação, limpa preparação
0020 (DDL)           revoga o acesso de carga após sucesso
```
Falha em qualquer ponto: a promoção não publica nada; a versão anterior (hoje nenhuma) fica intacta; eventos nunca são apagados.

## Etapas
1. Reorganizar só o pendente: substituir a 0018 por uma versão sem `BEGIN`/`COMMIT` (mesmo DDL; hash registrado) e ajustar o journal. Migrations aplicadas ficam intactas; nenhuma marcação sem execução real.
2. Adaptar `build-kb-seed.mjs`: gerar partes (`data/kb/seed-parts/*.jsonl` + manifesto de partes com hashes), mantendo o SQL monolítico como referência de conferência e o mesmo hash de origem. Atualizar `manifest.json`, `deploy-kb.mjs` (modo partes; documentado como não operacional sem conexão), testes do gerador e `db-qa`, docs `banco.md`/`atualizacao.md`/`validacao.md`/`README.md` e regra em `src/features/workers/AGENTS.md`.
3. Validar localmente (PostgreSQL de teste do projeto): esquema → partes → promoção → contagens → smoke; repetir a carga (idempotência), parte corrompida (rejeita), versão mais nova (downgrade bloqueado).
4. Banco real: aplicar 0018, 0019; carregar partes; conferir; promover; aplicar 0020.
5. Conferir contagens, versão 2026-10-17, hashes do manifesto e registro de publicação; smoke com usuário autenticado real (sessão do preview), senão pendente.
6. Só depois: reimplantar `workers-orchestrator` com módulos do mesmo commit e publicar o frontend.
7. Testes em `/equipe-ia` (6 perguntas, fontes em ícones, mascote/três pontos, reabertura, `ai_messages`/`ai_usage`/auditoria/evento KB).
8. Relatório separando testes locais e de produção.

## Limitação a confirmar na etapa 4
Se o papel de carga não puder receber `INSERT` na tabela de preparação, as partes irão por chamadas de dados da ferramenta oficial em lotes menores. Se nenhuma via couber, paro antes da promoção e relato o limite concreto; nada incompleto é publicado.

## Não será feito
Embeddings, feature flag, service_role, novas credenciais, alteração de migrations aplicadas, FCM/Google Sync/Agenda Meeting/Mapa Comercial.
