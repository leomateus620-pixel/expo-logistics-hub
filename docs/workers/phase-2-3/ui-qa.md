# Bots Fenasoja — UI e validação das Fases 2 e 3

Data: 16/10/2026. Contrato utilizado: `supabase/functions/_shared/workers/workspace-contracts.ts`, reexportado pelo frontend. O documento `ui-contract-research.md` registra uma proposta anterior; o contrato canônico prevalece, inclusive com apenas três kinds de ação habilitáveis: nota nova da Arena, reserva e negociação comercial. Checklist permanece indisponível por seus efeitos indiretos de notificação.

## Resultado

- **55 capturas**, nos formatos 390×844 e 1280×800, em claro/escuro, mais verificações em 360×800. **55 verificações axe sem violações e 55 sem overflow da página.**
- **10 de 10 fluxos de navegador aprovados**, usando componentes React, hooks e cliente HTTP reais contra fixture isolada em localhost.
- Após o último ajuste de quebra de linha do aviso de rotina: **8 capturas seletivas atualizadas**, com **8 verificações axe sem violações e 8 sem overflow**. As imagens de proposta e execução de rotina foram substituídas pelas versões finais nos mesmos caminhos.
- **25 testes de UI/hooks aprovados**: 14 do catálogo/chat/links, 8 de cards/rotinas/memória/foco e 3 de isolamento/reconciliação. Lint dos arquivos alterados nesta frente passou com `--max-warnings 0`.
- Typecheck do app foi executado; a única ocorrência na última rodada foi uma opção `exact` de Playwright usada indevidamente numa asserção Testing Library. Foi removida do teste, sem mudança no produto; a integração final repete typecheck/build/suíte completa no relatório geral.

Evidências estruturadas: [rodada completa](./visual-workspace-qa-results.json) e [adendo de rotinas](./visual-workspace-routine-qa-results.json). O relatório geral de integração, backend, SQL, regressões e build é [report.md](./report.md).

## O que mudou

O chat recupera cards e eventos estruturados por conversa, preserva o histórico e identifica execuções de rotina por `requestId`. Mensagens de usuário sintéticas de execução são omitidas da timeline; a resposta exibe divisor com horário agendado e horário efetivo quando recuperada. Links `view=routines`, `view=memory` e `view=inbox` abrem painéis reais. O catálogo e os perfis explicam as alterações com confirmação e não prometem ferramentas indisponíveis.

Os cards mostram resumo, diff sanitizado, registro, validade, Confirmar/Editar/Cancelar e receipt. Um relógio compartilhado usa a referência de tempo do servidor com avanço monotônico; a contagem não autoriza a execução. Editar ou preencher dados comerciais gera nova versão/diff no servidor. Confirmar envia somente ID/versão. Um timeout reconcilia pelo GET do mesmo card; a interface não cria outra ação nem anuncia sucesso antes do receipt. Não há Desfazer de negócio sem inversa segura.

Empresa, contato e prazo da reserva são preenchidos somente em formulário protegido e efêmero. Não são enviados como mensagem, input do planejador, SSE ou log. O formulário é limpo ao fechar, salvar ou perder seu escopo; reabrir não recupera valores privados do histórico. A apresentação deixa explícita a diferença entre validade da proposta e prazo da reserva. O estado da proposta continua sendo validado pelo servidor.

Rotinas têm proposta confirmável, pausa, retomada, desativação, histórico e evento com Desfazer que desativa ocorrências futuras. O botão Atualizar pendências consulta apenas ocorrências vencidas, sem antecipar execuções. A limitação confirmada por Leonardo aparece na UI: execução com o app aberto e recuperação ao entrar, em America/Sao_Paulo. As receitas anunciadas se limitam a agenda/conflitos, idade de vendas em aberto e snapshots de clima dos transportes.

Memória permite inclusão explícita, edição e ativação/desativação versionada. Precisa de você reúne propostas de ação, propostas de rotina e alertas próprios. O painel administrativo apresenta agregados por usuário/bot, informa telemetria parcial e mostra custo como **Não informado**, com limite **Não configurado**; não inventa custo zero, saldo ou percentual. Não exibe conversas, memória ou payloads privados de outras pessoas.

Foram preservados marca/ícone próprios da Fenasoja, nomenclatura Bots, Motion lazy e os mascotes existentes. O CSS novo fica em `.workers-scope` e reutiliza tokens `--worker-*`; não há alteração de token/estilo global, geometria ou renderização do mapa nesta frente. Nenhum pacote novo foi instalado nesta etapa de UI.

## Arquivos desta frente

