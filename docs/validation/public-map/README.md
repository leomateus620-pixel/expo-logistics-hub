# Validação dos mapas públicos externos

## Escopo e reprodução

Base: commit ba2e2cdc. Candidata: branch codex/public-map-performance. Os dez slugs, tokens, domínio, RPCs de autorização, regras comerciais e geometria cadastral permanecem preservados. A política externa deriva do inventário autorizado; não depende de comparações de URL nos componentes.

Ambiente medido: Windows, Intel Core i5-1035G1, 4 processadores lógicos disponíveis, 8 GB de RAM, Intel UHD via ANGLE/D3D11, Chromium integrado do Codex. Desktop 1366 × 900, DPR 1; mobile é somente viewport Chromium, não iPhone/Safari nem Android físico. Aplicação servida localmente com gzip; RPCs anônimos consultam o backend real. Sem limitação artificial de rede. Uma cena ativa por vez, sem build ou testes pesados durante as medições aceitas.

“Frio” significa primeira navegação numa origem HTTP local nova. O cache de shaders do processo/GPU e o cache do sistema operacional não foram zerados. “Aquecido” significa refresh na mesma origem. Não extrapolar para CDN, primeiro acesso em outro dispositivo ou rede móvel.

A instrumentação optativa em scripts/commercial-map-performance/public-preview.cjs é injetada somente nos previews de QA. Registra requests sem tokens/corpos, primeira confirmação real de imagem útil, recursos, saúde, memória e seleção até dois requestAnimationFrame após atualização da ficha. Os controles ?qa simulam falhas/revisões somente no preview e não escrevem cadastros.

    $env:VITE_COMMERCIAL_MAP_DIAGNOSTICS='true'
    npx vite build --manifest --outDir dist-public-final
    node scripts/commercial-map-performance/public-preview.cjs dist-public-final
    node scripts/commercial-map-performance/serve-public-preview.cjs dist-public-final 4240 4241 4242
    node scripts/commercial-map-performance/bundle-report.cjs dist-public-final --assert-independent

## Diagnóstico comprovado

- O contexto cartográfico começava depois do inventário. O Canvas recebia primeiro o subconjunto e depois o parque completo, repetindo preparação. O novo fluxo inicia as consultas independentes juntas e monta uma única extensão espacial.
- A consulta de revisão inicial concorria com uma revisão já incluída no inventário. Revalidações de preços invalidavam também o contexto. Agora a revisão inicial é reutilizada e as revisões comercial/cartográfica são independentes.
- O placeholder podia entregar dados da área anterior enquanto outro link carregava. Cada link possui identidade própria e nunca usa esse placeholder.
- A cena pública seguia iluminação, vegetação, preparação de interiores/física e barreiras de detalhes distantes do mapa completo. A política externa retira esses custos específicos da consulta e admite detalhes secundários pela fila existente.
- O lote agrupado reconstruía sua geometria quando mudava o array comercial. Agora as geometrias usam identidades estruturais estáveis; preço não reconstrói a malha e status atualiza as cores afetadas.
- A telemetria de seleção dependia de mapas derivados do inventário e podia repetir ao revalidar. A seleção válida e os eventos por visita agora são preservados.
- Erros temporários eram apresentados como link inválido. Somente a recusa explícita do backend é tratada como autorização inválida; rede, importação e WebGL oferecem recuperação/lista.

Não foi possível separar validação do token de execução SQL/rede: essas etapas ocorrem dentro do mesmo RPC. Os tempos documentados são os efetivamente observáveis no cliente.

## Implementação

PublicExternalScenePolicy separa contexto, entidades coloridas, lotes interativos e bounds autorizados. O padrão dos componentes continua com vegetação e apresentação originais. Nos links individuais de pavilhão a política é nula.

As árvores deixam de ser geradas/alocadas nos caminhos principal, acesso, fundo, território, bairro residencial, Arena, Via Expressa e memorial lunar. Superfícies, ruas, canteiros, postes, construções e hierarquias são mantidos. Materiais cinza são variantes locais reutilizadas, com referências controladas e texturas emprestadas; não alteram os materiais de origem. Contexto usa camada sem raycast comercial. Os pavilhões e seus descendentes são contexto no segmento explicitamente externo.

