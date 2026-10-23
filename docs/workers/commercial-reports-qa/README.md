# Validação visual do chat comercial

Todas as empresas, identidades, valores e geometrias destas evidências são **dados fictícios de teste**. A prévia isolada não consulta vendas nem arquivos do projeto conectado.

Foram usados os componentes de produção `WorkerRichContent`, `WorkerCommercialReport` e `WorkerCommercialPlan`, os tokens existentes do BOT FENASOJA e o adaptador de geometria compartilhado com o PDF. O Product Design orientou a hierarquia do cartão, chips, critérios recolhíveis, estados reais e localização das ações.

- [Consulta, indicadores, tabela e planta em 703 px](01-report-plan-tablet-test.jpg): captura integral do navegador interno, com limites individuais, numeração, quatro situações e correspondência dos marcadores.
- [Cartão em viewport de 390 px](02-report-mobile-390-test.jpg): iframe local com largura real de 390 px; ação de PDF e atualização em coluna, com alvos de pelo menos 44 px. É teste em navegador, sem dispositivo iOS físico.
- [PDF obtido pelo download da prévia](sample-synthetic-report.pdf): arquivo gerado pelo mesmo renderer e baixado pelo fluxo mediado, com dados fictícios.

A captura integral considera o zoom da janela para preservar a largura observada; não usa screenshot da planta como geometria de exportação. A prévia do mapa usa polígonos persistidos da fotografia simulada e não monta a cena 3D. A tabela de correspondência mantém rolagem própria quando longa.

Foram verificados no navegador a consulta sem geração automática, a etapa de preparação, o cartão pronto, o download do PDF, a abertura da planta e a identificação comercial de comprimento variado. Testes automatizados cobrem duplo clique, reabertura pelo estado atual, revogação, expiração, resposta não PDF, geração divergente, texto com marcação maliciosa, polling até conclusão e continuidade por identidade da fotografia. Detalhes usam controles nativos operáveis por teclado; a animação respeita movimento reduzido. Esta verificação não substitui avaliação completa com leitor de tela ou teste físico de download no iOS.

Para reproduzir, iniciar a prévia existente com `node node_modules/vite/bin/vite.js --config scripts/workers/preview.vite.config.ts` e abrir `/scripts/workers/commercial-preview.html` ou a variante `?mobile` no servidor local de porta 5188. O chat completo aceita a pergunta `Relatório comercial de teste` no cenário isolado.
