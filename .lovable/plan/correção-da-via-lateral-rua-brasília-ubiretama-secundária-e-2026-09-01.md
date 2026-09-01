# Correção da via lateral (Rua Brasília), Ubiretama secundária e trevo do Portão 5

## O que está errado hoje

- A via nova desce pelo lado errado: o eixo gerado nasce bem a leste (junto à Arena) e depois corre para oeste até a Rua Uruguai Leste. A referência mostra a via nascendo da rua transversal **à direita (leste) do Centro de Eventos Fenasoja** (bloco C1, faixa 4020–4490) e descendo para o sul.
- A Rua Ubiretama foi transformada no eixo principal contínuo; na realidade ela é apenas transversal e **encosta na via principal pouco antes do Portão 5**.
- O Portão 5 hoje tem três rampas (norte, centro e sul). O anexo 3 mostra um **Y simples**: tronco único descendo, duas rampas abrindo para a rodovia e uma **cancela amarela** atravessando a pista antes da bifurcação.

## Resultado esperado

```text
rua transversal norte
        │  (leste do Centro de Eventos)
        ▼
   via principal "Rua Brasília" desce
        ╰── curva para dentro do estacionamento
                 │
                 ▼  desce reto
   Rua Ubiretama ─┤  (entra apenas aqui, pouco antes do portão)
                 ▼
             Portão 5
                 │ cancela
                ╱ ╲  rampas em Y
            BR-472
```

## Implementação

### 1. Reposicionar a via principal
- Novo eixo iniciando na rua transversal norte, imediatamente a leste do Centro de Eventos, descendo pelo corredor livre entre o bloco e o bosque/pátio.
- Curva ampla para dentro do estacionamento posterior e, depois dela, trecho reto em direção ao sul até o acesso do Portão 5 — sem o desvio atual para oeste.
- Identidade da via: **Rua Brasília** (busca, seleção e legenda), agora com o traçado correto e uma única superfície de asfalto.

### 2. Rebaixar a Rua Ubiretama a via transversal
- Ubiretama volta a ser um eixo próprio, encerrando numa interseção em T com a via principal **pouco antes do Portão 5**; deixa de conter o trecho longitudinal e a curva do estacionamento.
- Grafo atualizado: o caminho até o A5 passa pela via principal; Ubiretama entra como ramo lateral.

### 3. Portão 5 e trevo conforme o anexo 3
- Substituir as três rampas atuais por um **Y de duas rampas** simétricas partindo do tronco de acesso até a BR-472.
- Manter tronco único a montante, com **cancela amarela** transversal antes da bifurcação, alinhada à tangente da pista.
- Reposicionar/rotacionar a estrutura física do portão para o novo eixo de chegada; entidade cadastral `A5` permanece intacta.

### 4. Integração espacial
- Recalcular recortes de terreno, corredores livres de árvores e postes, e faixas de estacionamento efetivamente atravessadas.
- Nenhuma edificação, quadra, pátio pavimentado (ex-campo) ou fileira de vagas não atravessada pode ser alterada.

## Detalhes técnicos

- `utils/rearSpatialCalibration.ts`: novos eixos (`brasiliaLateralDescida`, curva do estacionamento, reta final ao A5), remoção do eixo Ubiretama longitudinal, anchors do trevo reduzidos a duas rampas.
- `data/rearParkRoadNetwork.ts`: nós e segmentos reescritos, owner `RUA-BRASILIA` na via principal, Ubiretama como segmento transversal em T, `gate5-internal-approach` recebendo a reta final.
- `data/rearRoadExclusions.ts`: liberar contato somente nas fileiras de estacionamento atravessadas pelo novo traçado.
- Componente do Portão 5: geometria em Y, cancela e orientação nova.
- `data/rearParkEnvironment.ts` / integração de solo: regenerar árvores, postes e recortes pelo novo footprint.

## Validação

- Testes de colisão zerados contra C1, D3, lotes, quadras, Arena, postes e pátio pavimentado.
- Testes de topologia: Ubiretama com grau de T (não principal); rota Rua Brasília → Portão 5 → BR-472 contínua.
- Teste de ausência total do traçado antigo (procedural e cadastral) e de restauração do terreno.
- Verificação visual via Playwright em vista superior e oblíqua (desktop e mobile), sem erros de console.
