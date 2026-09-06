# Validação automatizada das histórias da Fenasoja

Validação em 6 de setembro de 2026. Os testes de fluxo usam o `EntityDetailsPanel`, a experiência lazy, a galeria e o diálogo reais. Apenas dados editoriais, mídia de teste, hooks comerciais e ações do store são substituídos por fixtures; não há chamadas de escrita ao backend. Os contratos do catálogo examinam o inventário oficial, fontes e mídia reais.

## Resultados focados

- Após incorporar `origin/main` (`33929757`) no merge `d45f8669` e concluir a proteção do fechamento da história, a verificação focada final aprovou **99/99 testes em 7 arquivos**, em 23,12 s: história (13), catálogo (23), seleção do painel (7), navegação contextual (27), controles contextuais (8), legenda contextual (16) e independência do módulo (5).
- Comando: `npm test -- src/test/commercialMapHistory.test.tsx src/test/commercialMapHistoryCatalog.test.ts src/test/commercialMapPanelSelection.test.tsx src/test/commercialMapContextualNavigation.test.tsx src/test/commercialMapContextualControls.test.tsx src/test/commercialMapContextualLegend.test.tsx src/test/commercialMapIndependence.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile=artifacts/historias-fenasoja/final-merged-focused-report.json`.
- A rodada inicial, anterior ao merge e aos três cenários adicionais, havia aprovado 33/33 testes de história/catálogo, em 28,68 s. Seu relatório permanece como evidência histórica.
- `npx tsc -p tsconfig.app.json --noEmit`: aprovado, código de saída 0. Usar explicitamente o projeto da aplicação; o `tsconfig.json` raiz tem `files: []` e não equivale a essa verificação.
- `npx eslint src/test/commercialMapHistory.test.tsx src/test/commercialMapHistoryCatalog.test.ts`: aprovado, código de saída 0.

Os 13 cenários de integração cobrem abertura sob demanda; zero, uma e múltiplas fotos; preservação do painel, ações comerciais, preço e foco; permissões de leitura; estado expansível; falha da imagem principal, miniatura e ampliada; crédito do acervo na ampliação; atalho global de busca; teclado, swipe e bloqueio de propagação de gestos; economia de dados; Escape do diálogo e da história; troca de seleção durante a abertura lazy sem reapresentar a história anterior; e supressão de reenquadramento por `ResizeObserver` durante a história e seu layout de fechamento. O último cenário controla os dois frames de proteção e verifica a retomada das notificações em um redimensionamento comercial posterior ou imediatamente na próxima seleção.

Uma primeira execução após o merge atingiu o prazo de 1 s do Testing Library durante a transformação inicial do módulo lazy. O teste passou a aguardar `vi.dynamicImportSettled()` depois do clique autorizado; a verificação de que nada foi carregado antes da abertura foi preservada. A repetição final passou 99/99, sem aumentar timeout global ou substituir a experiência real.

Os 23 contratos verificam identificadores públicos exatos com UUIDs persistidos, recusa de correspondência por nomes, estruturas arquivadas, inventário e allowlist, aprovação editorial, fontes, precisão das datas, IDs únicos, ciclos de agrupamento, aprovação de mídia independente do texto, relação foto/lugar e existência de todos os arquivos locais. As fixtures fotográficas não são publicadas como acervo.

## Comparação das falhas da suíte ampla

A suíte ampla **anterior ao merge de `origin/main`** registrou 932 testes: 925 aprovados, 6 falhas de asserção e 1 timeout. Esses números não descrevem uma nova execução ampla do merge final e não significam suíte integralmente verde.

As mesmas seis asserções foram reproduzidas em worktree detached no commit anterior à funcionalidade, `5543034845dfe967cf79e440e68c2d726bfa9233`, sem alteração dos testes. O comando abaixo rodou com as mesmas dependências locais, via junction de `node_modules`, e produziu 52 aprovados e 6 falhos entre 58 testes, em 26,38 s:

```powershell
npm test -- src/test/commercialMapElectricalInfrastructure.test.ts src/test/commercialMapExporuralSteakhouse.test.ts src/test/commercialMapIndependence.test.ts src/test/commercialMapNeCloverleaf.test.ts src/test/commercialMapPresentation.test.ts src/test/commercialMapQuadrasABLactalis.test.ts --maxWorkers=2
```

| Arquivo | Falha reproduzida na base |
| --- | --- |
| `commercialMapElectricalInfrastructure.test.ts` | Folga técnica mínima em estruturas existentes: coleção com 937 ocorrências em vez de vazia. |
| `commercialMapExporuralSteakhouse.test.ts` | Referências locais e budgets estáticos: expectativa `false` em vez de `true`. |
| `commercialMapIndependence.test.ts` | Seletor textual antigo `commercial-map-management` ausente. |
| `commercialMapPresentation.test.ts` | Duas expectativas de histerese: `near` em vez de `medium`; `detail` em vez de `near`. |
| `commercialMapQuadrasABLactalis.test.ts` | Expectativa textual de importação DEV com `lazy` ausente. |

`commercialMapNeCloverleaf.test.ts` passou 7/7 no worktree base; a construção da malha levou 4.260 ms. A repetição isolada do mesmo arquivo no checkout da funcionalidade também passou 7/7, em 4,78 s no total, com 2.117 ms para a construção da malha. O timeout de 5.000 ms observado na suíte ampla não se reproduziu isoladamente; não foi necessário aumentar o limite nem mudar o teste.

Após o merge, `commercialMapIndependence.test.ts` passou 5/5 na verificação focada final: a falha do seletor antigo foi corrigida pelo upstream. Portanto, cinco das seis asserções históricas permanecem como pendências de referência nos demais quatro arquivos; esta rodada focada não reexecutou esses arquivos nem a suíte ampla completa.

Evidências: `artifacts/historias-fenasoja/final-merged-focused-report.json`, `artifacts/historias-fenasoja/final-merged-focused.txt`, `artifacts/historias-fenasoja/history-test-report.json`, `artifacts/historias-fenasoja/map-suite.txt`, `artifacts/historias-fenasoja/baseline-failures.txt` e `artifacts/historias-fenasoja/after-ne-cloverleaf-isolated.txt`. Capturas e medições de navegador são relatadas separadamente e não são certificação de hardware móvel ou Safari/iOS.
