# Verificação da implementação

O ensaio de interface seleciona a entidade pelo centro de Q-D-01 projetado na tela. No desktop ele exercita roda, panorâmica, órbita e troca de aparência pelo teclado. No celular emulado ele envia eventos de toque e pinça, levanta os dedos e toca deliberadamente no lote em seguida. A checagem distingue o arraste que move a câmera do toque que abre a ficha.

Com a ficha aberta, o teste troca para Clássico, seleciona Fluidez e volta a Natural quente. Compara a instância da cena e da câmera, a posição, o alvo, a orientação e a identificação do lote. Depois de fechar Camadas, verifica a ficha do mesmo lote. Ao fechar a própria ficha, a câmera mantém a pose alcançada para o lote, como na base. O teste recarrega a página e verifica as duas preferências locais.

| Registro | Desktop | Emulação móvel 390 × 844 |
| --- | --- | --- |
| Base c99436b3 | [Câmera e seleção](interacao/base-desktop.json) | [Câmera e seleção](interacao/base-mobile.json) |
| Candidata 32b68d60 | [Câmera e preferências](interacao/desktop.json) | [Câmera e preferências](interacao/mobile.json) |
| Painel em uso | [Desktop](interacao/desktop-layers.jpg) | [Celular](interacao/mobile-layers.jpg) |

A navegação pela interface usa a fixture do mapa de gestão sem parâmetros adicionais. As comparações fotográficas usam a fixture saneada de 2028. A abertura com temporização usa o cenário público da matriz do repositório. [Matriz de abertura e órbita](ensaio.md) · [Onze interiores visitados](interiores/README.md)

## Compilação e contratos

`npm run typecheck` e `npm run build` passaram na revisão de aplicativo `32b68d60`. Os builds de diagnóstico e da fixture saneada também passaram. O build Vite emite o aviso de tamanho de chunks do projeto.

O build da prévia servida para revisão informa o SHA completo no manifesto. Comparamos seus 744 arquivos por SHA-256 com a compilação usada nos ensaios finais de clima e prontidão. Os 743 arquivos da aplicação e dos recursos são idênticos. O arquivo de manifesto recebeu o identificador da revisão. [Verificação da prévia navegável](manifesto-da-previa.json)

A bateria dirigida à revisão final passou em **107 de 107 testes**, em onze arquivos. Cobriu a cobertura interna do terreno, dimensões e contornos das ilhas, controles de vegetação e de aparência, resolução e DPR, amanhecer, chuva, memorial da Árvore Lunar, hidrologia, materiais de status e renderização dos lotes externos.

```sh
npm test -- --maxWorkers=2 --testTimeout=30000 \
  src/test/commercialMapInteriorGround.test.ts src/test/commercialMapPavilionIslandEdging.test.ts \
  src/test/commercialMapPavilionEdgeDimensions.test.ts src/test/commercialMapTreeControls.test.tsx \
  src/test/commercialMapViewport.test.ts src/test/commercialMapSunrise.test.ts \
  src/test/commercialMapHydrologicalControls.test.tsx src/test/externalLotStatusMaterial.test.ts \
  src/test/externalLotRendering.test.tsx src/test/commercialMapLunarMemorial.test.ts src/test/commercialMapRain.test.ts
```

A suíte integral na revisão `1db33c82` executou **4.614 testes**. Passaram **4.527** e falharam **87**. Repetimos os arquivos correspondentes na base `c99436b3`, com as mesmas dependências. Os 87 casos falharam nas duas árvores, por correspondência de arquivo e nome completo. A última alteração do aplicativo, em `32b68d60`, identifica a arte do memorial para que a chuva aplique o escurecimento uma única vez. Ela foi verificada nos 107 testes direcionados e no ciclo de chuva da cena. [Comparação por nome de teste](testes-vitest.json)
