# Memorial do Voluntariado · FENASOJA

O Memorial é uma visão interna do Ecossistema, acessível pelo atalho **Memorial do Voluntariado**, com rótulo permanente no desktop e no celular. Mantém o mesmo pathname, sessão, diálogo e fronteira de acesso do portal. Não cria uma comissão, usuário, cadastro de pessoas históricas, capability, tabela ou política de banco.

## Entradas e links

O Ecossistema existente abre no portal (`/` ou `/portal`, conforme a entrada). A navegação interna usa os parâmetros de busca de React Router, preservando parâmetros alheios e o hash:

| Visão | Exemplo na base `/portal` |
| --- | --- |
| Ecossistema | `/portal?ecossistema=organizacao` |
| Linha do tempo | `/portal?ecossistema=memorial` |
| Peça | `/portal?ecossistema=memorial&edicao=fenasoja-1966` |
| Documento de 2020 | `/portal?ecossistema=memorial&edicao=fenasoja-2022&documento=2020` |
| Epílogo | `/portal?ecossistema=memorial&edicao=fenasoja-2028` |

Os mesmos parâmetros funcionam sobre `/`. As transições entram no histórico do navegador. A organização permanece montada durante a visita; a galeria permanece montada durante o detalhe. Retornos recuperam posição e foco. Escape retorna do detalhe à linha, da linha ao Ecossistema e, então, fecha o diálogo existente.

## Acervo e fontes

`src/features/memorial/catalog.json` define 25 edições, um documento associado e um epílogo. Os identificadores independem dos nomes de arquivo. `assets.json` registra dimensões, transformação fotográfica, hashes e pesos derivados. As transcrições vinculadas têm estado por linha e localizador aproximado na fotografia retificada. Não são relacionadas ao cadastro operacional.

Os 26 JPEGs dos três ZIPs foram preservados byte a byte em `public/memorial-voluntariado/originals`. Os nomes trocados dos arquivos de 2012 e 2014 foram mantidos; o catálogo segue a identidade fotografada. A placa de 2020 permanece fora da contagem de edições, dentro da 23ª de 2022. A foto da parede `IMG_1143.jpeg` não foi fornecida nos ZIPs disponíveis.

Consulte [inventário e pendências](inventory.md), [inventário estruturado](inventory.json), [decisões editoriais](decisoes-editoriais.md) e as comparações individuais em [evidence/pieces](evidence/pieces).

## Direção visual e composição

A imagem **Superfície de grafite e latão.png**, fornecida pelo usuário, é a referência principal. Creative Production produziu um refinamento do ambiente e estudos de acabamento de 1966, 2004, 2018 e 2026. Os estudos ficam em [design-concepts](design-concepts); são referências de metal, luz e volume, sem autoridade sobre nomes ou marcas. A geração nativa não produziu as inscrições finais.

A ambientação utiliza o centro mineral recortado da imagem principal fornecida e acabamentos laterais do estudo escolhido. Três WebPs são efetivamente carregados pelo CSS: `graphite.webp`, `edge-left.webp` e `edge-right.webp`, totalizando 25.778 bytes. Textura mineral, acabamentos laterais, luz e escurecimento são camadas independentes. O fundo permanece contínuo durante a rolagem. O centro é escuro, com brilho periférico; no celular, as laterais ocupam apenas 14 px. `reference.webp` e `gallery.webp` são referências de revisão e não entram na apresentação da página.

As faces de exposição são composições determinísticas limpas: fundo fosco, inscrições conferidas, cartazes/marcas de origem e bordas recompostas. Os reflexos do fotógrafo e a parede não integram o campo de nomes. Grafismos, marcas e cartazes usam recortes ou máscaras manuais dos pixels originais. A fonte histórica, sua retificação e a arte recomposta continuam disponíveis para comparação. A família tipográfica reconstruída, o relevo, o verso e a espessura são interpretações visuais registradas na ficha; não constituem escaneamento ou medição física. Microtexto e desgaste dos cartazes conservam os limites das fontes.

As peças antigas mantêm seus vazios inferiores. 1998–2002 preservam as molduras escalonadas e as marcas próprias; 2004 mantém verde/amarelo e frisos horizontais; 2006–2016 mantêm cartazes e campos de cabeçalho específicos; 2018 preserva os grafismos lineares. 2026 conserva os grupos de cargos compartilhados e as linhas finais. O epílogo é uma composição estática própria, sem confundir **LOADING…** com carregamento real.

## Percurso e inspeção

Product Design orientou o percurso Ecossistema → linha → peça → nome → retorno. No desktop, a grade coloca visualmente as faixas pares em sentido contrário, preservando a ordem cronológica no DOM. O SVG acompanha as posições reais dos marcadores, passa pelos corredores e desenha curvas externas. No celular, a linha é vertical e a rolagem permanece nativa. O índice permite localizar qualquer edição.

Só a inspeção utiliza Three.js, seguindo o padrão direto de `VenueRenderer` do Soy Summit, com `RoomEnvironment`, sem importar a cena do evento ou o Mapa Comercial. O módulo e a textura são carregados na abertura. Há um contexto, uma textura de face e ambiente por inspeção, com descarte de malhas, materiais, texturas, bitmap, observadores, eventos e renderizador. O portal suprime a introdução 3D ao abrir diretamente uma visão do Ecossistema, evitando um renderizador atrás do Memorial.

A entrada tem suspensão breve e estabiliza frontalmente. Ao voltar a uma aba que estava em segundo plano, o renderizador recompõe o frame sem manter animação contínua. Não há animação contínua durante a leitura. Arraste horizontal, setas, botões de giro, aproximação e Vista frontal oferecem inspeção limitada. O visualizador não captura roda nem zoom nativo da página. A política de resolução reduz DPR em telas estreitas e em renderização lenta. Falha de textura, WebGL ausente ou perda de contexto mantém a face frontal, a fotografia, a transcrição e a navegação.

## Reprodução

As dependências já existentes de React, React Router, Radix, Lucide e Three.js foram reutilizadas. Não há nova dependência de execução.

```powershell
# Originais já preservados; processamento fotográfico reversível.
python scripts/memorial/process-environment.py
python scripts/memorial/process-acervo.py
python scripts/memorial/update-crops.py scripts/memorial/crop-refinements.json
# Rascunho de OCR opcional no Windows, nunca aprovação editorial.
powershell.exe -NoProfile -File scripts/memorial/ocr-draft.ps1
# Após conferência das transcrições e dos ativos gráficos:
python scripts/memorial/reconstruct-faces.py
python scripts/memorial/review-faces.py

npm run typecheck
npm test -- --maxWorkers=1
$env:NODE_OPTIONS='--max-old-space-size=4096'
npm run build
node scripts/memorial/bundle-audit.mjs
# Fixture independente; não é rota publicada nem prova de sessão real.
npx vite --config scripts/memorial/qa.vite.config.ts
```

Os scripts de imagem usam Pillow, NumPy e OpenCV; as fontes locais do Windows são referências de rasterização e não são distribuídas. Os WebPs finais estão versionados e não exigem esses programas em produção. A fixture suporta `webgl=off`, `motion=reduce`, `media=fail` e `media=slow` (128 KiB/s e 500 ms de latência simulados). O botão de perda de contexto pertence somente à fixture.

Resultados executados e limites de dispositivos estão em [validation.md](validation.md); a revisão visual está em [design-qa.md](design-qa.md). PR e checks locais não representam deploy ou homologação em aparelho físico.