O enquadramento usa os lotes autorizados e o tamanho real do Canvas. O primeiro foco não executa uma viagem sobre o parque; reenquadramento usa o controlador existente. O frame loop continua demand, com o mesmo dono de renderização e recuperação. A lista mantém o Canvas e a câmera; a ficha externa tem expansão compacta no mobile, foco e Escape.

A migração 20260921010000_public_map_context_revision.sql preserva os resolvedores de autorização e acrescenta hash de cartografia e projeção de metadata visual do contexto. **Foi preparada para revisão na PR; não foi aplicada ao banco de produção nesta tarefa.** Até sua aplicação, há compatibilidade com o RPC atual: revalidação cartográfica a cada 60 s, sem carregar preços/status de outros segmentos. A migração precisa passar pelo processo de aplicação do projeto.

## Verificações já concluídas

- Backend real dos dez links: lote permitido retorna 200; lote de outro escopo retorna 401 PUBLIC_MAP_LOT_OUT_OF_SCOPE; token inválido retorna 401 PUBLIC_MAP_LINK_INVALID. Ver authorization-live.json.
- 37 testes públicos focados passaram: isolamento, política/material, exclusão de recursos vegetais, ciclo de vida, atualização sem remontagem/telemetria repetida, saída de escopo, cancelamento, erro de rede e restauração.
- Suíte ampla: base 2.121 testes, 2.030 aprovados e 91 falhas; candidata 2.135 testes, 2.045 aprovados e 90 falhas. Comparação nominal em test-comparison.json. Duas diferenças foram investigadas: a asserção textual de descarte foi atendida com guarda explícita e o teste de vegetação passou isolado; reexecução dos dois arquivos: 16/16. As falhas históricas restantes não são apresentadas como resolvidas.
- Typecheck e lint dos arquivos alterados passaram. Build de produção e verificação de independência dos chunks passaram; renderer, física e PDF não são pré-requisitos da consulta inicial. Tamanhos estáticos em bundle-report.json não são tempos de rede.


## Regressão autenticada

O usuário autenticou a versão candidata local. Foram exercitados o mapa administrativo (árvores e cores originais, visão superior/geral, modo noturno), Modo Vendas (seleção, cálculo de Q-L-05: 187 m² × R$ 37/m² = R$ 6.919, limpeza e saída; nenhuma venda concluída) e portais das três comissões.

Os portais Exporural e Indústria/Comércio apresentaram “Segmento comercial indisponível”. O mesmo erro foi reproduzido com o build base na mesma origem e sessão autenticada, usando a opção de preview qaBuild=baseline. Portanto, não se declara aprovação visual desses dois mapas: há uma falha preexistente de confirmação de configuração/autorização que precisa de investigação própria. O portal Espaço do Automóvel abriu seu dashboard existente, marcado Em estruturação, sem um menu de mapa comercial. Nenhuma permissão foi ampliada nem regra de acesso foi alterada.

## Instrumentação e amostras descartadas

As amostras anteriores à série measured são exploratórias e não sustentam os percentuais finais. A auditoria de atualização automática encontrou uma comparação incorreta entre scripts executáveis e links modulepreload no produto base. Também foi corrigida uma string de simulação no probe local. A série measured usa exclusivamente scripts executáveis para a candidata e acumula tempo entre recargas anteriores à primeira imagem, registrando navigationCount. Isso evita confundir uma recarga automática com um acesso originalmente aquecido.

Os registros completos de cada execução (arquivos JSON citados abaixo) estão em [measurements.zip](measurements.zip). O [resumo das medições](measurement-summary.json) e os resultados dos testes permanecem disponíveis sem descompactar.

## Medições comparativas aceitas

Série `measured-*`: duas origens frias por versão, segmento e viewport, seguidas de refresh. Tempos abaixo são as execuções individuais em segundos, sem excluir resultados desfavoráveis. A versão base teve recargas automáticas antes da primeira imagem (navigationCount=2); o tempo acumulado inclui ambas. A candidata teve navigationCount=1. Duas execuções da base Automóvel mobile permaneceram em preparação por mais de 36 s; foram registradas como falhas, sem substituir por números estimados.

