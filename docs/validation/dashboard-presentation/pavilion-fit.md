# Plantas da Dashboard: enquadramento e evidência visual

Comparação local em 05/10/2026 entre a main `8d7fe60dc3f3555dafcad9a81928b97241115c2a` e a implementação desta entrega. Foram capturados e inspecionados os pavilhões existentes 1, 3, 5, 7, 8, 12, 13 e 14 em desktop 1920×1080, notebook 1366×768 e mobile 390×844, antes e depois: 24 comparações com 48 capturas de plantas, além de capturas integrais da interface. DPR 1, Chrome headless, tokens globais completos e fontes Manrope/Sora declaradas pelo aplicativo, servidas por cache local no teste. A recaptura final com os tokens de `main.tsx` terminou com saída 0 nas duas fases e confirmou as mesmas dimensões, fontes, contagens e hashes geométricos.

## Enquadramento implementado

O componente continua sendo a planta SVG existente, com `xMidYMid meet`. O envelope de apresentação considera os módulos carregados, o contorno interno oficial e os apoios permanentes; o cálculo inclui quaisquer módulos carregados que ultrapassem o envelope oficial, evitando esconder registros. Os polígonos, posições, números oficiais e associações de acessos permanecem intactos.

O Pavilhão 1 conserva sua referência de contorno e a meta tipográfica de 14 px. Nos demais, a projeção da planta interna utiliza o mesmo referencial físico dos módulos. Os helpers oficiais, incluindo `projectCommercialPavilionOfficialContentEnvelope`, são usados quando compatíveis com a definição. Os líderes dos acessos continuam partindo das posições oficiais e usam decoração local curta, em vez de impor o limite externo completo como destino. Os símbolos e seus líderes entram na margem de enquadramento. Somente os rótulos dos apoios escolhem uma faixa livre dentro de cada sala para evitar colisão com os símbolos de acesso.

A altura da planta considera a proporção útil, a largura real do contêiner e a altura disponível. Uma mudança real de tamanho ou pavilhão aplica o ajuste inicial; atualizações de status comercial preservam a seleção, o zoom e o deslocamento. Pequenas oscilações de tamanho abaixo de 2 px não reiniciam a inspeção. “Ajustar ao espaço” continua recalculando o enquadramento atual.

## Pavilhão 8

O salão oficial de 21,70×35 m e os três apoios permanentes ao norte permanecem incluídos. O perímetro externo e sua extensão vazia deixaram de determinar o envelope da planta comercial. A orientação projetada é a mesma: os apoios ao norte da referência oficial aparecem na extremidade inferior do SVG, sem girar ou deslocar os módulos para mudar essa orientação.

As medidas abaixo são pixels CSS reais do navegador no ajuste inicial. A fonte efetiva foi medida pelo tamanho calculado do texto e pela matriz de transformação SVG; o tamanho do conjunto de módulos é o envelope dos polígonos renderizados.

| Tela | Altura do painel antes → depois | Fonte mínima antes → depois | Conjunto de módulos antes → depois |
| --- | ---: | ---: | ---: |
| Desktop | 722 → 758 px | 4,44 → 10,97 px | 188,66×295,60 → 345,11×540,72 px |
| Notebook | 316 → 640 px | 1,94 → 10,97 px | 82,60×129,42 → 291,38×456,55 px |
| Mobile | 403 → 544 px | 2,48 → 9,91 px | 105,41×165,16 → 247,37×387,58 px |

O Pavilhão 8 mantém 114 módulos e cinco acessos em cada cenário. Os três apoios, anteriormente sem contorno próprio na Dashboard, aparecem como informação permanente não comercial. Nenhum deles se torna lote ou recebe situação de venda. O hash das referências, números e polígonos da fixture é igual antes/depois nos três tamanhos: `6e8f681b007f230cca6f4302e0f47a3394a27cf71381ad16fa04987d2bf2cff5`.

| Tela | Antes | Depois |
| --- | --- | --- |
| Desktop | [Planta](evidence/before-desktop-pavilion-8-plant.png) | [Planta](evidence/after-desktop-pavilion-8-plant.png) |
| Notebook | [Planta](evidence/before-notebook-pavilion-8-plant.png) | [Planta](evidence/after-notebook-pavilion-8-plant.png) |
| Mobile | [Planta](evidence/before-mobile-pavilion-8-plant.png) | [Planta](evidence/after-mobile-pavilion-8-plant.png) |

## Tamanho efetivo mínimo dos números após a alteração

