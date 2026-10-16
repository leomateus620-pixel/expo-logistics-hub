# Diagnóstico somente leitura — Workers Fenasoja (Fases 0 e 1)

Inspeção de configuração para a PR da equipe de workers (somente leitura). Nenhum arquivo editado, nenhum banco alterado, nenhum conector ativado, nada publicado.

## 1. Secrets configurados (somente nomes, valores nunca exibidos)

- **LOVABLE_API_KEY: CONFIGURADO** — presente e gerenciado pela plataforma. É a chave que autentica o Lovable AI Gateway (chat, embeddings, imagem) e o gateway de conectores. Se um dia for rejeitada pelo gateway, a correção é rotação pela ferramenta própria, nunca recriar manualmente.
- **FIRECRAWL_API_KEY: NÃO CONFIGURADO** — não existe nos secrets do projeto e não há nenhuma conexão Firecrawl no workspace.

Outros secrets relevantes já presentes: GOOGLE_MAPS_API_KEY, tokens de workers (AGENDA_MEETING_WORKER_TOKEN, EVENT_REMINDERS_WORKER_TOKEN, GOOGLE_SYNC_WORKER_TOKEN), credenciais Google OAuth/Calendar e a chave do conector Firebase Cloud Messaging.

## 2. Conectores de busca web — situação real

Conectores de busca/scraping **habilitados no workspace**, mas **nenhum vinculado a este projeto**:

- **Firecrawl** (busca web, scrape, crawl, map) — habilitado, sem conexão criada.
- **Perplexity** (busca com resposta e citações) — habilitado, sem conexão.
- **Parallel** (web search/research para IA) — habilitado, sem conexão.
- **Algolia** (busca/indexação) — habilitado, sem conexão.

Conexões existentes no workspace: Firebase Cloud Messaging (já vinculado ao projeto) e GitHub API (existe, mas **não está vinculada** a este projeto).

**Conclusão:** hoje o app não tem nenhum conector de busca web pronto para uso. Para "pesquisa web citada" nas Fases 0/1, o caminho recomendado é o Firecrawl.

## 3. Caminho correto para habilitar Firecrawl (quando autorizado)

1. Criar a conexão no workspace (você, como admin, em Connectors): https://lovable.dev/connectors/firecrawl/connect?workspace=Zqh0zBul0n1zpXfn9cu9 — preferir a opção gerenciada pela Lovable (modo gateway).
2. Depois de criada, eu vinculo ao projeto pela ferramenta de conexão — isso injeta `FIRECRAWL_API_KEY` automaticamente nos secrets do backend.
3. No código (somente em Edge Functions, nunca no navegador): chamadas para `https://connector-gateway.lovable.dev/firecrawl/v2/...` com os cabeçalhos `Authorization: Bearer ${LOVABLE_API_KEY}` e `X-Connection-Api-Key: ${FIRECRAWL_API_KEY}`. Nunca chamar `api.firecrawl.dev` diretamente com a chave do conector.
4. Após vincular, republicar as Edge Functions que usarem o conector.

Alternativa sem conector: você cria uma chave própria no site do Firecrawl e a salva em Project Settings → Secrets como `FIRECRAWL_API_KEY` (modo direto, chamando `api.firecrawl.dev`). O modo conector é o preferido.

## 4. Lovable AI Gateway — como os workers devem chamar

- Endpoint: `https://ai.gateway.lovable.dev/v1` (chat via `/v1/responses` para modelos OpenAI), autenticado com `LOVABLE_API_KEY` somente no servidor (Edge Function).
- Modelo padrão de chat sem preferência: `openai/gpt-6-astra`.
- Uso é cobrado por requisição nos créditos do workspace.
- Chave já está configurada — nenhuma ação necessária neste ponto.

## 5. Como o projeto recebe migrations e Edge Functions após PR mesclada

O projeto tem sincronização Git com o GitHub (uma branch sincronizada por vez). Comportamento importante:

- **Edge Functions (`supabase/functions/`)**: neste projeto (Lovable Cloud), a sincronização do repositório **não faz deploy automático** das functions. Após mesclar uma PR que altera functions, o deploy precisa ser feito a partir do chat.
- **Migrations**: a sincronização **nunca aplica migrations** automaticamente. Arquivos de migration que chegam por PR precisam ser aplicados a partir do chat, sob pedido.
- Ou seja: a PR dos workers pode ser mesclada com segurança — nada muda no banco ou nas functions até uma ação explícita aqui.

## 6. Resumo executivo

| Item | Situação |
|---|---|
| LOVABLE_API_KEY | Configurado e gerenciado |
| FIRECRAWL_API_KEY | Ausente — exige criar conexão Firecrawl no workspace e vincular |
| Busca web pronta | Nenhuma; Firecrawl/Perplexity/Parallel habilitados no workspace, sem conexão |
| AI Gateway | Pronto para uso server-side |
| Pós-merge de PR | Functions e migrations não são aplicadas automaticamente; deploy/aplicação sob pedido no chat |

## Próximos passos possíveis (somente se você autorizar)

1. Você cria a conexão Firecrawl pelo link acima; eu vinculo ao projeto e valido uma chamada de busca.
2. Após a PR dos workers ser mesclada, eu aplico migrations e faço deploy das functions alteradas, com validação.
