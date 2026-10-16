# Equipe de bots Fenasoja — Fases 0 e 1

Entrega conjunta do registry/auditoria e da experiência de consulta com oito bots: Agenda, Arena, Mapa, Interesse, Comissão, Logística, Caixa e Radar. O desenvolvimento está na PR [#202](https://github.com/leomateus620-pixel/expo-logistics-hub/pull/202). As fases de ações confirmadas, rotinas e configuração persistente continuam futuras.

## O que mudou

- Workspace `/equipe-ia`, catálogo `/equipe-ia/conheca`, oito perfis e laboratório `/admin/workers/design` protegido por administrador da organização.
- Copiloto contextual nas telas autenticadas, Ctrl/Cmd+K, contexto da rota e UUID do registro selecionado quando existe um mecanismo real no módulo.
- SSE, progresso das consultas, histórico privado por pessoa/organização, menções, fontes navegáveis, chips, anexos de texto minimizados e transcrição do navegador com consentimento a cada fala.
- Símbolo próprio dos bots derivado do sol e dos campos da marca oficial, aplicado aos cabeçalhos e ao acesso à equipe. Mascotes SVG com vida, Motion 14.3.0 em chunks lazy, temas do app, CSS escopado e tokens `--worker-*`. A nomenclatura visível é **bot**; identificadores técnicos `workers` foram preservados para compatibilidade dos contratos.
- Orquestrador server-side, adaptador Lovable AI Gateway e Firecrawl pelo gateway gerenciado. A IA escolhe consultas de um catálogo fechado; o texto factual apresentado é formatado a partir dos resultados autorizados, com fontes. O conteúdo verificado é transmitido em blocos SSE.
- 35 tools de negócio somente leitura, mais pesquisa externa, com schemas e capacidades. Três adapters MCP de leitura existentes compartilham as mesmas definições e minimizações. O arquivo MCP gerado não integra o diff.

O bot não executa alterações de negócio. As ações e a rotina mostradas no laboratório administrativo são exemplos locais identificados como demonstração. Não há marketplace, pagamento por bots, envio a terceiros ou agendamento ativo.

## Migrations aditivas

1. `20261016120000_workers_readonly_workspace.sql`: `ai_conversations`, `ai_messages`, `ai_audit_events` e `ai_usage`; RLS de usuário + organização ativa, vínculos compostos e RPCs de início/finalização/falha. Sem INSERT/UPDATE direto pelo cliente. Inclui limites de admissão (8/minuto, 120/dia, 2 pendentes) e replay idempotente por request UUID.
2. `20261016120100_workers_interest_scoped_reads.sql`: dois leitores agregados de interesse, vinculados à organização e projeto, com gates analytics e comercial explícito. Não retornam token público nem identidade de visitante. As RPCs anteriores e suas policies não foram alteradas.

`ai_actions`, `ai_memory`, `ai_routines`, `ai_routine_runs` e configuração persistente `ai_workers` pertencem às próximas fases e não foram criadas antecipadamente.

## Permissões e proteção de dados

A [matriz por papel e tool](registry-and-roles.md) e o [inventário completo](tool-inventory.json) descrevem as fontes, gates e links. Toda leitura de negócio usa o JWT verificado do usuário. O servidor revalida vínculo, capacidades e escopo a cada execução; não há service role para essas leituras.

Os testes cobrem admin, gestor, operador, leitura e membros de comissão com/sem grants, além de outra pessoa, organização e segmento, revogação de capability e acesso anônimo. A [evidência SQL](rls-validation.json) usa PostgreSQL real em WASM com identidades sintéticas. Os helpers de negócio existentes são representados pela fixture: esse resultado valida as novas migrations, sem alegar uma bateria por papel no Supabase implantado.

O registry usa uma lista positiva de colunas e RPCs. Documentos, contatos, CPF/PIX, compradores e hóspedes não são enviados como dados brutos. Texto livre é minimizado; URLs externas e tokens de `/areas/` são retirados antes de persistência e provedor. Fontes de resposta passam por validação separada. Anexos e conteúdo web são dados não confiáveis; não fornecem novas ferramentas ou instruções de sistema. Ações de reunião exigem consentimento já persistido na sessão.

## Integrações e ativação

Na conta **Fenasoja**, o conector Lovable confirmou `LOVABLE_API_KEY` presente e vinculou a conexão Firecrawl existente a este projeto, confirmando `FIRECRAWL_API_KEY` presente. Nenhum valor de chave foi lido, registrado ou versionado. O [Firecrawl gerenciado](https://docs.lovable.dev/integrations/firecrawl) é chamado apenas no servidor por `connector-gateway.lovable.dev`, com os dois headers de autenticação da conexão. O [Gateway de IA](https://docs.lovable.dev/features/ai) usa o modelo configurável, padrão `google/gemini-3-flash-preview`.

**Não houve publicação em produção, aplicação remota das migrations nem deploy da nova Edge Function.** Após o merge, a ativação exige aplicar as duas migrations e implantar `workers-orchestrator` pelo fluxo autorizado do projeto. Sem isso, a UI comunica indisponibilidade; não apresenta resultados simulados. A prévia local de QA é separada do produto e mostra explicitamente dados de teste.

Não foi feito teste pago real dos provedores nem teste de entrega real de FCM/Google. A presença das conexões foi confirmada pelo Lovable; o contrato de rede foi validado com doubles e respostas adversariais.

## Evidências e limites

- [Validação automatizada e controles históricos](validation.md): suíte completa, lint e regressões existentes. Typecheck, build, ESLint dos arquivos próprios e testes novos são verificados separadamente; as falhas antigas da base permanecem descritas.
- [QA visual e acessibilidade](design-qa.md), [resultados de browser](visual-qa-results.json) e [capturas](captures/): 390×844 e 1280×800, claro/escuro, perfis, chat, estados e prévia administrativa; checagem de largura 360px.
- [Comparação de entradas existentes](existing-pages-qa.json): 16 pares sem sessão. 12 são byte a byte idênticos; nos outros quatro, apenas 12 pixels diferem em um nível de canal no texto de retorno ao portal, sem diferença de texto ou layout. As telas de negócio autenticadas não foram capturadas com sessão real.
- [Bundle](bundle.json) e [dependências](dependencies.json): Motion fixado; nenhuma versão previamente travada no lock npm mudou. A regularização autorizada do lock npm acrescenta as entradas ausentes de Drizzle/Postgres e dependências opcionais, além de Motion. Os três locks foram verificados.
- Os testes existentes de Agenda, mapa público, push e Google Calendar passaram. Nenhum arquivo de geometria, câmera, renderização, histórico comercial, FCM ou Google Calendar foi alterado.

A telemetria de tokens é explicitamente `user_scoped`, não uma medição financeira atestada. Falhas preservam uso parcial conhecido e indicam `usage_complete=false`; custo desconhecido permanece `null`. O painel administrativo de custos pertence à Fase 3. Pesquisa externa restringe fontes primárias; cache de clima é somente leitura. Não foi registrada a função legada `weather-service`, que tem efeitos adicionais.

O perfil de desempenho usa Chromium desktop com CPU 4× e 12 mascotes visíveis; não comprova o mesmo desempenho em um telefone físico. Animações dos bots permanecem ativas conforme orientação direta do Leonardo; as preferências globais e as demais telas não foram alteradas.

## Fechamento da validação

134 testes específicos passaram; typecheck, build, lint dos arquivos próprios e Deno passaram. O lint completo tem os mesmos 982 erros e 74 warnings do controle. O incremento inicial de JS/CSS é de **976 bytes gzip** (limite 1024), com CSS global compilado byte a byte idêntico. O código próprio de mascotes soma 3.251 bytes gzip, sem incluir o vendor Motion lazy.

O [arquivo de alterações](changed-files.txt) lista todos os caminhos desta PR, incluindo as capturas. O [resumo de execução](verification-summary.txt) preserva os resultados finais.
