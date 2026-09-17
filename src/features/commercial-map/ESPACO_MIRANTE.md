# D3 — Espaço Mirante

Este documento delimita a fonte de verdade e o contrato paramétrico do ativo
arquitetônico de D3 e do conjunto imediato (estrutura lateral coberta, passeio
de Rua Brasília, pátio sul e faixa de grama). A cartografia oficial continua
sendo a autoridade para identidade, metadados, seleção e edição.
`miranteComplexReconstruction.ts` substitui, só na apresentação, o retângulo
genérico do PDF por uma implantação registrada no satélite. `utils/mirante.ts`
deriva a reconstrução visual determinística desse footprint.

As unidades do mapa **não estão calibradas em metros**. Razões e dimensões
abaixo são conservadoras para representação visual; não constituem levantamento
cadastral, projeto estrutural, laudo de acessibilidade ou certificação de
conformidade.

## Contrato oficial preservado

- Entidade de referência: `reference:2026:d3`
- Identificador público: `D3`
- Nome oficial: `Espaço Mirante`
- Classificação: `ATTRACTION`
- Camada: `reference:structures`
- Revisão da fonte: `2026.3`
- Revisão da reconstrução: `2026.9-mirante-complex-satellite.2`
- Verificação: `NEEDS_REVIEW`
- Elevação cartográfica: `0`
- Rotação persistida: `0`
- Extrusão visual: `1.16` (cumeeira no patamar da Via Expressa)
- Footprint PDF reconstruído: `[4004, 2440]–[4072, 2748]`
- Patamar norte (PDF): `[4004, 2440]–[4072, 2480]`
- Âncoras fixas: borda leste de Rua Brasília (`3988`), borda norte de Rua
  Brasil (`3106`) e borda sul da Quadra R (`2440`)
- Confiança registrada: `reference_registered_estimate`
- Medidas oficiais registradas: `false`

O renderer deve resolver o ativo por `publicIdentifier === "D3"`, mesmo quando
o `id` real for um UUID do banco. A reconstrução não cria entidade comercial
nova e não altera a malha viária canônica.

## Evidência, inferência e limites

| Característica | Estado | Base da decisão | Regra de implementação |
|---|---|---|---|
| Eixo longo no Z, recuado da via | Verificado | Satélite (anexo 2) e âncoras de Rua Brasília / Quadra R | Substituir o retângulo oficial ~27 % mais longo e ~60 % mais fundo |
| Deck contínuo com o passeio | Verificado visualmente | Fotos 7, 9 e 10 | `sidewalk`, `apron` e `deck` compartilham a cota `0.178`; o meio-fio é a queda até a via |
| Escada de descida na ponta norte | Verificado | Fotos do patamar (tátil amarelo, muro à direita) | Lance estreito virado em `+X` entre a cerca e o muro, do patamar de chão ao deck |
| Estrutura lateral coberta ao sul | Verificado | Anexos 2, 7 e 10 | Fascia clara, apoios pretos em V, parede cega no norte, laje fina no terraço |
| Faixa de grama junto a Rua Brasil | Verificado | Anexos 2 e 8 | Recuar a laje da praça; o terreno natural ocupa `[4092, 2958]–[4660, 3096]` |
| Bancos voltados à Arena | Verificado visualmente | Foto 8 | Módulos vermelhos no bordo leste; sem mesas genéricas |
| Altura visual de um pavimento | Verificado contra pares | Via Expressa (cumeeira 1.16) e telhado da Alameda | `miranteVisualHeight` ≈ `1.16`; deck permanece no passeio `0.178` |
| Rampa leste independente | Rejeitado | O satélite e as fotos não mostram rampa própria em `+X` | Acesso leste = terraço contínuo + escadaria da Arena |

## Relação cartográfica e acesso

A implantação reconstruída, de norte a sul ao longo de Rua Brasília:

1. patamar de chão e escada norte virada em `+X`, na fronteira com a Exporural;
2. plataforma coberta do Espaço Mirante;
3. estrutura lateral coberta (parede norte encostada ao Mirante);
4. pátio pavimentado (“Calçada”) até Rua Brasil;
5. faixa de grama a leste do pátio, até o trecho que desce ao Portão 5.