| Segmento / viewport | Base fria | Candidata fria | Base aquecida | Candidata aquecida |
|---|---:|---:|---:|---:|
| exporural / desktop | 16.26 / 4.77 | 5.90 / 8.21 | 2.06 / 12.94 | 3.95 / 4.15 |
| exporural / mobile | 5.32 / 16.59 | 4.60 / 5.00 | 9.07 / 2.22 | 3.72 / 3.82 |
| industria / desktop | 14.22 / 21.73 | 5.89 / 6.11 | 9.59 / 7.77 | 3.81 / 3.65 |
| industria / mobile | 10.44 / 19.16 | 4.98 / 4.70 | 6.31 / 6.74 | 4.13 / 3.52 |
| automovel / desktop | 19.27 / 21.39 | 6.16 / 6.63 | 6.01 / 6.24 | 3.53 / 3.94 |
| automovel / mobile | 22.49 / falha | 5.80 / 4.01 | 6.08 / falha | 3.63 / 3.49 |

**A meta de cinco segundos não foi atingida consistentemente.** No desktop, a candidata teve 5,89–8,21 s fria e 3,53–4,15 s aquecida. No viewport mobile, 4,01–5,80 s fria e 3,49–4,13 s aquecida. As amostras não certificam acesso pela CDN em produção nem rede móvel. A correção final de CSS e restauração de navegação foi verificada após esta série; não altera o caminho de abertura sem snapshot.

Exemplo da execução fria mais lenta da candidata (Exporural 8,21 s): RPC de inventário 2,21 s, contexto 3,05 s, iniciados juntos em ~0,63 s; Canvas observado em 6,37 s, preparação de shaders/cena 1,64 s e primeira imagem em 8,21 s. Ainda há preparação CPU e rede relevantes. A validação do token é interna ao RPC e não foi cronometrada isoladamente. JSONs guardam download dos chunks, eventos de preparação, compilação, primeira apresentação e primeira interação observável.

## Seleção, navegação e memória

| Ensaio | Seleção até ficha (ms) | FPS da janela final (240 frames) | p95 do intervalo entre frames |
|---|---:|---:|---:|
| Exporural desktop, 21 seleções | 35–100 | 60,3 | 17,8 ms |
| Indústria mobile emulado, 21 seleções | 37–55 | 60,2 | 17,2 ms |
| Automóvel mobile emulado, 20 seleções | 36–57 | 60,0 | 17,1 ms |

Seleção medida até dois frames após mudança da ficha, com dados locais, não latência física de tela/toque. FPS vem de janela limitada de navegação; não é média do carregamento inteiro nem prova de 30 FPS em telefone físico. O controlador existente reduziu DPR durante gestos mobile (1 para 0,72), sem um segundo frame loop.

Exporural manteve 858 geometrias, 75 texturas e 123 programas antes/depois dos ciclos; heap JS variou de 144 para 154 MB. No Automóvel mobile, 410→414 geometrias após navegação, 40 texturas e 111 programas; heap caiu de 525 para 405 MB com coleta natural. Indústria admitiu recursos progressivos/LOD (481→554 geometrias), com 70 texturas e 119 programas estáveis. Portanto, a ausência de vazamento contínuo em todas as situações não está demonstrada por essas amostras. Não houve perda espontânea de contexto nos ensaios da candidata.

## Matriz funcional e limites

| Verificação | Exporural | Indústria externa | Automóvel |
|---|---|---|---|
| Acesso direto e refresh (desktop/mobile) | passou | passou | passou |
| Escopo em foco/colorido, árvores ausentes, contexto cinza e vias contínuas | inspecionado | inspecionado | inspecionado |
| Arrasto de rotação, zoom e reenquadramento | passou | passou | passou |
| Lista, troca/fechamento de ficha e dados oficiais | passou | passou | passou |
| Lote estrangeiro negado pelo RPC real | 401 | 401 | 401 |
| Revisão de disponibilidade com câmera/Canvas preservados | passou | passou | passou |
| Perda/restauração WebGL e acesso à lista | passou | passou | passou |
| Falha temporária de rede com mensagem distinta de link inválido e recuperação | passou | passou | passou |
| Sem aviso de nova versão durante os ensaios | confirmado | confirmado | confirmado |

Revisões e falhas foram simuladas por controles locais de QA; os dados oficiais e o banco não foram alterados. JSONs sync-* guardam câmera e ciclo de vida antes/depois. Revisão de código foi simulada com nova entrada de script: houve recarga real e a câmera restaurada coincide com o snapshot salvo (precisão 0,0001), sem segunda recarga durante o acompanhamento. O gesto ainda estava amortecendo antes da simulação; por isso o snapshot salvo é a referência de comparação, não a captura anterior ao término do gesto. A restauração agora preserva a navegação manual e não consome armazenamento durante renderizações React que podem ser repetidas.

