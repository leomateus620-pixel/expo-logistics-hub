# Mapa Comercial: correção equivalente e recuperação — validação disponível

Foram corrigidos um custo CPU repetido da montagem e dois problemas de admissão gráfica/ordenação da recuperação. A cena, os perfis visuais e os contratos comerciais foram preservados. A validação disponível demonstra essas correções e preservação no host saudável; **a causa dos relatos em aparelhos afetados e a resolução nesses aparelhos continuam sem comprovação física**. O relato de aproximadamente 90% de acesso normal é uma estimativa do usuário.

## Revisões e ambiente

| Artefato | Identificação verificada |
| --- | --- |
| Base e `origin/main`, reconferido ao final | `8f3e871010ebfeab45824ba042183127da3b15e3` — PR #191 |
| Candidato de runtime, typecheck/build e builds QA comparados | `38aff99abd08261e7523a1855ca074ff1c350008` |
| Primeiro commit de implementação | `a08edbb70e103e3b0217d26acf6ff217d6687c32` |
| Runtime enviado pela conexão GitHub | `70ac0899dcf453b88727acaf77dcecaef9b225c2`, precedido de `445763963bee35926ad24f6746f47232c6ab046b`; mesma árvore Git do candidato medido: `302f4c857b1154a2486a43c728f4accd44a0378b` |
| Deploy observado, somente HTML público | HTML de `https://fenasojagestao.com` declara `8f3e871010ebfeab45824ba042183127da3b15e3`; detalhe em [entry-paths.md](entry-paths.md). Não é prova criptográfica de todos os bundles ou identidade de dados/sessão. |
| Isolamento Git | Branch `codex/map-constrained-devices`, worktree separado; checkout original permaneceu limpo. Base comparável em `/private/tmp/fenasoja-map-baseline`. |

Medições em 11/10/2026 no fuso do cliente; alguns timestamps UTC são de 12/10. Commit posterior de documentação/harness não altera os fontes de runtime medidos. Os manifests servidos identificam explicitamente os dois builds, sem presumir igualdade com produção. O terminal não possuía credenciais de push; a conexão GitHub autenticada enviou blobs/árvores equivalentes e criou commits com metadados próprios. Os SHAs locais medidos permanecem registrados, sem alegar que esses commits locais foram publicados. A igualdade das árvores é conferida antes de abrir a PR.

Host realmente testado: Mac Apple M5, 16 GiB, Chrome 155, WebGL2 ANGLE Metal. Three instalado **0.170.0**, R3F **8.17.10**; [environment.md](environment.md) registra grafo/locks, dependências e comandos. Ensaios sequenciais, uma cena residente por vez, sem build/test/outro benchmark concorrente. Uma rodada CPU4 que coincidiu com syntax check foi excluída e repetida integralmente; [política de entrada](boot-input-policy.json) preserva os originais e a razão.

## Causas demonstradas e implementação

1. **Busca espacial repetida no commit da vegetação.** `treeLayer.ts:commercialTreeSurfaceEntityAtPosition` filtrava o snapshot, testava polígonos e ordenava candidatos novamente para cada árvore e recebedor de sombra. O caminho piloto/instanciado normal também o utilizava. `createCommercialTreeSurfaceResolver` prepara candidatos/bounds e identificadores uma vez por snapshot; os batches compartilham o resolver pertencente à camada. Mantém a autoridade das funções anteriores, prioridade/ordem/epsilon, terreno natural e suporte/hole do P12. Não cria cache global, worker, recurso GPU ou novo controlador. [Mecanismo, equivalência, testes de refutação e recursos](scene-resources.md).
2. **Preparação falha podia chegar ao draw.** Liberar o job após erro/timeout removia seu estado pendente, mas `SunrisePostProcessing` não lia o erro essencial/barreira fechada. Agora o único dono do draw mantém saúde `failed/suspended` e bloqueia submissão até a preparação válida. A fila existente também permanece bloqueada por erro/barreira essencial, sem inventar readiness. Três regressões falharam na base; a injeção QA reproduziu draws após o marcador terminal na base e zero draws no candidato. Erro tem a ação existente; retry conserva renderer/câmera/seleção. [Preparação](shader-health.md), [evidência de navegador](functional/terminal-preparation-owner.json).
3. **Restauração concorrente de interiores.** Os probes retidos submetiam programas imediatamente em `webglcontextrestored`, enquanto a cena essencial se preparava. Agora reentram na fila existente, prioridade 140, atrás da barreira essencial e POST crítico. A abertura inicial não foi alterada; geração, abort, cancelamento e liberação única conservam ownership. Dois testes novos falharam na base; o controle de cancelamento já passava. [Detalhes e refutação](shader-health.md).

