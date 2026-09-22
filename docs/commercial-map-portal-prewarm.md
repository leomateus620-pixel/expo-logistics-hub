# Portal → Mapa Comercial: preparação antecipada

## Leitura e contratos preservados

A implementação foi precedida pela leitura de `commercial-map-performance-audit.md`, `commercial-map-systemic-performance.md`, `commercial-map-performance-samples.json` e `MAPA_COMERCIAL_ARQUITETURA.md`, além do caminho real App → Portal → guard → hook → serviço → Canvas. Os números desses documentos são históricos; não representam o benchmark desta alteração.

O Portal autoriza a preparação somente após autenticação, organização e capacidade `map.view` resolvidas. A rota continua com seus próprios guards, e o backend continua aplicando RLS. A preparação não cria um Canvas, renderer, câmera, controles ou contexto WebGL, nem monta a página do mapa. As experiências gráficas que já existiam no Portal permanecem independentes. Portanto, o teste de contextos deve contar os contextos adicionais atribuídos ao mapa, sem confundir a Alvorada ou o ecossistema já existentes com este prewarm.

## Arquitetura

- `loadCommercialMapRouteModule.ts`: um único import compartilhado da página. O loader não inicia boot nem telemetria de entrada; o factory de `React.lazy` no App continua responsável pelo boot real. Promessas de import com erro são removidas para permitir nova tentativa.
- `commercialMapQueryKey.ts` e `commercialMapQuery.ts`: mesma chave, serviço, projeção, política de atualização e cache TanStack usados pelo Portal e pelo hook da rota. A projeção foi extraída sem mudar sua ordem para `presentCommercialMapData.ts`.
- `commercialMapPrewarm.ts`: admissão serial e idempotente de código, dados, preparação CPU e um recurso gráfico público pequeno. O scheduler aceita tarefas/ambiente injetáveis para testar a política e para QA com fixture sem abrir dados privados.
- `useCommercialMapPrewarm.ts`: vincula o scheduler à identidade e autorização resolvidas do Portal; pausa novas etapas durante o ecossistema. A intenção por foco, pointer enter ou touch promove trabalho pendente. A navegação transfere ao mapa as operações já iniciadas.
- `commercialMapOperation.ts`: instrumentação capturada por operação e propagação do AbortSignal ao PostgREST. Uma verificação após cada resposta rejeita resultados tardios mesmo quando o adaptador não suporta cancelamento de transporte.
- `preloadCanvas.ts` e `headquartersPreparationResource.ts`: reaproveitam os mesmos imports e o worker CPU existentes. O import do renderer não monta o Canvas. Uma falha especulativa do worker não dispara o fallback pesado na thread principal; o fallback continua reservado ao leitor efetivamente montado.

A entrada existente do Portal conserva destino, semântica de Link, foco de teclado e estado de acesso. Nenhum painel de progresso ou etapa obrigatória foi acrescentado ao usuário.

A auditoria do manifest também detectou uma dependência eager de Three já presente na baseline: metadados de landmarks importavam uma constante do módulo que constrói a arquitetura do Portão 9, e controles HTML importavam `MathUtils` somente para limitar três valores. A constante agora vive em `soyGatePresentation.ts` e continua reexportada pelo módulo antigo; `contextualViewport.ts` usa os tipos de câmera/vetor sem importar o renderer em runtime e mantém a mesma expressão matemática de clamp. Isso separa dados/UI de geometria sem alterar a geometria ou o comportamento dos controles. Um teste de fronteira avalia a rota inteira com imports de Three/stdlib proibidos, além dos testes existentes dos cálculos de câmera e obstrução.

## Política de execução, segurança e cache

O prewarm especulativo espera dois frames para permitir a apresentação do Portal, depois idle time com limite de espera. Navegadores sem idle callback usam um timeout conservador; poucos núcleos aumentam esse intervalo. Save-Data, slow-2g e 2g suspendem especulação, permitindo promoção por intenção explícita. A aba oculta não admite novas etapas. Import/parse já iniciados não são interrompíveis; a preparação não promete ausência de long tasks apenas por usar idle callback.

