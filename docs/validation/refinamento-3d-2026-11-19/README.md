# Refinamento 3D do Mapa Comercial

Base `d07328bcae072f0ab1d1d3c8456a6992afd95e20`. As três intervenções pertencem à apresentação do mapa. A montagem usa os polígonos e as entidades da mesma revisão, incluindo a planta interna de B8 e a apresentação unificada de C2/C3. A seleção continua a usar os alvos comerciais existentes.

## Capturas comparáveis

| Área | Vista | Antes | Depois |
| --- | --- | --- | --- |
| Pavilhão 5 | Fachada | [Imagem](captures/before-p5-frente.jpg) | [Imagem](captures/after-p5-frente.jpg) |
| Pavilhão 5 | Quina | [Imagem](captures/before-p5-quina.jpg) | [Imagem](captures/after-p5-quina.jpg) |
| Pavilhão 5 | Superior | [Imagem](captures/before-p5-topo.jpg) | [Imagem](captures/after-p5-topo.jpg) |
| Exporural | Vista baixa | [Imagem](captures/before-exporural-baixa.jpg) | [Imagem](captures/after-exporural-baixa.jpg) |
| Exporural | Oblíqua | [Imagem](captures/before-exporural-obliqua.jpg) | [Imagem](captures/after-exporural-obliqua.jpg) |
| Exporural | Superior | [Imagem](captures/before-exporural-topo.jpg) | [Imagem](captures/after-exporural-topo.jpg) |
| Arvoredo | Esquina | [Imagem](captures/before-arvoredo-esquina.jpg) | [Imagem](captures/after-arvoredo-esquina.jpg) |
| Arvoredo | Portal | [Imagem](captures/before-arvoredo-frente.jpg) | [Imagem](captures/after-arvoredo-frente.jpg) |
| Arvoredo | Tronco e bancos | [Imagem](captures/before-arvoredo-tronco.jpg) | [Imagem](captures/after-arvoredo-tronco.jpg) |
| Arvoredo | Superior | [Imagem](captures/before-arvoredo-topo.jpg) | [Imagem](captures/after-arvoredo-topo.jpg) |
| Arvoredo | Noite | [Imagem](captures/before-arvoredo-noite.jpg) | [Imagem](captures/after-arvoredo-noite.jpg) |
| Parque | Visão geral | [Imagem](captures/before-visao-geral.jpg) | [Imagem](captures/after-visao-geral.jpg) |
| Celular com perfil baixo | Pavilhão 5 | [Imagem](captures/before-mobile-p5-quina.jpg) | [Imagem](captures/after-mobile-p5-quina.jpg) |
| Celular com perfil baixo | Exporural | [Imagem](captures/before-mobile-exporural-baixa.jpg) | [Imagem](captures/after-mobile-exporural-baixa.jpg) |
| Celular com perfil baixo | Arvoredo | [Imagem](captures/before-mobile-arvoredo-esquina.jpg) | [Imagem](captures/after-mobile-arvoredo-esquina.jpg) |
| Celular com perfil baixo | Visão geral | [Imagem](captures/before-mobile-visao-geral.jpg) | [Imagem](captures/after-mobile-visao-geral.jpg) |

## Decisões a partir das fotografias

