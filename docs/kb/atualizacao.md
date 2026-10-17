# Atualização e recuperação da base pública

A publicação usa dados revisados e migrations SQL versionadas. Não exige botão de importação, ativação por organização nem uma segunda interface. O deploy do frontend, sozinho, não aplica migrations de banco. Consulte [banco](./banco.md) para escolher o único executor conforme o histórico real do ambiente e [validação](./validacao.md) para o que foi efetivamente aplicado em teste.

## Fontes e rastreabilidade

Os quatro anexos originais estão em `data/kb/raw/`, separados das fontes revisadas. O ZIP original conserva seus 20 membros; `raw/provenance.json` registra os hashes de todos eles, as versões declaradas e os nomes dos anexos. O arquivo realmente recebido foi `fenasoja-kb.csv`, sem o sufixo `(1)`. Os recortes por área e os CSV são espelhos de conferência e não geram uma segunda importação.

Edite `data/kb/fenasoja-kb.json` e `data/kb/kb-expandida.json`. Preserve IDs, a ordem das perguntas e o vínculo entre a canônica e suas variantes. A pergunta canônica é persistida como `ID#0`; as variantes seguem `ID#1`, `ID#2` e assim por diante. Textos normalizados iguais podem existir em entradas diferentes.

Para novos insumos, mantenha cópias imutáveis, por exemplo em `data/kb/raw/AAAA-MM-DD/`, e registre SHA-256 e versão. Atualize a proveniência de cada entrada com `source_file` relativo a `raw/`, `source_sha256`, `source_entry_id`, `revision` e `managed_by: "fenasoja-kb-seed"`. O JSON de origem precisa conservar o registro original dentro de `entries`. Não substitua a evidência anterior.

Em `data/kb/curation-log.json`, registre cada alteração editorial com ID, campo, valor anterior, valor revisado, motivo e fonte para mudanças factuais. Consulte fontes primárias quando houver mudança de fato. Uma data de acesso declarada no anexo não pode ser apresentada como uma nova verificação. `raw/factual-review.json` e `raw/period-source-checks.json` documentam o alcance da revisão inicial e a confirmação dos endpoints SIDRA fixados em 2025.

Os scripts `prepare-initial-kb.py`, `prepare-initial-policies.mjs`, `finalize-initial-curation.mjs` e `review-temporal-context.mjs` registram a preparação inicial. **Não os use para manutenção cotidiana:** eles recriam decisões específicas daquela importação. A manutenção parte dos arquivos revisados existentes.

## Conteúdo, calendário e políticas

Conserve os estados `confirmado`, `parcial`, `conflito`, `dinamico` e `sem_fonte`. Confirmado significa sustentado pela fonte registrada, sem garantir fonte oficial ou atualidade. Nunca escolha uma entrada mais afirmativa para ocultar conflito ou falta de confirmação.

O texto `answer` deve ser público, não vazio, com até 1.200 caracteres e sem sinal de menor, sinal de maior ou crase. Retire instruções internas, contatos que seriam mascarados e URLs no corpo; preserve a fonte estruturada. Não use caracteres invisíveis para contornar os redatores. O gerador aplica a implementação real de `redactWorkerText`; a migration também verifica `ai_workers_redact_text`. Nenhum texto pode depender de truncamento silencioso.

`as_of` permanece textual: pode ser ano, data ISO, mês, intervalo ou outra referência legítima. Não transforme a data de acesso em data do dado. Datas ISO são formatadas para o usuário na composição da resposta. Publicador, item de livro, licença e outros metadados de fontes permanecem preservados. O campo `label` é o rótulo público de até 160 caracteres; o `title` original conserva a proveniência completa.

As notas indispensáveis à interpretação pertencem a `public_notes`, com no máximo quatro notas curtas. Restrições de manejo, legislação e uso de publicações antigas precisam continuar visíveis. As notas internas e `dynamic_instructions` originais ficam em `editorial_metadata` e nunca são executadas como instruções de agente. O campo operacional `dynamic_instructions` permanece nulo nesta versão.

Atualize `data/kb/editions.json` com evidência para ano, número, confirmação da numeração, início, fim e divergências. Não deduza uma feira por periodicidade. Em datas conflitantes, preserve os candidatos e mantenha a data única nula quando ela não estiver confirmada. O anúncio da presidência de 2030 não comprova número nem calendário. O gerador produz `kb-editions.ts`; esse arquivo não é editado manualmente.

O objeto `context` distingue assuntos e validade: `scope`, `subject`, `reference_period`, `valid_from`, `valid_until` e `edition_required`; Plano Safra também usa `audience` quando necessário. Anos de Musicanto, legislação, Censo ou safra não se tornam edições da Fenasoja. Uma resposta que contém informação específica de uma edição precisa desse contexto, mesmo que a pergunta original não tenha ano.

Revise `data/kb/query-policies.json` para toda colisão normalizada, inclusive entre bases. Defina preferência com justificativa quando os conteúdos forem compatíveis; peça esclarecimento quando a diferença mudar a resposta. Mantenha `entry_overrides` e `query_policy` das entradas coerentes. `citation_indexes` seleciona, com índices a partir de zero, até três fontes para a resposta; em conflito, a seleção deve comprovar os lados divergentes. Todas as fontes originais continuam cadastradas. `historical_only` e `allow_comparative` representam exceções editoriais explícitas para consultas históricas, sem inventar uma edição única para listas que abrangem várias feiras.

