# Prompt para publicação após o merge da PR #209

Este prompt usa os arquivos do commit efetivamente integrado à branch principal. A entrega foi validada localmente e em PostgreSQL 16.15 na CI; migrations e deploy de produção ainda não foram executados. O executor remoto precisa ser identificado pelo histórico real do ambiente.

Copie o texto abaixo para o agente no ambiente do projeto:

```text
Publique a integração da base pública da Equipe Fenasoja entregue na PR #209 de leomateus620-pixel/expo-logistics-hub, após confirmar que a PR foi integrada à branch principal. Use o processo de publicação e as credenciais já configurados no ambiente do projeto. Execute banco, funções e frontend nesta ordem, com as verificações abaixo. Não apenas gere outro plano.

1. Preparação
Leia AGENTS.md, src/features/workers/AGENTS.md, docs/kb/banco.md, docs/kb/atualizacao.md e docs/kb/validacao.md. Confira o commit integrado, o ambiente de destino e o histórico real de migrations. Preserve mudanças locais e não exiba segredos.

Execute:
node scripts/kb/build-kb-seed.mjs --check

Não regenere nem edite migrations já publicadas. Não importe CSV, Markdown, recortes por área ou anexos novamente. Os dados revisados já estão integralmente no seed.

2. Escolha um único executor de migrations
Se o ambiente usa Supabase, aplique pelo executor Supabase já estabelecido, exatamente nesta ordem:

PRIMEIRA — esquema, RPCs, RLS e ampliação da finalização:
supabase/migrations/20261017070000_workers_knowledge_base.sql

SEGUNDA — publicação transacional de todas as entradas e perguntas:
supabase/migrations/20261017080000_workers_kb_seed.sql

Antes disso, confirme que as migrations anteriores do projeto estão aplicadas, incluindo 20261017030000_workers_response_persistence.sql e 20261017060000_workers_identity_responses.sql. Não as reaplique se já estiverem registradas. Se houver outras pendências ou divergência entre banco e histórico, resolva pelo processo vigente; não marque migrations como aplicadas sem executá-las nem force uma ordem inconsistente.

Neste caminho Supabase, NÃO aplique drizzle/migrations/0018_workers_knowledge_base.sql: é o espelho do mesmo esquema. Não execute os dois DDLs.

Somente se o histórico comprovar que o ambiente usa Drizzle, use o caminho alternativo exclusivo:
node scripts/kb/deploy-kb.mjs --check --executor drizzle
node scripts/kb/deploy-kb.mjs --apply --executor drizzle

Esse runner confere o predecessor 0017_workers_identity_responses, aplica 0018_workers_knowledge_base com o registro no histórico Drizzle e depois publica o seed Supabase pelo registro privado de versões. Ele usa a conexão administrativa LOVABLE_DB_MIGRATION_URL já adotada pelo projeto. Nesse caminho, não execute também o esquema Supabase e não coloque o seed no journal Drizzle. Não invente histórico, service_role, segredos ou novas variáveis. Se o executor ou acesso necessário não puder ser confirmado, informe exatamente o bloqueio e não alegue publicação.

3. Conferência da carga
Confirme a revisão 2026-10-17 e as contagens do conjunto gerenciado:
- Fenasoja: 372 entradas e 1.245 ocorrências de perguntas.
- Expandida: 2.414 entradas e 10.889 ocorrências de perguntas.
- Total: 2.786 entradas e 12.134 ocorrências de perguntas.

Compare os hashes com data/kb/manifest.json e confira o registro de publicação. O SHA-256 do arquivo do seed desta revisão é a891edadfc9464e00cd10354595b935c691b6b2952c7e4bf64c0e51903761e26.

Não ignore KB_SEED_COUNT_MISMATCH, proteção contra downgrade, divergência de hash ou erro transacional. Não publique o código dependente enquanto banco e carga não estiverem consistentes. Se uma revisão mais nova já estiver publicada, não a substitua por esta.

Execute scripts/kb/kb-smoke.sql no contexto de usuário authenticated, com identidade válida. Uma sessão administrativa pode conferir a carga, mas não comprova RLS. Registre todos os OK/FAIL. Não use scripts de fixture de QA para alterar dados de produção.

4. Deploy do código
Após esquema e seed concluídos, publique workers-orchestrator com seus módulos compartilhados do mesmo commit, pelo processo existente. Depois publique o frontend do mesmo commit. Preserve as demais Edge Functions e os módulos protegidos. Não crie flag, ativação por organização, botão de importação nem rota experimental. O deploy do frontend sozinho não aplica o banco.

5. Verificação no ambiente publicado
Com sessões/JWT reais disponíveis, confira acesso autorizado, recusa pelo orquestrador para usuário sem permissão de Equipe, isolamento dos eventos entre usuários/organizações e recusa anônima. A leitura direta do conteúdo público para authenticated é intencional e não equivale à permissão do menu. Não crie usuários, permissões ou dados comerciais reais para simular esses testes. Se faltar uma sessão, registre essa verificação como não executada.

Em /equipe-ia, selecione um bot existente e teste perguntas como:
- Quem foi o presidente da Fenasoja 2024?
- Quem presidiu a 10ª edição?
- Quem presidiu a oitava Fenasoja?
- Qual foi o público da Fenasoja 1966?
- Qual o preço da soja hoje?
- Quanto dinheiro tem o Plano Safra 2025/26?

Confira texto revisado, edição/período, ressalvas e fontes. A resposta sem confirmação não deve mostrar fontes como comprovação; preço dinâmico não deve inventar cotação. Perguntas internas continuam nas ferramentas próprias. Use o relógio real do ambiente para perguntas relativas, sem fixar 2028 como próxima indefinidamente.

Confira o mascote do bot e três pontos durante o processamento, mascote ao concluir, fontes em ícones acessíveis e reabertura da conversa. Verifique ai_messages.state=complete, ai_usage, auditoria tool_completed/turn_completed e um evento KB coerente por turno. Conteúdo elegível da KB não pode chamar modelo para reescrever a resposta. Preserve os contadores reais quando houver inferência no fluxo substituto. Não registre conteúdo adicional de pergunta/resposta na telemetria KB.

6. Relatório e recuperação
Informe commit publicado, executor, migrations aplicadas ou já verificadas, revisão, contagens, resultados do smoke, deploys e testes reais executados. Distinga verificação local, CI e produção. Não declare sucesso de etapas não executadas.

Se precisar recuperar a versão anterior, siga docs/kb/atualizacao.md: preserve mensagens, eventos, uso, auditoria e leitura de citações kb; recuperação de conteúdo usa uma revisão nova, sem apagar histórico nem editar migrations antigas. docs/kb/opcional-embeddings.sql não faz parte desta publicação e não deve ser aplicado.
```