| Frente | Visível nas fotos | Estimado para a cena |
| --- | --- | --- |
| Pavilhão 5, IMG_1765 a IMG_1767 | Alvenaria clara, panos de venezianas, pilares escuros, empena muito baixa, três respiros, portão, porta lateral e chapa frisada localizada sob a identificação das Floriculturas. | Fachada no +Z voltada para a Rua Paraguai e empena documentada no +X. Inclinação, espessura, altura, ritmo dos vãos e desnível do terreno dimensionados em proporção aos acessos e ao polígono de B8. Portas fotografadas compõem o exterior. As referências de saída do corte e os 81 módulos vêm da planta oficial. |
| Árvore da Exporural, IMG_1764 | Tronco ligeiramente inclinado, abertura baixa, galhos laterais em alturas diferentes e copa ampla com trechos de céu visíveis. O aclive, a cerca e os postes contextualizam a foto. | Q-R-01 corresponde ao UUID `7cbfc7ab-a8fe-4643-ac8b-b9d2b2a63791` no replay. O pé permanece em `[8.625689, -18.94]`, na cota da superfície carregada. O poste 146 é a referência de alinhamento do cadastro anterior. Não há número de poste legível na foto. A abertura da copa e a distribuição dos galhos são estimativas cenográficas. |
| Arvoredo, IMG_1768, IMG_1769, IMG_1770, IMG_1772, IMG_1773 e IMG_1774 | Portal de madeira e letreiro vinho, bancos em X com cobertura ocre, globos opalinos, tronco baixo inclinado, sequência de canteiros, touceiras e fachada com pilares claros e esquadrias escuras. | A sequência e o giro dos móveis seguem a laje recortada pelas vias, os canteiros e a ligação ao Restaurante. O centro de `tree-j-05` em `[-12.96, 7.8982]` foi associado à árvore inclinada pela relação com o portal e a abertura existente. A posição exata dos móveis e o comprimento das coberturas foram deduzidos. O painel vazado usa o trecho persistido de C3. A placa central reproduz o nome da Calçada. |

A [planta de montagem](planta-arvoredo.svg) usa as posições retornadas pelo cálculo de implantação, com o eixo da Calçada paralelo à Alameda Mercosul. O portal marca a passagem fotografada e a seta indica a ligação pavimentada ao Restaurante. Os bancos se interrompem antes dos acessos e das aberturas das árvores.

### Encaixe do Pavilhão 5 com o terreno

O talude cenográfico da Exporural mede 0,245 unidade acima da base cadastral junto às duas portas na cena do replay. Com o patamar ativo, o exterior usa essa cota, o embasamento se estende até o solo e as soleiras acompanham a ligação com o passeio. O beiral e as empenas partem da mesma seção de cobertura. O enquadramento, o alvo de seleção e os limites verticais do Modo Visita acompanham a elevação do exterior.

No ajuste final, a altura visual da faixa frontal passou de 0,67 para 0,82 unidade acima do patamar, cerca de 23%. O beiral ficou a 0,64, a cumeeira a 0,77 e a inclinação a aproximadamente 3,3°. A revisão de escala foi aplicada somente ao B8. As cotas são da cena e foram conferidas em relação ao portão e aos volumes vizinhos.

A [planta interna](captures/after-p5-interior.jpg) mostra os 81 módulos, com a mesma cota e as três referências oficiais de acesso. As fachadas mostram o portão principal fotografado e a porta do lado +X.

### Verificações do navegador

- Seleção pelo Canvas, entrada e retorno do Pavilhão 5.
- Clique em Q-R-01 no Canvas e troca de detalhe do mesmo exemplar. O ponto carregado foi `[8.625689, 0.134, -18.94]`. O seletor de vegetação ocultou e restaurou a árvore.
- Uma representação de cada árvore de referência por vista, inclusive no perfil móvel `LOW`. O pé de `tree-j-05` corresponde ao canteiro existente.
- Doze globos no perfil de desktop, com emissão de 0 de dia e 0,46 à noite, usando o ambiente noturno já existente.
- Seleção do Restaurante e caminhada em primeira pessoa até a frente do edifício. A seleção retornou com a saída do Modo Visita. [Seleção](captures/after-restaurante-selecao.jpg) · [Modo Visita](captures/after-restaurante-visita.jpg)

## Desempenho

Chrome 157 e Apple M5 com ANGLE Metal, DPR 1. Desktop em 1440×900 com perfil `HIGH` e emulação móvel de 390×844 com perfil `LOW`. Cada par usa a mesma posição, alvo, FOV e perfil. O tempo de quadro foi amostrado pela execução normal por 2,05 s em cada pose. Chamadas e triângulos contam a cena primária com as sombras em cache. As medições representam o navegador local.

