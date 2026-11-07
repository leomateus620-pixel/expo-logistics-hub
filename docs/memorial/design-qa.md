# Product Design · revisão visual

**Final result: pass para revisão visual local e fluxos observados.** Homologação física e confirmação dos trechos ilegíveis continuam pendentes, conforme `validation.md` e `inventory.md`.

## Alvo e contexto

Referência principal: **Superfície de grafite e latão.png**, 1.672 × 941 px, fornecida pelo usuário. Referências das peças: 26 JPEGs originais de 1.152 × 1.536 px. A rota, o layout e os controles existentes do Ecossistema foram inspecionados antes da alteração. No acesso anônimo real, a consulta organizacional apresentou seu estado de erro existente; a organização pronta foi validada separadamente com a fixture já existente.

A imagem é uma referência de ambientação, sem layout de produto. Não há um mockup de tela móvel fornecido. A implementação combina esse ambiente com conteúdo e navegação reais; não se afirma correspondência pixel a pixel com um mockup inexistente.

## Comparação no mesmo arquivo

[Desktop](evidence/environment-comparison-desktop.jpg) e [celular](evidence/environment-comparison-mobile.jpg) reúnem referência e implementação no mesmo arquivo. A referência inteira é preservada com margens quando sua proporção difere da tela. Os [26 pares individuais](evidence/pieces) reúnem JPEG, retificação e face recomposta; as folhas `clean-faces-contact-1.jpg` a `3.jpg` permitem revisar o conjunto. Os recortes ampliados de 2012, 2014 e 2026 e as provas das artes de 2000/2002 complementam a conferência dos detalhes.

Viewports DOM observados: 1.263 × 789 no desktop, 768 × 1.024 no tablet, 390 × 844, 680 × 789 e 320 × 750 nas simulações estreitas. O Windows informou DPR 1,14. O navegador integrado limita a imagem à sua área visível: por exemplo, as capturas são 1.262 × 789 e 390 × 822. As dimensões reais dos arquivos acompanham as evidências; não são apresentadas como capturas de hardware móvel ou telas em densidade 2x.

## Iterações e correções

| Prioridade | Achado observado | Correção e prova posterior |
| --- | --- | --- |
| P2 · imagem | Repetição mineral mostrava uma emenda horizontal em y=512 | Centro recortado da referência principal, WebP de 15.570 bytes e `cover no-repeat`; [antes](evidence/desktop-background-before.jpg), [depois](evidence/desktop-gallery.jpg) |
| P2 · fidelidade | Recortes iniciais retiravam cabeçalhos, grafismos ou linhas finais | Recortes individuais refinados e localizadores de transcrição reprojetados; comparações por peça, inclusive rodapés de 2020/2024 |
| P2 · imagem | Máscaras genéricas deixavam manchas, fragmentos vizinhos e falhas em marcas | Ativos isolados da dupla marca de 2000, ilustração de 2002 e cartaz de 2006; limiares locais preservam o dourado sombreado de 2018 e o motivo de 1998 |
| P2 · tipografia | Regra do cabeçalho de 2000 cruzava COMISSÃO CENTRAL | Período e regra reposicionados conforme a fotografia; comparação final de 2000 |
| P2 · foco | Foco no atalho era ignorado enquanto a organização voltava a ficar visível | Restauração após duas etapas de pintura; ícone acionável e câmera/controles preservados na volta |
| P2 · traçado | Segmento final passava pela área do epílogo e larguras intermediárias de uma coluna ainda usavam marcador central | Marcador do epílogo colocado acima da face, com segmento de 50 px; linha lateral segue a quantidade real de colunas, inclusive em 680 px; [medição](evidence/trace-observations.json) |
| P2 · retorno | Após 390 → 768 px, 2004 recebia foco fora da tela, em y=-2.540 | Recupera o quadro visível quando muda a disposição das faixas; foco retorna entre y=348 e y=708 |

A revisão posterior às correções não encontrou diferenças P0/P1/P2 restantes nos estados locais capturados. A ausência de evidência física é um limite de homologação, não um teste considerado aprovado.

## Cinco superfícies de fidelidade

**Tipografia e conteúdo.** Georgia dá caráter de exposição aos anos e títulos; a navegação herda a família do sistema. A transcrição é texto selecionável e mantém ordem, nomes, cargos compartilhados e lacunas explícitas. As fontes históricas recompostas são aproximações registradas, com grafia conferida. As associações 19ª/2012, 20ª/2014, 23ª/2022 e o documento de 2020 foram verificadas também na interface.

**Espaçamento e ritmo.** O DOM permanece cronológico. O SVG mede os marcadores, passa abaixo das legendas e curva nos corredores externos; as faixas pares invertem apenas a posição visual. No celular, marcador lateral, ano e quadro seguem uma linha vertical. O epílogo tem segmento final curto. Índice, abertura e retornos foram exercitados com posições reais de rolagem.

**Cores.** Grafite fosco, marfim e ouro com madeira lateral discreta. O centro permanece calmo, e a luminosidade diminui no detalhe, com halo quente e sombra difusa sob o quadro. Os acabamentos laterais são mais estreitos que a referência para reservar área a peças, legendas e curvas; no celular, ficam em 14 px. Os pares principais de contraste estão registrados em `validation.md`.

**Imagem e material.** As faces de exposição removem o reflexo do fotógrafo do campo de inscrições. Marcas e cartazes vêm de recortes/máscaras da fonte; não foram inventados por geração. Molduras, vazios inferiores e ornamentos caracterizam cada peça. A inspeção usa espessura, bisel e fixações reais em Three.js; verso, medidas e relevo são aproximações declaradas. A resolução considera a dimensão efetiva da face recomposta, sem limitar sua nitidez à do recorte fotográfico.

**Cópia e estados.** Rótulos de navegação são claros e permanecem visíveis no celular. O texto estático FENASOJA 2028 · LOADING… tem composição própria. Carregamento real, falha de textura e indisponibilidade de WebGL usam mensagens distintas. Detalhes técnicos de conferência ficam recolhidos em Origem e notas do acervo, preservando a leitura dos nomes.

## Creative Production e recursos usados

[Creative Production](plugin://creative-production@openai-curated-remote) refinou materiais, luz e acabamentos, com estudo de ambiente e pilotos de 1966, 2004, 2018 e 2026. [Product Design](plugin://product-design@openai-curated-remote) orientou o percurso até a leitura e o retorno. Board de produção: `cb042a55-05d8-4643-8e7b-4b8847bb66f5`.

Os quatro estudos de material estão em `design-concepts`. São referências de acabamento, sem autoridade sobre inscrições. O centro mineral efetivo vem da imagem principal; as laterais vêm do estudo escolhido. O CSS carrega somente `graphite.webp`, `edge-left.webp` e `edge-right.webp`, totalizando 25.778 bytes. Faces e textos foram compostos deterministicamente, usando os recursos originais conferidos. Nenhuma inscrição histórica gerada por IA foi integrada.
