# Malha viária contínua — corredores ausentes entre as quadras

## Diagnóstico verificado

Rodei uma análise geométrica sobre o inventário oficial (`officialReference2026.ts`) cruzando os limites de todas as quadras com todos os polígonos de via. Os trechos marcados em verde nos anexos correspondem exatamente aos corredores onde **não existe nenhuma entidade `ROAD`** — ou seja, não é um problema de material, ordem de camadas ou z-fighting: a rua simplesmente não existe no grafo.

Corredores transversais sem cobertura viária (0% de cobertura amostrada):

| Corredor | Faixa livre | Situação |
| --- | --- | --- |
| Quadra C ↔ Quadra B | x 14,62 → 25,31 · z 10,04 → 11,35 | continuação leste da Rua Uruguai, interrompida em x 12,87 |
| Quadra B ↔ Quadra A | x 14,62 → 25,31 · z 16,15 → 17,56 | continuação leste da Rua Argentina, interrompida em x 12,87 |

Corredores longitudinais sem cobertura (mesma origem do problema, aparecem nos anexos 2 e 4):

| Corredor | Faixa livre |
| --- | --- |
| Quadra M/G e Quadra L/F | x 2,44 · z −7,64 → 2,84 (continuação sul da Rua Montevidéu) |
| Quadra V/Q, U/P, T/O | x −24,40 · z −11,06 → 2,73 (eixo interno oeste) |

Todas essas faixas já estão reservadas entre os lotes — nenhuma quadra precisa ser reduzida, deslocada ou reinterpretada.

## O que será feito

1. **Fechar o grafo viário** acrescentando quatro corredores como entidades `ROAD` reais no inventário oficial, usando exatamente as faixas livres já reservadas:
   - `RUA-URUGUAI-LESTE` — continuação da Rua Uruguai até o estacionamento de expositores;
   - `RUA-ARGENTINA-LESTE` — continuação da Rua Argentina até o mesmo limite;
   - `RUA-MONTEVIDEU-SUL` — continuação sul da Rua Montevidéu até a Rua Bolívia;
   - `RUA-INTERNA-OESTE` — eixo entre as quadras V/Q, U/P e T/O.
2. **Continuidade nos encontros**: cada novo trecho encosta com sobreposição controlada nas vias existentes (Rua Brasília, Rua Brasil, Rua Bolívia, Rua Chile, Rua Paraguai, Rua Uruguai/Argentina atuais), de modo que o detector de conexões já existente gere as interseções automaticamente, sem costura, gap ou degrau.
3. **Acabamento idêntico às melhores ruas atuais**: por serem entidades de circulação normais, herdam o mesmo asfalto com microvariação, sarjeta, meio-fio interrompido nos cruzamentos e resposta de luz — sem “faixa desenhada” nem plano solto sobre o gramado.
4. **Sem invasão**: as larguras são derivadas das faixas livres medidas acima, com folga para não tocar em nenhum lote, poste ou árvore; nada da geometria comercial é alterado.
5. **Regressão automatizada**: estender `commercialMapRoadInfrastructure.test.ts` com um teste que percorre todos os pares de quadras vizinhas e falha se algum corredor livre ficar sem cobertura viária — assim o problema não volta. Os testes atuais de inventário (21 vias) são atualizados para o novo total.
6. **Validação visual**: capturas em vista aérea distante, vista média sobre as quadras A/B/C e vista rasante nos cruzamentos, desktop e mobile, conferindo cada linha verde dos anexos ponta a ponta.

## Detalhes técnicos

- Os corredores entram em `roadInputs` de `src/features/commercial-map/data/officialReference2026.ts`, em coordenadas do PDF oficial (derivadas por inversão de `officialPdfPointToLocal`): Uruguai leste `[3988, 3438, 4510, 3494]`, Argentina leste `[3988, 3716, 4510, 3780]`, Montevidéu sul `[3441, 2625, 3482, 3105]`, eixo oeste `[2222, 2468, 2243, 3100]` — mesmas bandas dos trechos já existentes, garantindo largura e alinhamento idênticos.
- Nada muda em `RoadInfrastructure.tsx` nem em `roadInfrastructure.ts`: a malha continua consolidada nos mesmos ≤5 draw calls por layer, com `NO_RAYCAST`, seleção pela busca/explorador e orçamento de triângulos. O teste de orçamento (<5.000 triângulos) é reavaliado e, se necessário, ajustado ao novo inventário sem afrouxar o limite de draw calls.
- Elevação `0`, extrusão `0,032` (padrão de asfalto) e `layer: circulation` — mesma faixa de altura das vias vizinhas, o que elimina z-fighting e enterro sob gramado por construção.
- A documentação `docs/MAPA_COMERCIAL_INFRAESTRUTURA_VIARIA_3D.md` é atualizada com o novo inventário e a regra de continuidade.
