# Evidência do piloto de vegetação

[Relatório técnico](../../commercial-map-vegetation-pilot.md) · [Comparador HTML](index.html) · [Medições](measurements.md).

No servidor local, abra `/docs/screenshots/vegetation-pilot/index.html` para usar os controles de comparação. No GitHub, as capturas podem ser abertas individualmente pela tabela do relatório técnico.

`before-*.json` e `after-*.json` registram as poses, métricas e estado do renderizador. `verification-*.json` registra zoom/modos e impressões SHA-256 das matrizes verificadas; a igualdade foi testada elemento a elemento antes de reduzir os artefatos. `functional-*.json` registra interações na rota comercial com fixture local. `stress.json` registra os ciclos de transição. `validation.json` resume os comandos e as falhas preexistentes.

As métricas são de Chrome acelerado em Windows, com viewports móveis emulados. A qualidade adaptativa original permaneceu ativa. Consulte as limitações no relatório antes de comparar FPS ou extrapolar para dispositivos físicos.
