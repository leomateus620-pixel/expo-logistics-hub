# Todos os interiores navegáveis

Os componentes de interior registrados abrangem oito plantas comerciais e três ambientes arquitetônicos. Cada prancha usa a mesma câmera nas duas colunas. A linha superior mostra a entrada e a inferior aproxima a câmera. Toque na imagem para ampliá-la.

As oito plantas internas da fixture de abertura chegam com todos os módulos bloqueados. Para esta galeria, o contexto de laboratório distribui quatro estados sobre lotes existentes e verifica o retorno de cada identificador. As cores são demonstrativas. O número, o formato e o identificador cadastral de cada módulo vêm da mesma implantação nas duas revisões. A soma e os resumos SHA-256 de geometria, numeração e estados estão nos manifestos. Os três interiores arquitetônicos permitem inspecionar a construção sem módulos comerciais.

| Pavilhão ou ambiente | Módulos | Detalhe ampliado | Comparação |
| --- | ---: | --- | --- |
| Pavilhão 1 — Indústria, Comércio e Serviços (B1) | 189 | Reprodução da área do módulo 95 | [Base e Natural quente](B1.webp) |
| Pavilhão 14 — Artesanato e Comércio (B2) | 186 | Canto da ilha central junto ao módulo 94 | [Base e Natural quente](B2.webp) |
| Pavilhão 12 — Indústria, Comércio e Serviços (B3) | 257 | Reprodução da área do módulo 129 | [Base e Natural quente](B3.webp) |
| Pavilhão 8 — Indústria, Comércio e Serviços (B4) | 114 | Reprodução da área do módulo 58 | [Base e Natural quente](B4.webp) |
| Pavilhão 13 — Indústria e Comércio (B5) | 104 | Reprodução da área do módulo 53 | [Base e Natural quente](B5.webp) |
| Pavilhão 3 — Indústria e Comércio (B6) | 214 | Contorno em L do módulo 36 | [Base e Natural quente](B6.webp) |
| Pavilhão 5: Floriculturas (B8) | 81 | Reprodução da área do módulo 41 | [Base e Natural quente](B8.webp) |
| Pavilhão 7 — Agricultura Familiar / Agroindústrias (B10) | 57 | Reprodução da área do módulo 29 | [Base e Natural quente](B10.webp) |
| Pavilhões 6, 10 e 11 — Pecuária (B9) | 0 | Acabamento e estrutura | [Base e Natural quente](B9.webp) |
| Espaço Mirante (D3) | 0 | Acabamento e estrutura | [Base e Natural quente](D3.webp) |
| Sede Fenasoja / Comissão Central (B12) | 0 | Acabamento e estrutura | [Base e Natural quente](B12.webp) |

[Câmeras e fixture da base](base.json) · [Câmeras e fixture da candidata](candidata.json)

O diagnóstico observa a primeira requisição do acabamento de concreto ao entrar no primeiro pavilhão comercial. O manifesto enumera o ativo e os materiais que o receberam. Alternar entre os outros sete pavilhões reaproveita o mesmo recurso.

Execução da galeria a partir dos builds de produção com fixture comercial. Os dois comandos usam perfis de navegador limpos e sem backend de produção.

```sh
PARK_URL=http://127.0.0.1:4243 PARK_PROFILE=classic PARK_OUTPUT=/tmp/base-interna \
node scripts/commercial-map-performance/park-interiors.cjs

PARK_URL=http://127.0.0.1:4244 PARK_PROFILE=warm-natural PARK_OUTPUT=/tmp/candidata-interna \
INTERIOR_CAMERAS=/tmp/base-interna/interiores.json node scripts/commercial-map-performance/park-interiors.cjs
```
