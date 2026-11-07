# Validação do Memorial

Checks locais e evidências de 06/11/2026, em Windows com 8 GB de RAM. Capturas do navegador integrado são simulações de viewport; não são homologação em aparelhos físicos. Logs completos locais: `artifacts/memorial-*.log`.

## Código e acervo

| Verificação | Resultado observado |
| --- | --- |
| TypeScript | Aprovado (`npm run typecheck`) |
| Testes focados | 64/64, em seis arquivos; última passagem de 15,85 s |
| ESLint dos arquivos alterados | Zero erros; cinco avisos de hooks já existentes em `OrganizationalEcosystem.tsx` |
| Build de produção | Aprovado com `NODE_OPTIONS=--max-old-space-size=4096` |
| Fronteiras de carregamento | Portal sem Memorial na árvore estática; galeria sem visualizador, Three.js, física ou cenas do mapa na árvore estática |
| Originais e faces | 26 originais e suas associações/hashes verificados; comparações individuais com a face recomposta |
| Cronologia | 25 edições; 2012/2014 corretamente associados; documento de 2020 dentro de 2022; epílogo sem ordinal |
| Transcrições | 686 registros verificados; 11 nomes e quatro cargos com confirmação incompleta, sinalizados no inventário |

Uma execução do build atingiu o limite padrão de aproximadamente 2 GB do Node. A execução com 4 GB concluiu; esse limite também está na configuração do workflow do Memorial. Os avisos de chunks maiores que 500 kB pertencem ao build geral, incluindo módulos preexistentes. Não indicam, por si, o tráfego da galeria.

## Suíte geral

`npm test -- --maxWorkers=1` executou 506 arquivos/4.364 testes em 1.227,40 s: 452 arquivos e 4.269 testes passaram; 54 arquivos e 95 testes falharam. Essa passagem ocorreu durante o fechamento visual. Os três contratos de JSX/acesso ajustados e o hash da face de 2000 passaram na execução focada posterior. A suíte ampla não foi repetida integralmente.

As falhas remanescentes abrangem Mapa Comercial, Agenda, portal e contratos de dados. Por exemplo, testes do portal ainda esperam Administrador na posição 05, enquanto o cadastro existente já coloca Financeiro em 05 e Administrador em 06; há também expectativas antigas de inventário do mapa e comparação de bytes sensível a CRLF. Não foram alterados esses módulos ou seus dados para obter sinal verde. O detalhamento está em [check-results.json](check-results.json). Os 64 testes focados não tornam a suíte geral verde.

## Fluxos observados

| Cenário | Evidência/resultados |
| --- | --- |
| Ecossistema → ícone → linha → quadro → linha → Ecossistema | Mesmo pathname; links por parâmetros; foco no quadro e no atalho de retorno |
| Organização pronta | Fixture de 37 estruturas: os sete controles, incluindo o Memorial, e a transformação da câmera permaneceram idênticos antes/depois |
| Teclado | Entrada com Enter, foco visível, abas e Escape; fechamento do detalhe preserva o diálogo do Ecossistema |
| Retorno desktop | 2004: scroll 2.045,614 px antes e depois; foco em `fenasoja-2004`; zero canvases na galeria |
| Retorno celular | 2018: scroll 9.332,456 px antes e depois; foco em `fenasoja-2018` |
| Final do percurso | Segmento de 50 px termina antes da face de 2028; em 680 px todos os marcadores ficam fora das faces e legendas |
| Mudança de orientação | 390 → 768 px: edição 2004 retorna visível, entre y=348 e y=708, com foco preservado |
| Histórico e link direto | Voltar/avançar reproduzem detalhe/linha; recarregar `/portal?...edicao=fenasoja-2014` mantém a edição |
| 2012/2014 | Cabeçalhos 19ª/20ª e legendas das fotos trocadas conferidos no navegador |
| Documento 2020 | Link sob 2022; modelo próprio; período e rodapé próprios disponíveis na transcrição |
| Epílogo 2028 | Composição própria, texto estático LOADING… e mensagem do próximo capítulo |
| Foto original | Imagem com largura real de 1.152 px e pan local; página sem overflow horizontal |
| Leitura a 320 px | Transcrição selecionável, abas com aproximadamente 85 px de largura, sem overflow horizontal |

