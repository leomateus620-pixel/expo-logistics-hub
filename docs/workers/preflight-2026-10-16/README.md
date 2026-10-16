# Workers Fenasoja — pré-validação das Fases 0 + 1
> Registro histórico do preflight. Os bloqueios de conta e regularização do lock foram resolvidos com a autorização posterior do Leonardo. A implementação e o estado atual estão no [relatório conjunto das Fases 0 e 1](../phase-0-1/README.md). Os resultados abaixo preservam a evidência da inspeção inicial.

Data: 16/10/2026 · America/Sao_Paulo.

**Estado: implementação interrompida na pré-validação; Fases 0 e 1 ainda não concluídas.** Esta entrega contém documentação e evidências. Nenhum registry executável, interface, migration, Edge Function, dependência ou configuração de produção foi alterado.

## Motivo da parada e decisão solicitada

O pedido direto reúne as Fases 0 e 1, autoriza PR e determina não publicar. Essa ordem prevalece sobre as paradas intermediárias dos anexos. A solicitação direta de ignorar reduced-motion nos workers também prevalece sobre o exemplo do anexo; as regras globais existentes devem ser preservadas.

O arquivo fornecido `prompt-instalacao-framer-motion.md`, seção 2, determina: **“Se o diff do `package-lock.json` alterar dependências não relacionadas, pare e reporte.”** A seção também limita o diff às entradas de Motion e suas dependências.

O lock npm já omite `drizzle-kit`, `drizzle-orm` e `postgres`, declarados no `package.json`. Uma instalação de metadados em cópia temporária isolada confirmou que adicionar `motion@14.3.0` regulariza também essas dependências: **92 entradas novas, das quais 88 fora da família Motion; zero versões existentes alteradas e zero pacotes removidos.** Algumas entradas são variantes opcionais por plataforma, não 88 novas dependências diretas do app.

O comando não instalou pacotes no checkout nem executou scripts de dependências. A simulação usou npm 12.2.0, com `--package-lock-only --ignore-scripts --no-audit --no-fund`. Bun não foi executado; não há proposta de mudança para os locks Bun nesta etapa. A simulação npm serve para comprovar a divergência preexistente, sem afirmar que reproduz exatamente um futuro `bun add` seguido da atualização npm.

Proposta revisável: autorizar a regularização separada do lock npm, mantendo as versões já travadas, e depois instalar Motion fixado e sincronizar os três lockfiles. O [diff completo da simulação](motion-lock-proposal.patch) é **evidência, não foi aplicado** e foi gerado contra o commit auditado `849b0e8d`, não contra `main`; a base deve ser reconferida antes de qualquer aplicação. Ele também mostra a reordenação automática de `three-mesh-bvh` no manifesto, sem mudança de versão; essa reordenação não é necessária à implementação final.

