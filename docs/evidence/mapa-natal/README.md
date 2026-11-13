# Validação do Modo Natal

A captura usa a página do Mapa Comercial com o inventário oficial de referência de 2026, pela rota local de diagnóstico. A cena, o canvas, a legenda, os controles, o movimento e os materiais são os da aplicação. O ensaio de Vendas usa os registros sintéticos do PostgreSQL local pelo fixture de Gastronomia. O dispositivo foi um Mac Apple M5 com 16 GB, macOS 26.6 e Chrome headless 157.0.8103.51 com ANGLE Metal. O celular foi emulado no Chrome, com toque, viewport de 390 × 844 e DPR de dispositivo 2. No desktop, a viewport foi 1440 × 900 com DPR 1.

As medições usam chamadas completas de renderização do Three.js e a instrumentação no loop do R3F. Nos trechos estáticos, o ensaio pede quadros por uma janela curta para comparar a origem antes e depois da passagem. Também mede a câmera do plano principal com o conjunto de Natal já removido. O tempo CPU cobre a preparação e a submissão do quadro. O intervalo entre quadros também inclui a cadência do navegador. A gravação em vídeo é feita em outra execução.

O ensaio de aba oculta injeta os valores de visibilidade do documento e dispara o evento correspondente. O cenário de perda de contexto usa a extensão real `WEBGL_lose_context`. A medição de oito segundos começa no primeiro quadro do voo e termina na transição para a saudação.

## Evidências

- [Passagem no desktop, iluminação padrão](desktop-dia.mp4)
- [Passagem no celular, Modo Noturno](celular-noite.mp4)
- [Saudação no celular](saudacao-celular.png)
- [Quadro do voo no desktop](desktop-dia-voo.jpg) e [quadro do voo no celular](celular-noite-voo.jpg)
- [Medições e checagens do navegador](medicoes.json)

## Medições

Cada célula traz a mediana do intervalo entre quadros em milissegundos e a mediana de draw calls. A coluna de câmera equivalente usa a posição do plano principal por volta de 3,2 segundos. A travessia continua em movimento nessa janela, o que altera ligeiramente as geometrias no enquadramento.

| Viewport e iluminação | Antes | Em voo | Depois | Câmera equivalente sem voo → em voo | Voo visível |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop padrão · HIGH | 31,4 ms / 844 | 16,6 ms / 432 | 22,2 ms / 863 | 17,1 ms / 453 → 18,7 ms / 470 | 8014,8 ms |
| Desktop noturno · HIGH | 29,9 ms / 860 | 16,6 ms / 448 | 28,8 ms / 879 | 17,4 ms / 466 → 16,6 ms / 477 | 8014,8 ms |
| Celular padrão · LOW | 16,5 ms / 832 | 16,6 ms / 309 | 16,7 ms / 832 | 16,5 ms / 294 → 16,7 ms / 322 | 8017,6 ms |
| Celular noturno · LOW | 17,1 ms / 848 | 16,7 ms / 316 | 16,5 ms / 848 | 16,4 ms / 301 → 16,3 ms / 330 | 8016,9 ms |

O panorama inicial inclui mais geometrias e o retorno mantém os efeitos próprios do mapa. A comparação de custo do Natal usa a coluna de câmera equivalente. Havia outros processos ativos no host durante a coleta. A medição de CPU e os percentis de cada janela constam no JSON.

## Interrupções e regressão

A câmera restaurou a vista superior, a visão geral e a aproximação do lote Q-R-01. Escape e Pular preservaram seleção e filtro comercial. O replay com 2.101,1 ms de aba oculta registrou 8.016,8 ms visíveis. A perda e a recuperação do contexto WebGL e a saída de rota encerraram a sessão. A preferência de movimento reduzido, a falha induzida no carregamento e a indisponibilidade de WebGL abriram a saudação. A tabela permaneceu acessível no desktop e no celular sem WebGL. No fixture de Vendas, o Natal ficou indisponível com o carrinho ativo e o lote pôde ser adicionado até a abertura do checkout.

## Como reproduzir

Suba o Vite em `127.0.0.1:5187` com `npm run dev -- --mode qa --host 127.0.0.1 --port 5187`. Rode `node scripts/mapa-natal/browser.cjs` com Playwright e FFmpeg no ambiente. `PLAYWRIGHT_MODULE` e `FFMPEG` aceitam caminhos explícitos. Para a checagem opcional de checkout em banco sintético, execute o fixture existente com `npm run dev -- --config scripts/gastronomy/review.vite.config.ts` e passe a URL local em `CHRISTMAS_SALES_QA_URL`.

A validação de Vendas termina ao abrir o checkout e preserva os registros do fixture. O ensaio cobre o navegador e os perfis descritos. Aparelho móvel físico e ambiente autenticado de produção ficaram fora da execução.