A escadaria da Arena parte do terraço leste (`x = 4092`) e desce para o apron.
B16 e B17 passam a salas sob a cobertura lateral na inventário cartográfico;
não geram entidade selecionável nova e permanecem fora das métricas comerciais.

## Contrato paramétrico

`createMiranteLayout` deriva, para o footprint reconstruído:

- altura visual ≈ `1.16 un` (cumeeira; eave ≈ `0.95–1.00`);
- topo da plataforma = cota do passeio / terraço da Arena;
- cobertura de duas águas de pavilhão, maior que o footprint;
- vãos estruturais ao longo da plataforma coberta (a ponta `-Z` é o patamar);
- corredor longitudinal oeste contínuo;
- bancos no bordo leste, voltados à Arena;
- escada norte estreita, `rotationY = −π/2`, correndo em `+X` até `exporuralGround`.

Campos de alto nível:

- `platform`: laje da plataforma coberta (não inclui o patamar de chão);
- `base`: contenção sob o deck;
- `roof`, `structure`, `railings`, `aisle`;
- `access.descentStairs`: lance virado na face norte;
- `access.landing`: patamar de chão com tátil;
- `furniture`: bancos;
- `service`: quiosque sul, junto à parede da estrutura lateral.

`createArenaAccessLayout` reconstrói a estrutura lateral no mesmo terraço, com
`sideWallEnd: 'north'` e cinco vãos em V. `MiranteComplexGrounds` desenha
passeio, pátio, meio-fio e piso tátil.

## Orientação para a Arena

`miranteArenaFacingDirection` calcula a direção unitária entre centros de
entidade. A componente X permanece positiva. Esse ângulo orienta câmera e
bancos; não rotaciona o footprint.

## Orçamento de renderização

| Nível | Draw calls incrementais | Triângulos | Texturas | Materiais | Mobiliário |
|---|---:|---:|---:|---:|---:|
| Overview | `≤ 5` | `≤ 5.000` | `0` | `≤ 5` | nenhum |
| Médio | `≤ 12` | `≤ 20.000` | `≤ 2` | `≤ 8` | 2 grupos |
| Selecionado | `≤ 24` | `≤ 50.000` | `≤ 4` | `≤ 10` | 4 grupos |
| Interior | `≤ 30` | `≤ 80.000` | `≤ 4` | `≤ 12` | 4 grupos |
| Reduzido | `≤ 18` | `≤ 35.000` | `≤ 2` | `≤ 8` | 2 grupos |

- Apenas o proxy pai derivado do footprint participa do raycast principal.
- Pilares, treliças, guarda-corpos e bancos reutilizam geometrias instanciadas.
- A estrutura lateral e o passeio são apresentação ambiental, nunca lote.

## Interação e validação

- Seleção, hover, busca e edição continuam vinculados a uma única entidade D3.
- A estrutura lateral e o passeio ignoram o raycast primário.
- Os testes `commercialMapMirante.test.ts`,
  `commercialMapMiranteComplexReconstruction.test.ts` e
  `commercialMapArenaAccessStructure.test.ts` fixam identidade, implantação,
  terraço, escada norte, vãos em V e budgets.

## Referências

### Arquitetura, circulação e estrutura

- [Lista oficial de expositores da Fenasoja](https://fenasoja.com.br/lista-de-expositores/)
- [ABNT NBR 9050:2020 — cópia institucional FADERS](https://faders.rs.gov.br/upload/arquivos/202208/31095657-abnt-nbr-9050-15-acessibilidade-a-edificacoes.pdf)
- [Manual Técnico de Telhas de Aço — ABCEM/CBCA](https://www.abcem.org.br/lib/php/_download.php?arq=produtos%2Fprod_20221106183617_manual-tecnico-telhas-de-aco_nov2022.pdf&now=0)
- [SteelConstruction.info — Trusses](https://steelconstruction.info/Trusses)

As normas são usadas somente como guardrails de representação. Sem escala
métrica validada, projeto original e vistoria, este modelo não declara
conformidade.
