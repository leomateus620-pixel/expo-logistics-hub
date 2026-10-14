> Registro histórico da PR #200; veja o design-qa.md atual na raiz.

# Design QA — memória visual FENASOJA

Finalizado em 14/10/2026. final result: passed.

O [QA financeiro anterior](../../validation/financial-ui-upgrade/design-qa.md) foi preservado em seu diretório de validação.

## Fontes e capturas

Verdade visual: `docs/portal-history/reference/portal-history-preview.png` (anexo fornecido, 1440 × 660 px). Implementação: app real em `http://127.0.0.1:8081/portal`, Codex In-app Browser, DPR 1.

Comparação desktop no mesmo destaque 2016: `docs/portal-history/evidence/comparison-desktop.jpg`. Recorte da referência 1182 × 121 px; normalizado para o painel 1180 × 114 px do card real, viewport 1440 × 1000. A diferença de altura é intencional: card de 112 px internos + borda, dentro da faixa pedida.

Comparação mobile no mesmo destaque 2024: `docs/portal-history/evidence/comparison-mobile.jpg`. Recorte de referência 362 × 163 px, proporcionalmente contido em 368 × 176 px; implementação 368 × 176 px, viewport 390 × 844. A altura de 174 px internos foi reservada para acomodar realce e retorno vertical sem alterar o layout.

As imagens da referência e da implementação estão juntas no mesmo arquivo de comparação. Capturas completas mostram o contexto do portal; recortes focados verificam marca, bordas, slots, contain e realce. As demais capturas/medidas estão em `docs/portal-history/evidence/capture-files.json` e `responsive.json`.

## Findings e histórico de correções

- [P2, corrigido] Distribuição inicial das laterais ficou concentrada perto da marca. Evidência anterior: `evidence/qa-before-desktop-header.jpg`. Ajuste: padding de 48 px medido na capacidade, rails alinhados às bordas internas, mantendo centro absoluto da marca. Evidência após ajuste: `evidence/comparison-desktop.jpg`, destaque 2016, com acervo distribuído como na referência e folga para a escala 1,08.
- [P2, corrigido] Texto ampliado cortava as setas de acesso. Evidência anterior: `evidence/qa-before-text-zoom-200-320.jpg`. Ajuste: action com max-width, rótulos que quebram e títulos que podem quebrar palavras longas. Evidência final: `evidence/text-zoom-200-320.jpg`; todas as setas terminam dentro do card e não há overflow horizontal.
- Refinamento realizado: prioridade CSS da palavra/badge da galeria, mantendo a família/metal do componente existente e mínimo de 20 px no wordmark normal. O resultado está na comparação mobile final. Não se rasterizou o texto da marca.

Todos os caminhos de evidência acima são relativos a `docs/portal-history/`.

## Superfícies de fidelidade

- **Fontes/tipografia:** FenasojaBrand e família Inter/fallbacks existentes; peso, espaçamento e acabamento metálico preservados. Tamanho/badge seguem a marca do produto, em vez de substituir pela tipografia ilustrativa da prévia. Texto 200% quebra o badge em uma linha adicional legível. Desvio intencional e aceito pelo requisito de reutilizar a marca.
- **Espaçamento/layout:** centro horizontal e vertical final com desvio medido zero em nove viewports, 320–1920 px e landscape. Desktop em 114 px externos; mobile em 176 px, com altura maior apenas quando a marca ampliada exige. Slots 96 × 72 / 108 × 81 px e halo dentro das margens. Nenhum overlap marca/arte nos destaques ou no retorno.
- **Cores/tokens:** azul profundo, iluminação radial contida, borda discreta e filamento dourado estáticos. Imagens mantêm cores originais; o destaque usa opacidade/transform e halo externo, sem filtro animado.
- **Qualidade/fidelidade dos assets:** WebPs autênticos fornecidos, integrais, transparentes, com contain; datas, assinaturas e lettering preservados. Símbolo é o recorte oficial já existente/documentado, sem redesenho. Não se usou o preview como fundo nem gerou uma campanha 2028. CSS/SVG se limitam ao fundo/conexão solicitados.
- **Conteúdo:** nenhuma descrição/slogan/ano sobreposto às artes. Identidade final FENASOJA 2028; nomes acessíveis do launcher existentes. Ordem dos acessos atende Agenda, Agenda Restaurante/Arena, Mapa, Financeiro, Administrador e Comissões preservadas.

## Interações e motion

Registro real: `docs/portal-history/evidence/gallery-desktop.gif`, 79 frames até done em 7.816 ms de amostragem. Quatro destaques acumulativos, saída conjunta no encerramento, final estático. Testes confirmam 600 + N × 1.400 + 1.600 ms, pausa exata e cleanup/StrictMode. Mobile e tablet foram capturados ao vivo com o par. O retorno à rota não repete; Administrador abre o login correto; Comissões expande/recolhe; o Ecossistema mantém nome, botão de fechamento, inert e restauração de foco. Console final sem erros da aplicação.

## Open Questions

Nenhuma pendente. A prévia fornecida é direção de composição: medidas/tipografia finais respeitam os componentes do produto e a faixa dimensional pedida. Não foi realizada autenticação administrativa nem emulação de rede lenta no navegador; esses estados possuem testes pertinentes controlados, com checks de autorização intactos.

## Implementation Checklist

- [x] Comparar referência/implementação juntas nos mesmos destaques.
- [x] Corrigir distribuição e clipping de texto ampliado, recapturar e comparar.
- [x] Conferir os cinco aspectos de fidelidade e nove viewports reais.
- [x] Testar launcher, retorno, administrador e Comissões no navegador.
- [x] Passar typecheck, build, lint escopado, integridade e 148 testes pertinentes.

## Follow-up Polish

Nenhum P0/P1/P2 ou ajuste de acabamento obrigatório restante.

final result: passed