| Perfil e vista | Chamadas antes → depois | Triângulos antes → depois | Mediana antes → depois | p95 antes → depois |
| --- | ---: | ---: | ---: | ---: |
| HIGH · Quina do P5 | 274 → 276 | 403.879 → 405.911 | 16,7 → 16,7 ms | 16,7 → 16,7 ms |
| HIGH · Exporural baixa | 107 → 110 | 442.643 → 452.259 | 16,7 → 16,7 ms | 16,8 → 16,7 ms |
| HIGH · Esquina do Arvoredo | 215 → 229 | 361.551 → 377.371 | 16,7 → 16,7 ms | 16,8 → 16,7 ms |
| HIGH · Geral | 555 → 578 | 758.523 → 764.644 | 16,7 → 16,7 ms | 16,7 → 16,7 ms |
| LOW · Quina do P5 | 176 → 178 | 396.802 → 397.871 | 16,7 → 16,7 ms | 16,7 → 16,8 ms |
| LOW · Exporural baixa | 93 → 96 | 391.225 → 392.773 | 16,7 → 16,7 ms | 16,7 → 16,8 ms |
| LOW · Esquina do Arvoredo | 141 → 153 | 306.619 → 313.113 | 16,7 → 16,7 ms | 16,8 → 16,7 ms |
| LOW · Geral | 463 → 478 | 735.104 → 740.587 | 16,7 → 16,7 ms | 16,8 → 16,8 ms |

Na aproximação por rolagem, as três medianas ficaram em 16,7 ms. O p95 na esquina do Arvoredo ficou perto de 50 ms nas duas versões. Nas outras duas aproximações, ficou entre 16,7 e 16,8 ms. A rolagem foi feita com 22 eventos por vista, até o limite dos controles. Os recortes mais próximos foram medidos nas poses fixas da tabela.

Os tempos de inicialização registrados nos JSONs servem ao diagnóstico do replay em desenvolvimento. Eles incluem compilação do Vite e variam com o estado do cache.

[Desktop antes](before.json) · [Desktop depois](after.json) · [Celular antes](before-mobile.json) · [Celular depois](after-mobile.json)

## Testes

`npm run typecheck` e `npm run build` passaram. As dez suítes pertinentes passaram com 109 testes, incluindo a planta de B8, o encaixe da cobertura, a posição dos exemplares, a caminhada do Modo Visita e o LOD da vegetação.

Na suíte completa, o commit-base registrou 4.468 aprovações e 111 falhas. A versão final registrou 4.489 aprovações e 107 falhas. Houve 98 falhas em comum e nove casos que falharam só na rodada completa da versão final. Todos os nove passaram na repetição isolada, que aprovou os 59 testes dos arquivos correspondentes. [Comparação detalhada](test-comparison.json)

## Reprodução

As imagens e medições usam Chrome local, o Canvas real e o replay versionado da geometria da Exporural. A rota `/mapa-comercial` apresentou autenticação no navegador de teste. A validação usou dados de referência e o replay de implantação, sem acesso à sessão comercial atual.

```sh
npm run dev -- --config scripts/exporural/official-2026-10-20/review.vite.config.ts --host 127.0.0.1 --port 5198
QA_FUNCTIONAL=1 QA_PLAN=1 QA_APPROACH=1 node scripts/refinamento-3d/capture.cjs after
node scripts/refinamento-3d/capture.cjs after --mobile
```

O script usa Chrome com Playwright disponível. A variável `PLAYWRIGHT_MODULE` pode apontar para uma instalação local. Para repetir o antes, sirva o commit-base em outra porta e execute o mesmo script com `QA_URL` apontando para esse servidor, usando `before` e `before --mobile`.