| Pavilhão | Desktop | Notebook | Mobile |
| --- | ---: | ---: | ---: |
| 1 | 14,0 px | 11,6 px | 3,6 px |
| 3 | 8,3 px | 6,7 px | 5,6 px |
| 5 | 11,0 px | 10,8 px | 9,6 px |
| 7 | 11,0 px | 10,9 px | 10,9 px |
| 8 | 11,0 px | 11,0 px | 9,9 px |
| 12 | 11,0 px | 11,0 px | 4,2 px |
| 13 | 11,0 px | 11,0 px | 10,9 px |
| 14 | 11,0 px | 11,0 px | 6,6 px |

Limite observado: a visão integral de plantas densas no celular ainda tem números pequenos, sobretudo no Pavilhão 1 (3,6 px) e no 12 (4,2 px). No 3, a fonte mínima é 5,6 px no celular e 6,7 px no notebook. A planta integral, contornos e acessos ficam enquadrados; a leitura individual desses módulos requer o zoom ou o seletor acessível existentes. Não há comprovação de legibilidade de todos os números no ajuste inicial. O limite tipográfico respeita a área de cada módulo e evita ampliar indiscriminadamente textos até sobrepor células vizinhas.

Na inspeção visual, o Pavilhão 1 conservou a composição horizontal de referência; os pavilhões verticais passaram a aproveitar a altura útil. As quatro salas de apoio do 5 e as duas do 7 também aparecem com contornos próprios. A numeração do 13 continua sendo a oficial, incluindo 104 e as geometrias irregulares 25, 26, 79 e 80, sem derivá-la dos IDs técnicos.

## Verificações e reprodução

O navegador validou em todos os 24 cenários finais: todos os módulos, contornos pertinentes, apoios e símbolos de acesso contidos no SVG; proporções `meet`; ausência de rolagem interna no ajuste inicial; mesmos IDs, números e hash de polígonos antes/depois; nenhum rótulo de apoio intersectando símbolos de acesso. Também verificou zoom, seleção, atualização comercial local sem perda de zoom/seleção, ajuste explícito e novo enquadramento após resize. A troca de pavilhão retorna ao ajuste inicial. Os relatórios registram zero erros JavaScript e zero requisições ao backend.

Relatórios completos: [antes desktop](evidence/before-desktop.json), [depois desktop](evidence/after-desktop.json), [antes notebook](evidence/before-notebook.json), [depois notebook](evidence/after-notebook.json), [antes mobile](evidence/before-mobile.json), [depois mobile](evidence/after-mobile.json). As capturas de todos os pavilhões estão em `evidence/{before|after}-{desktop|notebook|mobile}-pavilion-{n}{-plant}.png`.

Os testes focados passaram: **26 testes, dois arquivos**, em 05/10/2026 às 18:43:16, duração 4,98 s. [Log preservado](pavilion-tests.log).

```powershell
npm run test -- src/test/commercialDashboardMiniMap.test.tsx src/test/commercialDashboardScopes.test.ts --maxWorkers=2
```

ESLint dos quatro arquivos de componente/geometria e dos dois arquivos de teste passou sem erros. Os testes cobrem envelopes e apoios oficiais, Pavilhão 1, preservação de identidade/geometria, textos limitados em pixels e resize pequeno. Build e verificações integradas estão registrados no relatório geral desta entrega.

O harness de captura está em `scripts/dashboard/presentation-browser.cjs`, com a configuração isolada `presentation.vite.config.ts` e a composição React `presentation-qa.tsx`. Ele monta o componente real da Dashboard com `OFFICIAL_REFERENCE_DATA`, sem a cena Three.js, sem uma sessão autenticada e sem chamadas ao Supabase. A rota HTML é interceptada exclusivamente pelo teste; nenhuma rota do aplicativo foi criada. A fixture oficial traz seus próprios estados de inventário, e suas cores não representam o estado comercial de produção. Portanto, essas capturas comprovam apresentação e geometria local, e não permissões reais, conectividade da sessão, operação comercial ou funcionamento remoto do mapa principal.

Arquivos de produção alterados nesta parte: `CommercialDashboardPavilion.tsx`, `CommercialMiniMap.tsx`, `commercialDashboardPavilionGeometry.ts`, `commercialDashboardGeometry.ts` e as regras específicas de planta em `commercial-dashboard.css`, todos dentro de `src/features/commercial-map/dashboard`. Nenhuma câmera, FOV, geometria persistida ou configuração do Supabase foi alterada.
