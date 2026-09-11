# Evidências da intervenção de desempenho

Leia o [diagnóstico e as limitações](../../commercial-map-systemic-performance.md) antes de interpretar os números.

- `comparison.json`: resumo reproduzível por `scripts/commercial-map-performance/summarize.cjs`.
- `baseline-bundle.json` / `after-bundle.json`: grafo estático do build normal; bytes de arquivo e soma gzip, não tráfego comercial.
- `baseline-iab-load-{1,2,3}.json` / `after-final-load-{1,2,3}.json`: três reloads por versão no mesmo viewport. Caches não controlados; fixture sem autenticação/rede comercial.
- `baseline-iab-lighting.json` / `after-final-lighting.json`: 20 ciclos completos, 40 transições por versão, em primeiro plano. Arquivos finais usados na comparação.
- `baseline-*-final.jpg` / `after-*-final.jpg` e `*-visual-state.json`: dia/noite assentados, mesmo enquadramento.
- `*-interactions.webm` / `*-video-frames.jpg`: gravações ilustrativas e frames extraídos. Excluídas de FPS; instantes dos cliques diferentes, captura a 15 FPS.
- `functional-renderer.json`, `functional-interface.json`, `after-interior.jpg`, `after-mobile-*.jpg`: ensaios de contexto, hidrologia, zoom, painel, interior, segmento e viewport. Viewport móvel não é aparelho físico.
- `regressions.json`: resultado dirigido final 109/110, com a falha preexistente de comissão.
- `baseline-known-failures.json`, `baseline-commission-failure.json`: reprodução das onze falhas preexistentes; não corrigidas adulterando estruturas ou inventário.
- `broad-regressions.json`: rodada ampla anterior, 1.049/1.061. Duas expectativas de overlays foram corrigidas e verificadas na rodada dirigida final.
- `build.txt`, `lint.txt`, `dependencies-before.txt`, `dependencies-final.txt`: evidências das verificações e do lock.

## Rodadas intermediárias, excluídas do resultado final

`after-lighting-before-replay-guard.json` detectou o replay encerrado cedo em delta zero; a correção final tem teste dedicado. `baseline-lighting.json` sofreu throttling e não mede FPS em primeiro plano. `baseline-lighting-run2.json` e `baseline-load-1.json` vieram de uma rodada anterior no Chrome, sem anotação de foco por frame. `after-iab-load-*.json` são builds/condições intermediários. Imagens antigas `after-day.png`, `baseline-day.png`, `baseline-day-run2.png`, `baseline-iab-day.jpg` têm viewport ou instante de captura diferentes e não são os pares finais. Nenhum desses arquivos foi reescrito para aparentar melhoria.

Dados comerciais do banco, credenciais e tokens não foram capturados nestes artefatos. O inventário de fixture não deve ser apresentado como situação comercial confirmada.