O evento `program-submission`, somente QA/DEV, mede a chamada `renderer.compile` separadamente da primeira reflexão, sem consultas GL adicionais. Não foram alterados compileAsync/deadline, recuperação do renderer, perfis, DPR, histerese, densidade, materiais, texturas, geometrias comerciais, picking, banco/RLS, dependências gráficas ou retry de dados. A pausa da cena coberta da PR #191 permanece e foi revalidada.

Essas causas locais são demonstradas; não permitem atribuir todos os freezes físicos ao resolver ou às falhas de preparação. A busca economizou cerca de 24 ms neste host; stalls de segundos precisam de trace do aparelho afetado.

## Hipóteses exigidas: estado e próximo teste

O [mapa completo das entradas autenticada, comissão e pública](entry-paths.md) acompanha dados/import/worker/montagem/programas/draw/controles/hidratação e distingue medição ausente de zero. Cada linha abaixo tem arquivo/função, reprodução, impacto, proposta e refutação detalhados nos relatórios vinculados.

| Hipótese | Estado nesta entrega | Teste que pode confirmar/refutar causalidade no alvo |
| --- | --- | --- |
| 1. Adaptação espera hidratação | Gate confirmado no controlador; gesto contínuo pode adiar a fila secundária. Impacto físico não medido. Intervenção antecipada pendente. | Frames essenciais realmente apresentados antes da hidratação, excluindo preparação/pausa/resize. Um booleano não detecta preparo iniciado/terminado entre callbacks; proposta exige epoch no owner existente. |
| 2. Picos essenciais CPU/React | Commit síncrono confirmado; otimização equivalente do resolver medida. Idle só concede admissão, não divide o trabalho. | Trace atual de construtores/commit no aparelho. Se espera for rede/GPU, refuta atribuição a esse commit. Não retirar estrutura da barreira real. |
| 3. RAM/núcleos não medem GPU | Confirmado como limite das pistas e da sondagem. Nenhum modelo/marca usado para downgrade. | Driver/capacidades/contexto uma vez e custo da carga real. Falha antes de dados/contexto refuta GPU nesse cenário. |
| 4. Custo permanece LOW/MEDIUM | Conteúdo canônico/objetos permanece; vegetação já instanciada e openGround já possui pool. Duplicação dominante não demonstrada. | Recursos por proprietário/dimensões/formato e alternâncias prolongadas; não chamar contagem de texturas de VRAM. |
| 5. Duas janelas de 45 frames | Política ativa confirmada, preservada. Stall extremo/proteção por progresso permanece pendente. | Intervalos ativos válidos extremos, tempo até decisão e controles contra gesto isolado/aba oculta/preparo como falsa fraqueza. |
| 6. Submissão/link/reflexão/draw | Falha de admissão e ordenação de restore corrigidas; custo indivisível por programa/driver continua possível. | Trace por programa/progresso/visibilidade em driver afetado; testar timeout/abort/handles aposentados. compileAsync não é correção automática. |
| 7. WebGL2 não certifica cena/targets | Limite confirmado. Perda/restauração QA passou; nenhuma falha física de shader/alocação foi reproduzida. | Correlacionar falha real à etapa/carga. Não acrescentar consultas síncronas por frame ou sondagem pesada no boot saudável. |
| 8. Tabela sem paridade | Confirmada ausência de paridade integral de Vendas múltiplas/interiores; fallback mantido como consulta. | Staging com ações integrais e inventário autorizado; lista não constitui resolução deste requisito. |
| 9. Rede/sessão/paginação/RLS | Ownership/cancelamento/revisão foram auditados e testes pertinentes executados. Backend atual não foi medido. Comissão possui espera sequencial sem limite local na expiração: possibilidade pendente. | Staging/trace de requests por etapa, páginas, erros/session/retries. Limitação de rede local dos módulos não demonstra custo RLS nem justifica gráficos reduzidos. |

O histórico em `device-performance`, `progressive-rain`, `navigation-resolution`, `dashboard-interaction-performance` e `commercial-map-systemic-performance.md` foi lido e separado das medidas novas. A máquina Intel UHD antiga e viewport móvel histórica não foram retomados como novos testes físicos. Fontes/API instaladas e links primários estão nos relatórios de cada mecanismo.

## Antes/depois medido

[Critérios e tolerâncias](acceptance.md) foram registrados antes da série. Qualidade fixa equivalente e comparação adaptativa são trabalhos separados; nesta entrega as séries comparativas usam HIGH fixo, sem reduzir efeitos, sombras ou DPR para atingir a referência de fluidez.