- `src/features/workers/workspace/useWorkerWorkspace.ts`: leitura, escopo, mutações, proteção contra clique duplicado e reconciliação de resultado incerto.
- `src/features/workers/workspace/WorkspaceActionCard.tsx`: card, diff, validade, edição, formulário comercial protegido e retorno de foco.
- `src/features/workers/workspace/WorkspacePanels.tsx`: rotinas, execuções, eventos, memória e alertas.
- `src/features/workers/pages/WorkersUsagePage.tsx`: agregação administrativa, dados parciais e custo desconhecido.
- `WorkersRoot.tsx`, `WorkersCopilot.tsx`, `components/WorkersChat.tsx`, `pages/TeamPage.tsx`, `pages/WorkerProfilePage.tsx`, `workerCatalog.ts` e `types.ts`: integração, navegação, conteúdo e identificação de execuções.
- `src/features/workers/styles/workspace.css`: estilos novos escopados, formulários, estados, foco, layouts e tabela responsiva.
- `src/features/workers/__tests__/{workerUi,workspaceUi,workspaceHook}.test.tsx`: cobertura desta frente.
- `scripts/workers/preview-workspace.ts`, `preview.vite.config.ts`, `preview.tsx` e `visual-workspace-qa.mjs`: cenário local reproduzível. O cenário sem `scenario=workspace` continua podendo renderizar o chat vazio sem erros artificiais de endpoint; leituras de workspace devolvem estruturas vazias.

`api.ts`, `workspace-api.ts`, `workspace-contracts.ts`, `database.ts`, `useWorkersChat.ts`, runner global, App, launcher e backend foram integrados pela frente principal. Esta frente não criou migrations, fez deploy ou publicou o frontend.

## Fluxos exercitados no navegador

1. Editar uma nota regenera o diff antes da confirmação.
2. Dois cliques em Confirmar enviam um único comando pela instância de UI e mostram o receipt.
3. Dados comerciais passam somente pelo comando privado; não aparecem na conversa e são apagados do formulário ao reabrir.
4. Escape fecha o formulário protegido e devolve foco ao botão de edição.
5. Cancelar apresenta estado terminal, sem exclusão ou botão Confirmar.
6. Confirmar rotina cria evento com Desfazer; Desfazer desativa futuras ocorrências.
7. Digitar memória não grava; salvar e desativar são ações explícitas.
8. Falha HTTP 503 depois de um commit sintético reconcilia pelo GET do mesmo card.
9. Conta sintética de leitura não recebe controles de confirmação ou formulário comercial.
10. Conteúdo permanece dentro da viewport de 360px.

O erro de rede 503 é intencional e está registrado em `expectedTransportErrors`; erros inesperados de console/página: **zero**. Capturas de formulários usam campos vazios ou dados fictícios, nunca dados pessoais reais.

## Iterações visuais e acessibilidade

O axe identificou uma região de tabela com rolagem sem acesso de teclado; recebeu nome, `role=region` e `tabIndex=0`. A inspeção de screenshots encontrou gutter insuficiente na página Uso e o botão Fechar inadequado no escuro; foram corrigidos com gutter de 16px no mobile/40px no desktop e botão escopado de 44px com superfície/texto dos tokens do bot. O teste de Escape detectou falta de retorno de foco em sheets abertos programaticamente; `onCloseAutoFocus` passou a restaurar o disparador, com fallback ao composer. Por último, texto e validade da rotina foram agrupados em um único bloco, eliminando uma coluna estreita de palavras quebradas.

As imagens finais foram inspecionadas diretamente, incluindo os formulários privados e de memória, a página Uso e a proposta de rotina no mobile. Exemplos:

- [Card pendente · mobile claro](./captures/390x844-light-action-pending.png)
- [Formulário protegido · mobile claro](./captures/390x844-light-action-private-form.png)
- [Rotina com quebra de linha corrigida · mobile claro](./captures/390x844-light-routine-proposal.png)
- [Execução e chips · mobile escuro](./captures/390x844-dark-routine-run-chips.png)
- [Memória editável · mobile claro](./captures/390x844-light-memory-editor.png)
- [Uso com custos desconhecidos · mobile claro](./captures/390x844-light-usage-unknown.png)
- [Rotinas · desktop escuro](./captures/1280x800-dark-routine-proposal.png)

## Reprodução e limites das evidências

Com o servidor isolado `scripts/workers/preview.vite.config.ts` em `http://127.0.0.1:5188`, executar:

```sh
node scripts/workers/visual-workspace-qa.mjs
WORKERS_QA_ROUTINE_ONLY=1 node scripts/workers/visual-workspace-qa.mjs
```

O script aceita somente localhost/127.0.0.1. Playwright/Chromium e axe são resolvidos dos caminhos do runtime local, configuráveis por variáveis `WORKERS_QA_*`. O cenário é criado com `?scenario=workspace`; não existe bypass de sessão ou cenário sintético no bundle do produto. Valores comerciais privados não são persistidos nem ecoados nem mesmo pela fixture. O JSON de evidência registra somente nomes das chaves dos comandos e dos campos manuais.

Esses testes provam comportamento da interface e do cliente HTTP com DTOs reais; **não provam RLS em produção, concorrência transacional entre duas conexões, custo faturado, entrega de notificação ou resposta de provedor de IA real**. A proteção por papel da fixture é sintética e complementa, sem substituir, os testes SQL e integração do relatório geral. Não foi feita medição em dispositivo móvel físico. O pacote de mascotes/Motion permanece o mesmo já medido na Fase 0+1; esta rodada concentrou-se nos novos estados, teclado, acessibilidade e layouts, sem apresentar a medição anterior como benchmark físico novo.