As chaves permanecem exatamente `['commercial-map','full',userId,orgId]` e `['commercial-map','commission',userId,orgId,commissionId,segmentId]`. `staleTime` permanece 30 segundos, `retry` permanece 1, `gcTime` específico passa a 10 minutos, e `meta.persist` permanece false. O persister existente também exclui o prefixo commercial-map. Assim, inventário e dados comerciais preparados vivem somente na memória desta sessão. Dados stale continuam disponíveis enquanto ocorre a atualização canônica em segundo plano.

Troca de usuário/organização ou revogação cancela a query full da identidade anterior e remove somente essa chave exata. Não cancela consultas de outra identidade ou de comissão. O AuthProvider mantém a limpeza global já existente no logout. A busca recebe o mesmo sinal em projeto, manutenção de reservas, calibração, RPC de inventário e todas as páginas. A manutenção e leitura inicial de projeto continuam paralelas; inventário comercial só é aceito após manutenção válida. Paginação completa, projeções explícitas e falha fechada de escopo foram preservadas.

Uma saída normal do Portal cancela etapas ainda não admitidas. Um clique explícito no mapa deixa import/query/worker já iniciados reutilizáveis pela rota. A query oficial decide frescor e reutilização; não existe segundo inventário ou mapa paralelo. O único asset adicional é o símbolo institucional público já usado pela cena; não se assinam plantas privadas, nem se carregam todos os interiores.

## Instrumentação e medição

Cada operação captura seu recorder antes de iniciar. Uma query ou worker iniciado pelo Portal continua emitindo `portal-prewarm:*`, mesmo se terminar depois que o mapa foi aberto. Não há um switch global que possa trocar a atribuição no meio da operação. Eventos de prewarm são limitados a 160 entradas e habilitados apenas no build de diagnóstico.

O renderer compartilhado informa a cada chamador `renderer-module-ready`, inclusive quando o import foi preparado anteriormente, com origem cold/prefetched/cached. O boot real continua pertencendo à navegação, com geração própria no módulo de diagnostics; permanência no Portal não integra a duração de entrada. A preparação CPU não inclui upload/compilação GPU, que só podem ser medidos depois do contexto real. Não é correto declarar três segundos por subtrair prewarm de uma medição histórica ou pelo tamanho dos chunks.

Antes de criar o observer da query, a rota captura a origem em `route-data:source`: cached se já existe inventário, prefetched se existe fetch em andamento sem inventário, cold nos demais casos. `route-data-wait:start/end` mede quanto a rota aguarda dados apresentáveis, inclusive quando a operação de rede pertence ao prewarm e permanece corretamente fora de `dataMs`. O recorder pertence ao boot capturado; conclusão de uma observação antiga não entra no próximo boot. Nenhum ID, chave ou conteúdo da query é publicado. O marcador legado de readiness permanece inalterado. Quatro testes adicionais verificam cache, operação em voo, falha fria e descarte da conclusão de boot obsoleto.

A página QA usa o mesmo scheduler, loader, worker e controle do Portal, substituindo explicitamente apenas dados por fixture. Seus resultados medem o caminho de renderização e a reutilização local; não comprovam SLA de autenticação, autorização ou banco remoto. O relatório integrado deve separar acesso direto frio, Portal sem espera, espera idle, intenção e retorno aquecido, além de preservar os tempos reais de shaders/primeiro frame e a configuração de cache/hardware.

## Validação desta parte

Executado: 7 suites focadas, 50 testes passando. Cobertura inclui admissão/cancelamento, idempotência, aba oculta, conexão restrita, promoção, erro e retry por intenção, handoff, isolamento por usuário/organização/comissão, cache fresco/stale, GC e persistência, autorização e eventos de entrada, AbortSignal e rejeição de resposta tardia, manutenção de reservas, paginação, preços e relações comerciais, paridade binária do worker B12 e regressão do Portal. O teste unitário sem WebGL valida o scheduler/loader isolado; a confirmação da cena real e dos contextos adicionais pertence ao benchmark de navegador. ESLint dos módulos novos e módulos de preload alterados passou.

Limites restantes: não há medição de backend autenticado nesta fixture; em navegador, download e parse já iniciados não são canceláveis; o worker compartilhado concluído permanece em memória como antes para reutilização; shader compilation/upload/primeira apresentação GPU não são executados no Portal e precisam de medição real. Resultados de dispositivo físico e SLA de três segundos devem constar somente se efetivamente medidos no relatório integrado.