O acesso anônimo real mostrou o estado de erro da consulta organizacional existente. O Memorial funcionou independentemente dessa consulta. As evidências da organização pronta usam uma fixture explicitamente identificada; não comprovam sessão autenticada ou dados operacionais remotos.

## Resiliência e movimento

Ausência de WebGL, perda real de contexto pela extensão `WEBGL_lose_context` e falha HTTP 503 da textura preservaram a vista frontal, as abas de foto/transcrição e a navegação. Após perda de contexto, **Tentar o 3D novamente** recuperou um único visualizador. Na rede simulada a 128 KiB/s + 500 ms, a inspeção de 1966 ficou pronta em 3.307 ms, com a prévia frontal disponível durante a espera.

Na fixture com movimento normal, o modelo encerrou a entrada frontalmente e permaneceu em 43 frames renderizados em duas observações separadas por 55,2 s. Não há loop contínuo em repouso. Com movimento reduzido, a pose foi frontal desde a preparação e o contador permaneceu em dois frames. Os atalhos modificados de navegador (Ctrl/Command/Alt) não são capturados pelo visualizador; a página mantém o viewport escalável e a superfície aceita `pan-y pinch-zoom`.

Os tempos registrados em [browser-observations.json](evidence/browser-observations.json) são amostras locais com cache misto/aquecido. `readyMs` mede a criação do renderizador até a textura ficar pronta, incluindo preparação do ambiente; não é uma métrica de abertura em cache frio ou de produção remota. Os arquivos próprios observados na galeria somaram 236.964 bytes (17 recursos, incluindo 12 miniaturas); com gzip calculado para JS/CSS, 175.343 bytes. O incremento nominal de abrir 2004 foi 1.591.930 bytes em cinco recursos, ou 731.864 bytes considerando gzip de JS/CSS. A amostra final do renderizador de 2004 ficou pronta em 423 ms, com textura de 1.118 × 1.536 px. A prébusca do navegador pode ampliar o conjunto de miniaturas após essa amostra. Esses pesos não são transferências em cache frio. Detalhes e metodologia estão em [runtime-weights.json](runtime-weights.json); tamanhos estáticos gzip estão em [bundle-audit.json](bundle-audit.json).

## Contraste e evidências

Cálculo sRGB dos pares usados: marfim/grafite 15,06:1; texto secundário/grafite 9,95:1; ouro/fundo quente 6,97:1; texto da aba ativa/ouro 8,86:1; inscrições/fundo da placa 9,74:1. São valores dos pares de cor especificados, não uma medição de cada pixel da textura.

Capturas principais: [desktop e curva](evidence/desktop-timeline-turn.jpg), [quadro no desktop](evidence/desktop-detail-2004.jpg), [galeria móvel](evidence/mobile-gallery.jpg), [quadro móvel](evidence/mobile-detail-2018.jpg), [transcrição](evidence/mobile-transcription-2018.jpg), [documento 2020](evidence/mobile-detail-document-2020.jpg), [epílogo](evidence/mobile-epilogue-2028.jpg), [fallback](evidence/mobile-fallback-no-webgl.jpg). As comparações de ambiente e os 26 pares foto/face estão em `evidence`.

## Limites

A alternância de abas na ferramenta manteve a continuidade visual, mas não confirmou suspensão nativa do documento em segundo plano. O listener de visibilidade foi conferido no código e nos checks de compilação.

Não foram executados testes físicos em Safari iOS, Chrome Android ou aparelho de baixo desempenho, nem homologação com NVDA/VoiceOver, gesto de pinça em hardware ou rede móvel real. Viewports, árvore de acessibilidade, teclado e limitação local de banda não substituem essas verificações. Esta entrega é uma PR; não comprova deploy, ativação remota ou correção das lacunas fotográficas.

Para reproduzir os cenários de diagnóstico, execute `npx vite --config scripts/memorial/qa.vite.config.ts` e abra `scripts/memorial/qa.html` com `ecossistema=memorial&edicao=fenasoja-1966`, acrescentando `webgl=off`, `media=fail`, `media=slow`, `motion=reduce` ou `motion=full`. O controle **QA · validação** contém a simulação de perda de contexto e não integra a aplicação publicada.