| Cenário | Base → candidato | Interpretação |
| --- | --- | --- |
| Resolver CPU, 20 passes alternados, preparação incluída | Mediana **24,683 → 0,840 ms**; p95 local 24,860 → 1,059 ms | 2.378 comparações exatas. Microbenchmark do cálculo, não FPS/boot completo. |
| Desktop frio, 10 aberturas por versão | Prontidão **3.472 → 3.395,5 ms**; montagem essencial 1.383,5 → 1.308,5 ms | Medianas neste host; cache HTTP limpo, shader do driver não controlado. |
| Desktop quente, 10 por versão | Prontidão **3.281,5 → 3.202 ms** | Reload no mesmo contexto. |
| CPU4 simulada, frio/quente, 3 por versão/cache | Prontidão 7.865 → 7.582 / 7.230 → 6.980 ms | Mesma GPU M5. Hidratação quente **14.040 → 14.749 ms**, máximo candidato 15.805 ms: variabilidade/piora conservada como pendência. |
| Viewport móvel, 3 por versão/cache | Frio 3.731 → 3.649; quente 3.542 → 3.426 ms | Emulação, buffer/DPR equivalente; não é Android/toque físico. |
| Rede 150 ms/200.000 B/s, 2 por versão/cache | Frio 20.603,5 → 20.475; quente 3.290,5 → 3.192 ms | Download de módulos loopback sem compressão, não dados comerciais/CDN/RLS. |
| Navegação HIGH, 40 percursos (20 saudável + 20 CPU4) | p50 por run 16,6–16,8 ms; p95 até 18,6 ms; máximo 20,2 ms; zero stalls >50 ms, long tasks ou resizes durante as janelas | Rotação contínua 3 repetições por pose/versão, gestos curtos/zoom-pan 1. Cadência semelhante, sem alegar ganho FPS. |
| Diagnóstico GPU separado, 1 rodada por versão, 18 amostras válidas | MainScene GPU mediana 4,099 → 3,859 ms; CPU submissão 4,2 → 4,4 ms | Exclui passes do compositor; não somar CPU/GPU, não declarar ganho sustentado. Zero disjoint/queries pendentes. |

**72 aberturas válidas, zero falhas**: cada uma verificou preparação, três apresentações novas, controles e gesto que moveu a câmera. Valores individuais/min/max e proveniência: [boot-results.md](boot-results.md), [boot-summary.json](boot-summary.json). Hidratação não melhorou uniformemente; nenhuma média geral esconde essa diferença. Não se calcula p95 populacional com poucas aberturas.

[Navegação](navigation-results.md) conserva p50/p95/p99 por percurso, stalls/máximos, foreground, path, qualidade, buffer, câmera/seleção e SHA; não demonstrou regressão sustentada pelo critério prévio neste host. GPU amostrada foi executada depois, com overhead isolado; [método/resultado](gpu-probe.md). `controls-responsive`/próximo RAF são oportunidade do event loop, não latência física input-to-photon. Heap não normaliza GC; upload/pico de VRAM/targets/driver/térmica permanecem desconhecidos.

## Preservação visual e funcional

[Evidência funcional](functional/README.md): candidato concluiu 26 cenários e registrou escrita/Vendas como indisponível; zero page errors. Busca/filtro/seleção/lista→3D/dashboard passaram pela UI real. Segmentos/interiores e ambientes passaram também por actions QA existentes, explicitamente diferentes de picking/permissões reais. Todos os interiores da fixture foram exercitados, incluindo P13/módulo 104 e sede B12, além de Visita, noite/chuva/amanhecer, resize, pointercancel/perda de captura, hidden/retorno, falha terminal/retry e perda/restauração WebGL exclusivamente QA. A cena coberta não apresentou novos frames; identidade/pose foram preservadas no retorno.

Inventário principal: fixture oficial **2026**, 1.578 entidades/1.466 lotes, não o inventário autorizado atual do banco. A fixture separada Exporural 2028 também passou nos dois builds. Hashes de inventário/posição/geometria/preço/estado e buffers de geometria/instâncias foram iguais. Overview conservou 23.573 instâncias/639 geometrias/101 texturas scene-owned. Estimativa por formato/dimensões 62.930.804 bytes e buffers CPU 18.230.978 bytes não são VRAM nem total de targets/driver.

