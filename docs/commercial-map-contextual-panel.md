# Painel contextual do Mapa Comercial

Implementação na branch `codex/contextual-commercial-map-panel`, a partir de `5543034845dfe967cf79e440e68c2d726bfa9233`, integrada à `main` atual `ad561b56` (bairro lateral, PR #129), sem conflitos.

## Comportamento entregue

- Segmentos visíveis ao abrir o painel, nomes completos, estado selecionado e “Limpar segmento”. O mapa completo continua padrão; links antigos `?area=exporural` convertem para a mesma seleção de segmento.
- Gestão e Lista e tabela no cabeçalho, antes da edição FENASOJA 2028. As ações administrativas continuam condicionadas às permissões e à origem dos dados.
- Legenda reutilizável com prioridade interior → segmento → parque. Situações usam a mesma store e `STATUS_CONFIG` da cena; limpeza de segmento não apaga busca, situação, classificação ou localização.
- Interior substitui o conteúdo do painel, com retorno sempre acessível, esquema da planta, contagens e áreas separadas. A ficha do módulo oferece detalhes voluntários e acesso à legenda do pavilhão.
- Mobile usa painel recolhido/resumido/expandido; a ficha de estrutura começa com identificação, resumo e ação principal. Gestos do painel não chegam ao mapa, e a lista recolhe o painel automaticamente.
- Retorno restaura filtros, segmento e câmera exteriores. `Esc` respeita modais, popovers, composição de texto e campos em edição. Alternar lista/mapa mantém interior e seleção.

## Investigação e desempenho

O antigo escopo de área recortava os dados de Exporural e tinha efeitos de limpeza concorrentes. Ele agora é restrito às permissões de comissão; a seleção normal é uma apresentação sobre os mesmos dados. A store responde imediatamente e não depende de timers ou da conclusão da câmera.

A assinatura direta de segmento em `Scene` também tornava urgente uma travessia da cena. A apresentação agora recebe segmento, contexto e filtros numa única atualização diferida; `Scene` é memoizada e `CameraRig` acompanha a navegação atual diretamente. Uma nova navegação substitui a animação anterior e cancela reenquadramentos pendentes. Geometrias e buffers existentes são reutilizados; o filtro interno modifica cores das instâncias.

A tabela antes criava até 1.687 linhas da referência. Agora cria no máximo 50 por página, pesquisa o índice inteiro e abre a página da entidade selecionada quando se retorna à lista.

O enquadramento considera o painel sobreposto sem redimensionar o canvas. A projeção usa `PerspectiveCamera.setViewOffset`, mantendo o pivô dentro dos limites existentes; quando a distância segura é insuficiente, o zoom compensa a área encoberta. Offset, lente e posição participam da mesma transição interrompível. Movimento reduzido afeta animações, sem reduzir a qualidade visual.

Não foi medido input-to-paint em hardware mobile; estas mudanças eliminam os acoplamentos identificados, sem atribuir um ganho percentual de latência não medido.

## Dados e confiabilidade

Na referência local: parque com 1.577 lotes e 110 estruturas não comerciais; Exporural com 95 lotes; Pavilhão 14 com 186 módulos válidos na planta. Registros legados fora da planta não entram na legenda do interior. A área oficial agregada é parcial quando nem todos os lotes têm medição; ausência é “Área não informada”. Área total do pavilhão, área modular e soma nominal aparecem separadas.

Não foram alterados cadastros, geometrias oficiais, modelos 3D, contratos, regras comerciais ou políticas de acesso. A alteração preexistente em `supabase/functions/mcp/index.ts` ficou fora desta entrega.

## Validação

TypeScript (`tsc -p tsconfig.app.json --noEmit`), ESLint dos arquivos alterados e build de produção passaram. O build mantém avisos existentes sobre chunks grandes e a base Browserslist desatualizada.

Suíte ampla após integrar a `main`: **976 testes em 123 arquivos; 971 aprovados e 5 falhas preexistentes**, sem falhas novas. Comando: `npm test -- commercialMap --maxWorkers=2`. Os relatórios brutos locais ficam em `artifacts/contextual-panel`; o resumo revisável está em [validation.json](screenshots/contextual-panel/validation.json).

Testes de integração cobrem seleção imediata, limpeza independente, permissões/ordem do cabeçalho, prioridade contextual, retorno, lista, formulários ao trocar módulo e paginação. Testes de projeção cobrem exteriores/interiores em 360/390/430 px, com painéis de 25% e 78%, após os limites reais de OrbitControls.

Cinco falhas foram reproduzidas em checkout isolado do commit original (46 testes: 41 passaram, 5 falharam): folga de infraestrutura elétrica, referências locais ausentes da Churrascaria Exporural, duas expectativas de histerese em Presentation e comparação textual LF/CRLF em QuadrasABLactalis. Elas não foram corrigidas alterando dados espaciais nesta tarefa.

As capturas “antes” são os anexos fornecidos pelo usuário. As capturas “depois” usam a mesma interface real na rota exclusivamente DEV `/__dev/commercial-map-interface`, com referência oficial e permissões de leitura. Gestão não aparece nessas capturas por essas permissões; sua apresentação com autorização é validada nos testes de integração.

Verificação visual: desktop 1366×768, mobile 360×800, 390×844 e 430×932, e paisagem 844×390, sem overflow horizontal nos estados inspecionados. O resumo do interior mediu 200, 211 e 233 px respectivamente (25% da altura do viewport). A seleção inicial de estrutura mediu 144 px em 390×844, preservando mais espaço conforme o conteúdo. Voltar ao mapa, lista e controles do painel mediram ao menos 44 px de altura; o botão compacto Lista e tabela mediu 44×44 px. Foram exercitados segmento → situação → limpar segmento, seleção do Pavilhão 14, módulo 73, expansão/recolhimento, lista/mapa e retorno por Esc. Os filtros em paisagem têm rolagem própria, fechamento fixo e ocultam o Dock durante o uso.

Após aquecimento e integração da `main`, **24 trocas de segmento** terminaram com seleção, legenda e câmera em Espaço do Automóvel. Recursos antes/depois: **559 geometrias, 149 texturas, 187 programas**, sem crescimento. Saúde final `ready/post`, 724 quadros apresentados, zero perdas de contexto e nenhum código de erro. Esses números não constituem medição de FPS; detalhes em [stress-segments.json](screenshots/contextual-panel/stress-segments.json). Uma rodada anterior em 430×932 também manteve estáveis 543/149/183 recursos durante 24 trocas, antes da integração do bairro lateral.

### Capturas

| Contexto | Antes | Depois |
| --- | --- | --- |
| Interior desktop | [Antes](screenshots/contextual-panel/before-desktop-interior.png) | [Depois](screenshots/contextual-panel/after-desktop-interior.png) |
| Seleção mobile | [Antes](screenshots/contextual-panel/before-mobile-selection.jpeg) | [390 px](screenshots/contextual-panel/after-mobile-selection-390.png) |
| Segmentos desktop | — | [Depois](screenshots/contextual-panel/after-desktop-segments.png) |
| Interior mobile | — | [360 px](screenshots/contextual-panel/after-mobile-interior-360.png), [390 px](screenshots/contextual-panel/after-mobile-interior-390.png), [430 px](screenshots/contextual-panel/after-mobile-interior-430.png) |
| Detalhes voluntários | — | [Módulo expandido](screenshots/contextual-panel/after-mobile-module-expanded-390.png) |
| Filtros em paisagem | — | [844×390](screenshots/contextual-panel/after-landscape-filters.png) |

Validação em navegador desktop com viewports CSS, sem certificação de iPhone/Safari, hardware mobile, multitouch físico ou FPS. Fluxos comerciais de gravação não foram executados contra produção.