Ver [inventário das entradas novas](motion-lock-preflight.json). A confirmação oficial do pacote encontrou `motion@14.3.0` e peers React/ReactDOM `^18.0.0 || ^19.0.0`, compatíveis com React 18.3.1. Fontes: [versão fixada](https://registry.npmjs.org/motion/14.3.0) e [latest na data da consulta](https://registry.npmjs.org/motion/latest).

## Base e arquivos lidos

A auditoria de código e os checks foram feitos no checkout inicial, commit `849b0e8d8c02feaea6b771ca911aab525fee6cf7`, branch `codex/financial-expenses-comparison`. A PR de documentação usa `main` como base para não incluir as alterações financeiras desse checkout. As evidências estáticas referem-se ao commit auditado; não afirmam identidade entre ele, `main` e o banco implantado.

Foram lidos `AGENTS.md`, `src/features/commercial-map/AGENTS.md`, `.lovable/mcp/manifest.json`, todos os arquivos de `src/lib/mcp`, `src/App.tsx`, `src/components/Sidebar.tsx`, `src/hooks/useCapabilities.ts`, `src/hooks/useModuleAccess.ts` e o schema completo de `src/integrations/supabase/types.ts` para inventário, com conferência das migrations e hooks relevantes. Também foram examinados tokens, marca, design-system, componentes UI e os adendos fornecidos. As imagens foram usadas como referências de linguagem visual; marketplace, saúde e pagamentos dos produtos de referência não entram no escopo.

## Auditoria de permissões

As tabelas/views/RPCs nominalmente verificadas nos módulos Agenda, Arena, Financeiro, Mapa, Interesse, Comissões e Logística existem no código auditado. As tabelas novas `ai_*` e as novas rotas pedidas são trabalho autorizado futuro, não ausências indevidas do inventário existente.

- [Agenda, Arena e Financeiro: inventário, permissões e matriz por papel](permissions-agenda-arena-finance.md).
- [Mapa, Interesse, Comissões e Logística: inventário, permissões e matriz por papel](permissions-map-logistics.md).
- [Tokens, componentes, mascotes, contraste e estratégia de animação](design-inventory.md).

Diferenças materiais a incorporar ao futuro registry:

1. Interesse exige `map.analytics.view`; `map.manage_sales` sozinho não autoriza os RPCs analíticos. A saída de links inclui token permanente e precisa de allowlist antes de chegar à IA, ao histórico ou aos logs.
2. Vendas exigem `map.manage_sales`; `map.view` não libera seus detalhes. Dados de compradores devem ser minimizados mesmo para papéis elevados.
3. Checklist da Arena exige `venue_operations_manage`; contrapartidas exigem `venue_counterparts_manage` ou `venue_reports_view`. Não ampliar policies para acomodar o catálogo sugerido.
4. Caixa deve usar a autorização financeira existente; o acesso genérico de gestor/operador não equivale a `financial_access`.
5. A criação de tarefa existente é um hook com `INSERT` direto. Não existe RPC/função de negócio segura equivalente encontrada. A escrita do worker Comissão não pode entrar no registry sob a regra inviolável; sua leitura continua viável. Não inventar uma RPC nem anunciar essa escrita como disponível.
6. `weather-service` possui ações com escrita e service role. Não expor `action` livre como ferramenta de leitura; consultas de dados de transporte devem usar JWT e saídas minimizadas.
7. O MCP atual `create_event` faz `INSERT` direto. Ele não pode ser reaproveitado como ação do worker. Os adapters MCP de leitura também precisam compartilhar as definições e minimizações do novo registry, preservando o bundle gerado.

### Estado real do banco

Foram executadas somente as RPCs de metadados `audit_check_rls_status()` e `audit_count_policies()` no projeto Supabase configurado no `.env` versionado (`btfaumhroqtqzxomqorx`). Ambas responderam HTTP 200 e retornaram 154 tabelas. **As 154 estavam com RLS habilitada.**

A consulta utilizou a chave pública já versionada, sem JWT de usuário e sem service role. Não houve leitura de linhas de negócio, alteração de registros, obtenção de secrets ou envio de dados de negócio a um provedor de IA. Ver [resultado combinado, sem credenciais](rls-metadata.json).

RLS habilitada e quantidade de policies **não provam isolamento por papel**. Onze tabelas retornaram zero policies, incluindo tabelas internas e tabelas cujo acesso passa por RPCs, como `public_map_links`/`public_map_events`. Isso não autoriza criar policies amplas. A inspeção de views e dos RPCs SECURITY DEFINER continua necessária.

O conector Lovable retornou `404 project_not_found` tanto em `get_database_status` quanto em `get_project` para `756eeb64-0d44-4171-b445-f8a60f0492c0`. O resultado significa indisponibilidade desse projeto para a conexão atual; não prova que o projeto deixou de existir. Secrets e conectores não puderam ser verificados nem configurados. Não se solicita nenhuma chave em chat.

## Verificação executada antes de alterar código

| Check | Resultado na base auditada |
|---|---|
| Typecheck | Passou, exit 0 |
| Build Vite | Passou, exit 0; avisos existentes de chunks grandes |
| Lint completo | Falhou: 1.010 erros e 96 warnings |
| Vitest completo | 353 arquivos passaram / 48 falharam; 3.124 testes passaram / 86 falharam |
| Regressões direcionadas | 7 arquivos / 71 testes passaram |

Regressões direcionadas: `cronogramaRpc`, `publicMapHost`, `eventAssignmentPush`, `pushDeviceRevocation`, `eventPushMessage`, `googleCalendarState` e `googleCalendarWidget`. Esses resultados não cobrem toda a operação real do FCM e do Google Calendar.

Como npm não estava no PATH inicial, os scripts do manifesto foram executados pelos entrypoints das dependências instaladas usando o Node fornecido pelo runtime. Isso executa os mesmos comandos (`tsc --noEmit -p tsconfig.app.json`, `eslint .`, `vitest run`, `vite build`) sem mudar os pacotes. Para a simulação isolada do lock foi usado o CLI npm baixado do registry oficial para diretório temporário.

Ver [resumo e arquivos com falhas](baseline-validation.txt) e [tamanhos dos chunks antes da instalação](bundle-before.txt). Não houve bundle “depois”, pois nenhuma instalação foi aplicada.

### Testes por papel e aceite ainda pendentes

Não foram executados testes autenticados como admin, gestor, operador, leitura ou membros de comissão. Nenhuma sessão desses papéis foi utilizada. A matriz documental descreve as verificações que o registry deverá aplicar; não substitui execução de testes contra RLS.

Continuam pendentes: testes unitários do registry proibindo registro de ferramentas vedadas; isolamento real por organização/comissão/segmento; minimização antes do provedor; prompt injection; SSE e citações; auditoria/uso `ai_*`; screenshots responsivos; acessibilidade; streaming sem deslocamento; medição de FPS e orçamento do Motion. Não há telas novas para capturar, nem comparação visual antes/depois que possa ser alegada como executada.

## Arquivos, migrations e riscos

Todos os arquivos adicionados estão em `docs/workers/preflight-2026-10-16/`: este relatório, os três inventários, metadados RLS, resultado e patch da simulação Motion, resumo dos checks e bundle anterior. **Migrations: nenhuma.** Nenhum arquivo em `src/`, `supabase/`, lockfile, manifesto, geometria/câmera/render do mapa, push ou Google Calendar foi alterado.

Os riscos para a implementação conjunta são: expansão de permissões caso se copie o catálogo sem validar as regras reais; vazamento de tokens/contatos em saídas brutas; expectativa de criação de tarefa sem executor permitido; lock npm previamente divergente; falhas existentes que impedem usar “suíte toda verde” como evidência; falta de acesso Lovable pela conexão atual; ausência de testes reais por papel. Nenhuma alteração de policy existente está proposta nesta entrega.

Após a decisão explícita sobre a regularização do lock, retomar a entrega conjunta das Fases 0 e 1. Fase 2 permanece fora do escopo até aprovação posterior. Nada foi publicado em produção.