Repouso industrial após hidratação: presentedFrames permaneceu em 180 entre as amostras de idle-industria.json. O polling não mantém renderização contínua. Entrada/saída de escopo, eventos sem duplicação, erro de importação/consulta e cancelamento contam também com testes focados; falha física de GPU/importação quebrada e pan por botão direito e gestos de pinça em telefone real não foram certificados na UI automatizada. Os limites/gestos continuam no OrbitControls existente. O retorno real de aba foi exercitado nos três segmentos: mapa disponível, um Canvas e nenhuma recarga. A troca de aba da ferramenta alterou o viewport do painel em algumas execuções; por isso esses registros não são usados para comparar FPS nem para afirmar invariância da câmera durante redimensionamento.

Sete pavilhões abriram os interiores originais e permitiram consultar/fechar duas fichas distintas, mantendo um Canvas e sem perda de contexto: P1 (189 lotes), P3 (214), P5 (81), P8 (114), P12 (257), P13 (103), P14 (186). Ver pavilion-regression.json e capturas pavilhao-*-desktop.png. A regressão autenticada do administrador e Modo Vendas está descrita acima; os dois portais de comissão com falha preexistente não são considerados aprovados.

## Capturas finais

| Segmento | Desktop | Mobile (390 × 844) |
|---|---|---|
| Exporural | [imagem](candidate-exporural-desktop.png) | [imagem](candidate-exporural-mobile.png) |
| Indústria, Comércio e Serviços externo | [imagem](candidate-industria-desktop.png) | [imagem](candidate-industria-mobile.png) |
| Espaço do Automóvel | [imagem](candidate-automovel-desktop.png) | [imagem](candidate-automovel-mobile.png) |

[Ficha mobile expandida Exporural](candidate-exporural-mobile-expanded.png) e [ficha industrial](candidate-industria-mobile-expanded.png). Capturas diretas do navegador, sem edição. Controles de QA, quando visíveis em ensaios de falha/sincronização, não fazem parte da aplicação publicada.

## Estado de entrega

Implementação pronta para revisão em PR, sem troca de endereços, tokens, dados comerciais ou geometria cadastrada. Build, typecheck, lint focal, 37 testes públicos e independência dos chunks verificados; a suíte ampla mantém falhas reproduzidas na base. Migração SQL incluída para revisão/aplicação pelo fluxo do projeto, ainda não executada em produção nem validada em uma instância PostgreSQL local. A publicação da PR não equivale a deploy. Metas pendentes: primeiro acesso sempre abaixo de 5 s, ensaio em telefone físico e certificação de memória em sessão longa, além da regressão dos dois portais bloqueada pelo erro existente.

Ensaios adicionais: a base Exporural em 1366 × 900 teve 49,7 FPS e p95 de 24,2 ms (navigation-baseline-exporural-desktop.json). A candidata apresentou ~60 FPS nas amostras; diferenças de trajetória/enquadramento impedem atribuir um percentual causal de ganho de FPS a esse par isolado. Na lista da base, a ficha foi rápida (13–35 ms), mas alternar Lista/Mapa criou um segundo Canvas; a candidata mantém o mesmo. O objetivo de seleção foi atendido em ambas, sem alegação de redução de latência.

No ensaio adicional de 24 seleções do Automóvel após aquecimento, as duas amostras permaneceram em 282 geometrias, 40 texturas, 112 programas e um Canvas. O heap caiu de 555 para 454 MB com GC natural (selection-plateau-automovel.json, viewport 1366 × 1227). Isso confirma estabilidade dos recursos nesse percurso, sem substituir um teste prolongado em telefone físico.

Precisão temporal: a série measured registra a primeira apresentação confirmada pelo renderer. A camada de preparação React é retirada pelo monitor de saúde no próximo evento/poll (intervalo de até 500 ms quando o thread está livre). Portanto, os tempos não certificam sozinhos a disponibilidade completa da UI em menos de cinco segundos. As capturas de entrega foram conferidas com a camada de preparação ausente; o tamanho efetivo de captura do painel pode variar do viewport dos ensaios.