Imagens originais: [overview base](functional/base-canonical-overview.png)/[candidato](functional/candidate-canonical-overview.png) inspecionados; conteúdo animado impede alegar igualdade pixel a pixel. [Pavilhão 13 base](functional/base-interior-B5.png)/[candidato](functional/candidate-interior-B5.png) têm PNG idêntico e labels legíveis. Dashboard também teve PNG idêntico. [Erro com ação](functional/candidate-preparation-failed.png) e [restauração](functional/candidate-context-restored.png) conservam a saída útil e o retorno.

Não houve alterações em compradores, seleção/carrinho/checkout, reservas, preços/status, contratos/parcelas/anexos, edição, permissões, banco, Storage ou integrações. Isso é verificado pelo escopo do diff e testes/fixture disponíveis; não substitui os fluxos autorizados em staging.

## Testes e limites físicos

- **271 testes únicos da aplicação aprovados**, em 27 arquivos pertinentes. Árvore 53; preparação/health/fila/presentation/boot 92; outros comportamentos 136, com dez testes de boot comuns contados só uma vez. **Cinco falhas preexistentes** de BootLoader/LoadingPipeline foram repetidas na base com os mesmos nomes; sem afrouxar assertions. [Resultados](behavior-tests.json), [árvores](tree-tests.json), [shader/recuperação](shader-health-tests.json). Não foi executada a suíte global completa.
- Sete testes adicionais do probe GPU QA passaram. Checks de sintaxe dos harnesses passaram. Testes substitutos/DOM comprovam comportamento, não driver/fluidez física.
- `npm run typecheck` e `npm run build -- --manifest` passaram no código candidato. Build normal sem rotas QA; efeito colateral MCP comparado e idêntico. `npm ci` tem falha preexistente no lock; dependências instaladas em scratch e compartilhadas igualmente, com hashes/grafo registrados. Locks/dependências versionadas preservados.

| Matriz | Testado / lacuna |
| --- | --- |
| Computador saudável | Mac M5/16 GiB/Chrome 155, séries acima |
| CPU/rede/viewport limitadas | Simulações CDP no mesmo Mac/GPU, não aparelho físico |
| Desktop antigo integrado/4 GB; mais RAM/GPU limitada | Nenhum disponível; pendente |
| Android 2–4 GB; Android intermediário; celular saudável | Nenhum disponível; pendente |
| Safari Mac / iPhone | Safari presente, automação indisponível por permissões de Acessibilidade/Captura de Tela pendentes; nenhum ensaio Safari/iPhone concluído |
| Toque real, energia/térmica, 15–30 min e memória residente prolongada | Não medidos; pendentes |
| Autenticação/comissão/token público; Vendas/contratos/parcelas/Storage/RLS reais | Staging ainda indisponível; pendentes |

Docker/Supabase CLI/PostgreSQL não estão disponíveis neste host. Não foram aplicadas migrations nem realizados writes comerciais. [Preparação do staging](local-staging.md) registra exatamente as dependências e a necessidade de isolar cron/pg_net/Auth/Storage/functions/egress antes de migrations: migrations históricas contêm destinos de serviços reais. Nenhuma configuração/credencial/dump de produção foi copiada. A fixture read-only usa backend inválido, CSP e bloqueio de rede, sem proxy/API/escritas. O roteiro de banco separado permanece preparação, não banco comercial funcionando.

## Testar, encerrar e rollback

Ambiente read-only servido: [base local](http://127.0.0.1:4241/__dev/commercial-map-interface?qualityQa=HIGH), [candidato local](http://127.0.0.1:4242/__dev/commercial-map-interface?qualityQa=HIGH). Candidato para aparelho na mesma rede: [192.168.0.109:4242](http://192.168.0.109:4242/__dev/commercial-map-interface?qualityQa=HIGH), IP sujeito a mudança. [environment.md](environment.md) contém comandos completos de build/início/encerramento e comparação física. Servir também a base em LAN para AB/BA, uma cena viva por vez. A fixture não substitui staging autenticado.

Encerrar com Ctrl+C, ou `lsof` nas portas 4241/4242 e `kill -TERM` somente nos PIDs desses servidores. Nenhum container/banco foi iniciado. Não apagar pastas ou resetar checkout para parar.

Rollback de runtime na branch da PR: em branch própria, `git revert 70ac0899dcf453b88727acaf77dcecaef9b225c2 445763963bee35926ad24f6746f47232c6ab046b`, nessa ordem, seguido de typecheck/build normal. Nos commits locais originais os equivalentes são `38aff99a` e `a08edbb7`. Não há migration/dependência/infraestrutura a reverter. A PR é para revisão; **nenhuma publicação ou deploy em produção foi executado**.
