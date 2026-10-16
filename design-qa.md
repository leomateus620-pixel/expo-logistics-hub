# Design QA — faixa histórica contínua FENASOJA

14/10/2026. **final result: passed.**

## Referências e evidências

A direção aprovada é o pedido de faixa contínua atrás da identidade fixa, com as 12 peças fornecidas. A PR #200 é referência de identidade, acessos e dimensões; a galeria finita e a segunda faixa mobile foram explicitamente substituídas. O QA anterior foi preservado em [legacy](docs/portal-history/legacy/design-qa-pr200.md); o QA financeiro permanece em seu diretório.

Foi inspecionado o app real no Codex In-app Browser, incluindo o build de produção em `http://127.0.0.1:8083/portal`. As comparações finais reúnem a captura real da PR #200 e a implementação atual, no mesmo viewport: [desktop 1440](docs/portal-history/continuous/evidence/comparison-desktop.jpg) e [mobile 390](docs/portal-history/continuous/evidence/comparison-mobile.jpg). O recorte desktop mede 1180 × 114 px em ambos; o mobile passou intencionalmente de 368 × 176 para 368 × 90 px. Fases de animação distintas não são tratadas como comparação do mesmo frame.

A prancha recebida foi somente consultada. Nenhuma campanha foi gerada, recortada em logo ou substituída pelo preview. Os arquivos, procedências, dimensões e hashes estão em [assets.md](docs/portal-history/assets.md).

## Findings e correções

- **Corrigido: centro vertical real da identidade.** A caixa inline acrescentava 6,5 px de baseline e deslocava o lockup real em −3,25 px. A camada da marca agora usa grid. As capturas finais e medições de oito viewports registram desvio X/Y de 0/0 px; a gravação mede o filho real FenasojaBrand, não apenas sua caixa externa.
- **Corrigido: proteção central com texto ampliado.** Um gradiente proporcional à caixa deixava peças próximas das letras quando a marca crescia. Os limites sólidos suaves agora são calculados pela largura real da identidade mais 6 px em cada lado, com fades nas extremidades. A [captura final a 200%](docs/portal-history/continuous/evidence/text-zoom-200-320.jpg) mostra wordmark e badge legíveis, sem arte sobre letras ou overflow. Desvio vertical residual medido: −0,0039 px, arredondamento CSS.
- **Refinamento: compacto mobile e controle discreto.** Miniaturas de 32 px percorrem o mesmo acervo; nenhuma faixa inferior nem deslocamento vertical da marca permanece. O controle de pausa de 32 px é irmão do launcher, com rótulo, estado e foco acessíveis.

Evidências anteriores aos dois ajustes foram preservadas em `continuous/evidence/qa-before-shield-desktop.jpg` e `qa-before-shield-text-zoom.jpg`.

## Superfícies verificadas

- **Tipografia:** FenasojaBrand, wordmark HTML metálico, símbolo oficial e badge 2028 existentes. Nenhum texto central rasterizado; texto ampliado pode quebrar o badge para legibilidade.
- **Layout:** centro fixo horizontal e vertical durante o movimento, 114 px externos desktop e 90 px mobile. Viewports reais 320, 360, 390, 430, 768, 1366, 1920 e landscape 844 × 390 sem overflow. Crescimento a 200% vem somente da marca, não das artes.
- **Cores:** navy e iluminação radial estáticos, borda e filamento contidos, proteção central gradual. Não há partículas, filtros de campanha, fundo animado ou retângulo evidente.
- **Assets:** 12 edições únicas, integrais, proporcionais com contain. Variantes locais 256/512, loading/decode antecipados. Anúncio, projeto gráfico, programa e banner mantêm suas identificações no catálogo técnico.
- **Conteúdo e acessos:** nenhuma legenda ou slogan adicional. Agenda, Restaurante/Arena, Mapa, Financeiro e Administrador nessa ordem; Comissões e expansão preservadas. Launcher do Ecossistema continua disponível; pausa não cria controles aninhados.

## Movimento e interação

O [registro real](docs/portal-history/continuous/evidence/seam-2026-1998.mp4) contém 276 frames em 27,953 s, sem aceleração. A fixture local restaura uma sessão pausada perto da emenda; a retomada usa o controle real. Emenda 2026 → 1998: avanço equivalente de 1,6011 px em 102 ms, marca com desvio 0/0 px e nenhuma etapa de encerramento. Desktop: grupo medido 1392 px / 16 px/s = 87 s; mobile: 655,96875 px / 12 px/s = 54,664 s.

Pausa/retomada, saída/retorno ao viewport, navegação ao login administrativo e volta, resize, expansão de Comissões, abertura/fechamento do Ecossistema e restauração de foco foram exercitados no navegador. A liberação pela introdução Alvorada foi observada antes do início do loop. Preferências de movimento/dados, aba oculta, falhas de imagens, StrictMode e estados de acesso têm cobertura controlada; não se afirma teste em telefone físico nem autenticação administrativa real.

No perfil controlado de produção, 320 × 800, 1,2 s de latência e 30 KB/s por resposta de campanha, mais 8 ms de CPU artificial por frame, o p95 foi 17,1 ms e não houve long tasks acima de 50 ms em 30 s. Os acessos não aguardam a carga do acervo.

## Resultado

Comparações finais e texto ampliado foram inspecionados após as correções. Os 161 testes pertinentes, typecheck, build, lint dos arquivos alterados e integridade dos 52 caminhos passaram. Após o último ajuste de prioridade de carga, 40 testes de história/Alvorada foram repetidos com sucesso. Revisão final do controlador não identificou bloqueio material.

As 13 artes ainda não recuperadas ficam documentadas e não são necessárias à etapa autorizada de 12 peças. Expansão futura mantém o motor. Nenhuma mudança no banco, permissões ou regras de acesso; deploy não foi solicitado nesta entrega. [Relatório completo](docs/portal-history/validation.md).


## Equipe de bots Fenasoja — 16/10/2026

**final result: passed.** Fases 0 e 1: símbolo próprio baseado na marca oficial, catálogo, oito perfis, chat e copiloto; nomenclatura visível “bots”.56 capturas em claro/escuro,390×844 e 1280×800;axe AA sem violações, largura 360 sem overflow, 8/8 interações.12 mascotes visíveis com CPU 4×: 60,11 FPS; p95 16,7 ms; CLS 0 em SSE sintético.

O [relatório visual completo](docs/workers/phase-0-1/design-qa.md) registra comparações, correções, fontes, arquivos de evidência e limites da prévia local com dados sintéticos. A [entrega técnica](docs/workers/phase-0-1/README.md) detalha testes, migrations e ativação pendente.