O normalizador está em `scripts/kb/normalize-kb.mjs` e é espelhado em SQL; `kb-normalization.ts` é gerado. Uma alteração futura exige nova versão do normalizador, revisão das colisões, testes de paridade com SQL, recomputação das colunas geradas armazenadas e reconstrução dos índices pertinentes. Não descarte negações, números, presidente/vice ou início/fim.

## Preparação de uma nova revisão

1. Escolha a data real da revisão. Atualize `meta.version`, `kb_version` e `provenance.revision` das entradas, `revision` em `raw/provenance.json` e as versões em `editions.json`, `query-policies.json`, `curation-log.json` e `expected-counts.json`. Essas datas identificam a revisão; os hashes e as versões de origem continuam identificando os anexos imutáveis.
2. Edite e revise os conteúdos, contextos, fontes e políticas. Acrescente evidências e registros de curadoria.
3. Confira o último timestamp real em `supabase/migrations/`. Escolha um timestamp posterior a todo o histórico existente.
4. Atualize **explicitamente** `expected-counts.json.expected` se houve ampliação ou retirada. Documente o motivo em `change_reason`. Mantenha `initial_baseline` com 372/1.245 e 2.414/10.889: essa evidência da carga inicial nunca é reduzida para fazer a validação passar.
5. Registre em `retired_ids` somente IDs cuja retirada foi decidida conscientemente. O gerador não apaga todas as linhas de versões antigas. Entradas externas ao conjunto gerenciado são preservadas e colisões de IDs com elas provocam erro.

O gerador foi executado com Node 24.15.0. Ele usa a remoção nativa de tipos para verificar o redator TypeScript existente e não requer um provedor externo nem embeddings.

```sh
node scripts/kb/build-kb-seed.mjs \
  --stamp <timestamp_posterior_ao_ultimo> \
  --version <AAAA-MM-DD>

node scripts/kb/build-kb-seed.mjs --check
node scripts/kb/test-kb-generator.mjs
npm run typecheck
npm run test
npm run build
npm run lint
```

No PowerShell, execute o comando do gerador em uma linha ou use a continuação própria do shell. Não copie os marcadores entre sinais de menor e maior literalmente.

O gerador valida todos os registros, fontes, vínculos, perguntas, limites, contextos, proveniência e colisões. Gera uma migration transacional com lotes internos, `manifest.json` e os arquivos TypeScript derivados. `--check` compara as saídas sem modificá-las. O manifesto registra hashes, distribuição por base, status, tipo e área, contagens de perguntas e fontes, alterações editoriais e tamanho da publicação. A regra de finais de linha em `.gitattributes` preserva os hashes em Windows e Linux.

Uma migration existente só é aceita se os bytes gerados forem idênticos; ela não é regravada. Para qualquer mudança após publicação, crie outra revisão com outro timestamp. O registro privado de publicação no banco também recusa downgrade e a reutilização de uma versão com outro hash.

## Aplicação e verificação

Use o executor Supabase identificado no README e o ambiente autorizado. O Drizzle contém somente o espelho do esquema; não execute os dois DDLs nem espelhe o seed no Drizzle. As migrations de esquema devem preceder a de dados. Não presuma aplicação de migrations a partir de um deploy da interface.

Cada seed prepara o conjunto, verifica a paridade de normalização e a compatibilidade dos textos, faz upsert e remove variantes obsoletas apenas dos IDs gerenciados naquela publicação. Os upserts idênticos não reescrevem linhas nem timestamps. As contagens finais são verificadas antes do commit; divergência falha com `KB_SEED_COUNT_MISMATCH`. O `ANALYZE` ocorre após a carga. O conjunto completo é publicado numa única transação, evitando uma mistura parcial de versões.

Execute `scripts/kb/kb-smoke.sql` e o runner de banco documentado na validação. Repita a matriz funcional, a reaplicação idempotente, a proteção contra downgrade, o teste de versão concorrente e as verificações de persistência, fontes, auditoria e reabertura. Confira também acesso autorizado, recusa pelo orquestrador sem permissão de Equipe, isolamento dos eventos por usuário e falhas esperadas de escrita direta. Uma sessão administrativa de SQL não substitui os testes de contexto autenticado e RLS.

Os limiares iniciais ficam centralizados em `KB_THRESHOLDS`. Qualquer ajuste precisa de perguntas de avaliação e medições comparáveis; uma edição de dados ou uma preferência editorial não justifica mudar os limiares silenciosamente.

## Recuperação sem apagar histórico

Para retirar a integração de código, reverta o encaminhamento de novas perguntas para a KB, preservando a leitura de citações `kb`, os componentes de fontes e a finalização compatível com mensagens já gravadas. Não apague tabelas ou eventos nem faça rollback destrutivo das mensagens.

Para restaurar conteúdo anterior, recupere os arquivos revisados e as políticas daquela revisão no Git, mantenha a proveniência histórica e prepare **uma versão de recuperação mais nova**. Atualize as contagens esperadas e liste conscientemente os IDs retirados em `retired_ids`. Gere e aplique uma nova migration. Não reaplique uma versão antiga para tentar sobrepor a atual e não altere migrations publicadas.

O histórico de uso e as mensagens anteriores permanecem. A recuperação muda o conteúdo disponível para os próximos turnos; não reescreve retroativamente o que foi respondido. Uma falha isolada no registro auxiliar de uso não desfaz uma resposta já persistida; ela fica observável como diagnóstico técnico sem texto de pergunta ou resposta.
