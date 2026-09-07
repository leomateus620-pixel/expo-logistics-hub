# Upgrade arquitetônico do entorno

Base: `ca16aa57` (PR #133). Branch: `codex/exterior-architectural-upgrade`.

## Implantação preservada

O inventário inicial registra **614 construções**, **1.509 árvores territoriais**, todos os polígonos de ocupação e os três açudes, e toda a rede viária unificada. Centros, orientações, dimensões, identificadores, caminhos, larguras, acostamentos e vínculos permanecem idênticos. `implantation-baseline.json` também contém hashes SHA-256 dos buffers da geometria viária e os dados completos do bairro lateral. O teste compara esses dados com a execução atual; o refinamento dos polígonos mantém área, limites e elevação.

A mudança atua na apresentação de `TerritorialEnvironment`. O bairro lateral existente e os modelos internos do parque permanecem intactos. Não altera a câmera inicial, os limites comerciais, dados cadastrais, filtros, permissões ou seleção. Os 28 modelos elegíveis substituem os volumes já presentes: **20 casas, 6 casas rurais e 2 galpões**, distribuídos por hash do identificador. Nenhuma ocupação foi acrescentada para utilizar os 50 modelos.

As imagens IMG_0452, IMG_0451 e IMG_0450 orientaram o diagnóstico da diferença de acabamento. Elas não documentam fachadas individuais: as arquiteturas são interpretações plausíveis, não reproduções cadastrais ou levantamentos em campo.

## Implementação

- Catálogo de 50 receitas com plantas retangulares, L, T, U, escalonadas e de duas alas; coberturas de duas/quatro águas, uma água, platibanda, shed e curva. Os testes verificam 50 geometrias distintas, independentemente de cor, nos três níveis de detalhe.
- Geometria modular unificada por modelo, instâncias por célula/modelo e um material arquitetônico PBR compartilhado. As propriedades de cerâmica, metal, fibrocimento, reboco, tijolo, madeira, concreto e vidro são atributos dos vértices. Esquadrias, peitoris, calhas, pilares, garagens, sacadas e chaminés seletivas aparecem conforme a aproximação.
- LOD por tamanho projetado com histerese. A vista distante reúne a arquitetura por célula, preservando telhados e volumes; detalhe próximo permanece residente para evitar reconstrução durante gestos. Vegetação tem três silhuetas, volumes assimétricos, ramificação próxima e geometria opaca em todos os níveis. As árvores não são retiradas por redução de qualidade.
- Terreno plano com mistura de padrões por uso, variação ampla e intermediária, linhas de cultivo e bordas suavizadas na cor. Os recortes existentes de ruas e polígonos continuam sendo usados. Arbustos ficam dentro dos quintais; vegetação baixa das margens evita os assentos, construções e vias.
- Os três açudes compartilham um material físico com IOR 1,333, resposta de Fresnel, borda de solo úmido e ondulação discreta de normais. A reflexão aproxima o céu pelo **mapa de ambiente já existente na cena**; não reflete dinamicamente prédios ou árvores e não adiciona passes de renderização. O relevo e o nível da água não mudam. As ondulações atualizam durante os frames já solicitados pelo mapa, sem manter a GPU ativa em repouso.
- Exatamente cinco pescadores sentados: dois no açude longo, dois no arredondado e um no quadrangular. Escala de 0,15 unidade/m, roupas discretas, cadeira, vara, linha e boia. Testes verificam assentos fora da água e das vias e boias dentro do açude associado.
- Decoração excluída do raycasting comercial; sombras seletivas próximas; geometrias e materiais compartilhados descartados pelo proprietário. Testes alternam LOD, qualidade e visibilidade sem perder construções/árvores ou reconstruir recursos.

## Catálogo e imagens

[Catálogo detalhado](exterior-architecture-catalog.md) · [50 modelos](screenshots/exterior-upgrade/catalog.png) · [Associações por identificador](screenshots/exterior-upgrade/model-assignments.json)

| Enquadramento | Antes | Depois |
|---|---|---|
| Visão geral | [antes](screenshots/exterior-upgrade/before-overview.png) | [depois](screenshots/exterior-upgrade/after-overview.png) |
| Bairro intermediário | [antes](screenshots/exterior-upgrade/before-neighbourhood.png) | [depois](screenshots/exterior-upgrade/after-neighbourhood.png) |
| Casas próximas | [antes](screenshots/exterior-upgrade/before-houses.png) | [depois](screenshots/exterior-upgrade/after-houses.png) |
| Galpões | [antes](screenshots/exterior-upgrade/before-sheds.png) | [depois](screenshots/exterior-upgrade/after-sheds.png) |
| Área rural | [antes](screenshots/exterior-upgrade/before-rural.png) | [depois](screenshots/exterior-upgrade/after-rural.png) |
| Vegetação | [antes](screenshots/exterior-upgrade/before-vegetation.png) | [depois](screenshots/exterior-upgrade/after-vegetation.png) |
| Água e terreno | [antes](screenshots/exterior-upgrade/before-water.png) | [depois](screenshots/exterior-upgrade/after-water.png) |
| Visão móvel | [antes](screenshots/exterior-upgrade/before-mobile-overview.png) | [depois](screenshots/exterior-upgrade/after-mobile-overview.png) |

Aproximações: [pescador 1](screenshots/exterior-upgrade/detail-fisher-1.png), [2](screenshots/exterior-upgrade/detail-fisher-2.png), [3](screenshots/exterior-upgrade/detail-fisher-3.png), [4](screenshots/exterior-upgrade/detail-fisher-4.png), [5](screenshots/exterior-upgrade/detail-fisher-5.png).

## Medições comparáveis

Chrome headless acelerado, Intel UHD / ANGLE D3D11; qualidade HIGH e DPR efetivo 0,72 em todas as linhas. Buffer desktop 972×500 e móvel 270×490. Mesma câmera e movimento oscilatório do diagnóstico, 6 s úteis após 0,8 s de aquecimento por janela; contextos visíveis e focados. O viewport móvel roda no mesmo computador.

| Dispositivo / vista | Frame médio antes → depois (ms) | p95 antes → depois (ms) | Calls antes → depois | Triângulos antes → depois |
|---|---:|---:|---:|---:|
| desktop / overview | 18.95 → 17.80 | 22.60 → 22.50 | 888 → 835 | 635069 → 694985 |
| desktop / neighbourhood | 16.67 → 16.67 | 16.90 → 16.80 | 95 → 123 | 388372 → 597968 |
| desktop / water | 16.67 → 16.67 | 16.90 → 16.90 | 161 → 183 | 442719 → 667977 |
| mobile / overview | 16.71 → 16.85 | 17.20 → 18.20 | 738 → 721 | 533792 → 599408 |
| mobile / neighbourhood | 16.67 → 16.67 | 16.80 → 16.80 | 83 → 100 | 383160 → 548740 |
| mobile / water | 16.67 → 16.67 | 16.80 → 16.80 | 81 → 88 | 338853 → 527921 |

| Recursos na vista geral | Desktop antes → depois | Móvel antes → depois |
|---|---:|---:|
| geometries | 535 → 625 | 535 → 602 |
| textures | 145 → 145 | 145 → 145 |
| programs | 165 → 175 | 165 → 175 |
| heapBytes | 113.9 → 139.9 MiB | 116.0 → 142.3 MiB |

As novas geometrias e atributos aumentam a memória residente; nenhuma textura nova é carregada pelo upgrade. O número de geometrias observado depende de quais LODs já foram visitados. A contagem aquecida é verificada separadamente nos ciclos de navegação. Heap é uma amostra sujeita ao garbage collector.

A primeira janela de diagnóstico da base registrou 17,13 ms médios, e a repetição final acima registrou 18,95 ms. Portanto, a diferença temporal entre execuções não deve ser tratada como aceleração garantida. A redução de draw calls na vista geral é estrutural (888 → 835); a arquitetura próxima e a vegetação aumentam triângulos. Não se afirma ausência de custo nem 60 FPS contínuos.

A comparação de câmeras, buffer, DPR, qualidade e GPU é validada em `performance-comparison.json`. As versões iniciais com qualidade desigual foram substituídas por esta comparação HIGH/HIGH após isolar os caches Vite.

## Verificações estáticas

TypeScript (`tsc --noEmit -p tsconfig.app.json`), ESLint dos arquivos novos/alterados e build de produção passaram. **174 testes focados passaram** em 16 arquivos: preservação, catálogo, recursos/LOD, reconstrução territorial, qualidade adaptativa, viewport, câmera, painel contextual, seleção, histórias, segmentos, árvores e pós-processamento. O build conserva o aviso de chunks grandes já existente. Não foi declarada aprovação da suíte completa do repositório.

## Estabilidade e integração funcional

Os fluxos desktop e responsivos passaram em navegação por arraste/zoom, abertura e alternância de filtros, seleção B10, entrada no Pavilhão 7 e retorno ao mapa. Todos os snapshots mantiveram um canvas e estado `ready`, zero perdas de contexto, zero erros e nenhuma mutação ao backend sintético. Retrato 390×844 e paisagem 844×390 ficaram sem overflow horizontal.

**80 transições passaram**: 20 ciclos de hidrologia e 20 de qualidade, ida/volta. Após aquecimento, todas as quatro configurações mantiveram contagens estáveis. Foram verificados `status`, `path`, `presentedFrames`, `contextLosses` e `lastErrorCode` em cada transição.

| Configuração | Geometrias | Texturas | Programas |
|---|---:|---:|---:|
| hydrology / True | 609 → 609 | 147 → 147 | 193 → 193 |
| hydrology / False | 610 → 610 | 147 → 147 | 193 → 193 |
| quality / True | 579 → 579 | 136 → 136 | 188 → 188 |
| quality / False | 601 → 601 | 149 → 149 | 192 → 192 |

[Telemetria das 80 transições](screenshots/exterior-upgrade/stress.json) · [Fluxo desktop](screenshots/exterior-upgrade/functional-desktop.json) · [Fluxo móvel](screenshots/exterior-upgrade/functional-mobile.json)

O primeiro ensaio da página autenticada falhou antes do Canvas com erro de inicialização do React enquanto os servidores compartilhavam um cache de pré-bundle. A instalação/cache foi isolada por checkout e os fluxos completos foram repetidos com sucesso. Isso não exigiu alteração no produto.

A sequência adicional de 12 mudanças de enquadramento (visão geral, casas próximas, água e afastamento) passou. Após duas voltas de aquecimento, a terceira manteve **623 geometrias, 145 texturas e 175 programas**, sem erros ou perda de contexto. [Telemetria de navegação e zoom](screenshots/exterior-upgrade/navigation-stress.json). O heap amostrado variou de 135,2 para 136,2 MiB; isso não é uma prova de estabilidade de heap por horas de uso.

## Reprodução

Instale as dependências de cada checkout separadamente para não compartilhar o cache de pré-bundle Vite entre servidores. Execute Vite com portas distintas, por exemplo 4186 (depois) e 4187 (base).

- `PLAYWRIGHT_MODULE`: caminho da instalação de Playwright; os scripts usam Chrome instalado com WebGL.
- `QA_URL`: endereço do servidor.
- `node scripts/exterior/capture.cjs before|after [--mobile]`: mesmas câmeras, capturas e três janelas de medição de navegação.
- `node scripts/exterior/capture.cjs detail --fishers`: cinco aproximações individuais.
- `node scripts/exterior/catalog.cjs`: prancha dos 50 modelos.
- `node scripts/exterior/functional.cjs exterior URL/mapa-comercial [--mobile]`: autenticação e backend sintéticos, sem gravações externas.
- `node scripts/exterior/stress.cjs`: 80 alternâncias de hidrologia/qualidade.
- `node scripts/exterior/navigation-stress.cjs`: três voltas pelas mesmas quatro câmeras e comparação dos recursos aquecidos.
- `EXPORT_EXTERIOR_REPORT=1` com o teste do catálogo exporta inventário, usos e pescadores. `RECORD_EXTERIOR_BASELINE=1` é apenas para registrar uma nova base aprovada; não use para aprovar uma regressão espacial.

## Limites da evidência

Chrome headless acelerado em Windows, Intel UHD Graphics via ANGLE/D3D11. Viewports desktop 1366×768 e móvel 390×844, além de paisagem 844×390 no fluxo funcional. **Nenhum telefone físico ou Safari/iOS foi usado.** Essas medidas não certificam GPUs móveis, multitouch físico nem 60 FPS contínuos. A telemetria de memória informa contagem de recursos GPU e heap JavaScript amostrado; não representa bytes de VRAM. As capturas de pescadores utilizam a câmera de diagnóstico para inspecionar detalhes menores do que o zoom comercial habitual.
