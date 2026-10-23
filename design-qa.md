# Product Design QA — Dashboard Comercial compacta

Data: 23/10/2026. Escopo: visão global, do cabeçalho até Área comercial / Vendas e contratos.

## Alvo e evidências

As duas capturas fornecidas pelo usuário em 23/10/2026 às 00h32 orientam identidade, conteúdo e grafismos. O alvo combina essa identidade com as mudanças de composição solicitadas, incluindo o refinamento posterior: Área comercial menor na horizontal, Vendas e contratos maior, quatro métricas juntas e alturas iguais no desktop.

A comparação dimensional usa o mesmo conjunto fictício e os mesmos viewports, sem dados de compradores nem chamadas à produção:

- Fonte controlada antes: [before-1440.png](docs/validation/dashboard-compact/before-1440.png), fontes da `main` `151d829d`.
- Implementação final: [after-1440.png](docs/validation/dashboard-compact/after-1440.png).
- Comparação conjunta da tela: [comparison-1440.jpg](docs/validation/dashboard-compact/comparison-1440.jpg), 2880×1030px (duas capturas 1440×1000px, mesma escala, apenas legenda externa).
- Comparação focal financeira: [comparison-finance.png](docs/validation/dashboard-compact/comparison-finance.png), recortes 564×270px em escala 1:1.
- Comparação focal dos dois cards inferiores: [comparison-summary.png](docs/validation/dashboard-compact/comparison-summary.png), mesma densidade; recortes alinhados pela região, cuja posição vertical mudou intencionalmente.
- Responsividade: [1280px](docs/validation/dashboard-compact/after-1280.png), [390px](docs/validation/dashboard-compact/after-390.png), [430px](docs/validation/dashboard-compact/after-430.png), [resumo mobile](docs/validation/dashboard-compact/after-390-summary.png).
- [Reflow ampliado e popover](docs/validation/dashboard-compact/after-200pct-info.png), 1440×1000 pixels físicos, 720×500 CSS px, DPR 2. É emulação equivalente ao reflow de uma superfície de 1440px em 200%, não comando de zoom nativo. As demais capturas usam DPR 1 e não precisaram de normalização de densidade.

Navegador integrado do Codex, tema claro, inventário e preços fictícios idênticos entre versões, sem sessão de produção. Meses variam com o ciclo existente; os valores comerciais e a amostra não variam entre versões. As capturas originais do usuário têm números e viewport distintos e foram usadas como referência de identidade, não para afirmar medidas exatas.

## Histórico de comparação

1. **Iteração 1 — blocked.** A faixa financeira e o progresso já estavam compactos, mas a média abaixo dos contadores acrescentava 55px a Vendas e contratos. O usuário apontou a composição como desorganizada. Evidência: [iteration-1-1440.jpg](docs/validation/dashboard-compact/iteration-1-1440.jpg). Classificação P2: crescimento desnecessário e desequilíbrio entre cards vizinhos.
2. **Correção.** A região passou a distribuir largura em 1:2. A média é a quarta célula da matriz, com ícone, duração, informação e detalhes; mantém uma faixa inferior somente em telas estreitas. Os cards compartilham altura natural, sem altura rígida nem recorte.
3. **Iteração 2 — passed.** Comparação conjunta e focal final inspecionadas. Área comercial: 460,66px; Vendas e contratos: 921,34px em 1440. Em 1280: 407,33px e 814,67px. **Ambos com 173,40px de altura nas duas larguras.** Evidência: `after-1440.png`, `after-1280.png` e `comparison-summary.png`. Nenhum P0/P1/P2 visual permanece no escopo solicitado.

## Superfícies obrigatórias

- **Fontes e tipografia:** Manrope e Sora originais, mesmos tamanhos dos indicadores financeiros e cifras tabulares. Duração de 17px subordinada aos contadores de 29/36px; títulos/valores financeiros alinhados. Quebras naturais em mobile, sem texto cortado, escala por transform ou fonte menor para forçar cabimento.
- **Espaçamento e composição:** faixa financeira de 164px, largura 1,4:1:1 preservada; preview interno sem card adicional; progresso integral de 1392px/1232px e 200,25px de altura. Quatro métricas no card de vendas e alturas iguais às de Área comercial no desktop. Sem overflow global em 390/430px. A diferença em relação à composição anterior é intencional.
- **Cores e tokens:** tons azul/laranja/verde, padrões, bordas, raios, sombras e contraste permanecem na família existente; estilos na folha local, usando tokens `--overview-*`. Não há overrides de tipografia ou tokens de outras telas.
- **Imagens e ativos:** Sojinha, contornos, grafismos e glyphs existentes preservados, sem substituição por novos desenhos ou placeholders. O glyph de assinatura ocupa 20px na métrica compacta; o de fluxo ocupa 20px dentro de alvo de 34px/44px. Não foi necessária geração de imagens.
- **Copy e conteúdo:** três contadores mantidos. A média usa `signatureDuration` e a amostra própria do provider; metodologia/exclusões ficam no `OverviewInfo`. Nenhum número da captura original foi fixado na implementação. Venda confirmada continua distinta de recebimento; qualificadores de cobertura permanecem disponíveis.

## Interações e acessibilidade

- Enter abre fluxo e detalhes; retorno recupera foco no controle compacto. O fluxo mantém ano/mês/base e a assinatura manteve scrollTop 923,5px na conferência móvel; o retorno foi revalidado após reposicionar a métrica na quarta coluna.
- Tooltip “Ver fluxo de caixa” com Tab, foco visível, informação por clique/foco/teclado, Escape fecha o popover. Tamanho do alvo mobile 44×44px. Clique e teclado exercitados; o navegador integrado não suporta `Input.dispatchTouchEvent`, portanto não há afirmação de teste em hardware de toque.
- Meses alternaram mantendo altura 164px. Controles de pausa e próximo mês funcionam; a mudança é local e `prefers-reduced-motion: reduce` desativa a animação. Pausa local do Sojinha funciona, pista responde à nova largura.
- Ready, loading, error, stale, restrito, contratos somente e histórico insuficiente revisados; ausência não vira zero. Amostra 4 e contador assinado 12 confirmam apresentação independente.
- Console final de uma aba nova sem erros. Avisos intermediários do HMR do harness foram resolvidos pelo descarte da raiz React ao recarregar o módulo.

[Medidas, verificações e reprodução](docs/validation/dashboard-compact/README.md) · [interações](docs/validation/dashboard-compact/interaction-checks.json) · [resultados dos testes](docs/validation/dashboard-compact/checks.json).

## Limites e conclusão

Testes de apresentação/navegação pertinentes: 48 aprovados em 6 arquivos, reexecutados após o refinamento horizontal. Typecheck e build aprovados. A suíte completa da tarefa teve 90 falhas também reproduzidas por nome em cópia limpa da `main`; não são declaradas como resolvidas. Sem certificação de acessibilidade em dispositivo físico nem verificação de dados autenticados de produção.

Checklist de implementação: composição compacta, alturas desktop, responsividade, navegação, estados, foco e movimento reduzido conferidos. Sem correção P0/P1/P2 pendente neste escopo.

O [relatório anterior de agrupamento empresarial](https://github.com/leomateus620-pixel/expo-logistics-hub/blob/151d829d5610acbc355a581d6cca79e7e9401d87/design-qa.md) permanece no histórico do Git, com seu escopo e limitações próprios; esta revisão não reavalia aquela funcionalidade.

final result: passed
