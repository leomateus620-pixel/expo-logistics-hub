# Estacionamento posterior — relatório de implementação e validação

Data: **27/08/2026**
Escopo: setor posterior à Expo Rural, ao parque de diversões, ao Pavilhão 9 e ao Núcleo dos Criadores de Cavalos Crioulos.

## Resultado reconstruído

| Grupo | Blocos | Fileiras/lados | Símbolos de vaga traçados |
| --- | ---: | ---: | ---: |
| A | A1–A5 | 10 | 271 |
| B | B1–B32 | 58 | 1.290 |
| C | C01–C22 | 44 | 351 |
| **Total** | **59** | **112** | **1.912** |

Cada vaga possui ID determinístico no formato `rear-parking:<bloco>:<lado>:<sequência>`, além de bloco, fileira, centro, contorno e orientação editáveis. O estado operacional permanece `null`: a planta descreve a geometria, mas não comprova disponibilidade, ocupação ou regras comerciais em tempo real.

Foram reconstruídos os quatro perímetros funcionais do terreno, as faixas de circulação, a ligação transversal, a curva oeste de B, o recuo côncavo ao sul de B, as áreas gramadas internas, 32 marcações de entrada/saída/portão/bloqueio/restrição e quatro zonas `IDOSO` demonstradas nos anexos (C15, C01, B8 e B29), abrangendo 58 símbolos pelo critério explícito de centro dentro do quadro. Não foram acrescentadas vagas PCD, pedestres ou reservadas sem evidência.

## Referências e calibração

A hierarquia e as decisões de compatibilidade estão em [`parking-reference-matrix.md`](./parking-reference-matrix.md). A geometria deriva dos Anexos 4–6; o Anexo 7 orienta apenas terreno e vegetação; os Anexos 1–3 e o mapa existente controlam alinhamento e contexto.

Os sete arquivos originais foram conferidos localmente. A planta geral usada na digitalização é o arquivo de **4967 × 3509 px**, e não sua prévia reduzida. Seus SHA-256 são:

| Anexo | SHA-256 |
| --- | --- |
| 1 — `IMG_9815.png` | `27C44FA93F5C2A1A2EE26537D82B6D14E30869D6165FC9509D80B96B98A50364` |
| 2 — `IMG_9813.jpeg` | `C60C6E4ED9784080A280CA6EC6705AAFD3CE1B81D71274AEB0579D4189E60486` |
| 3 — `WhatsApp Image 2026-08-27 at 15.18.43.jpeg` | `E21F7A5862CFA547FB08D2513697B7E182EBD9F9B9219D9E32890F34C501F9BF` |
| 4 — `IMG_9808.jpeg` | `92DB7BBBE3EDF879E83D9FF64C4BD45553687FD6C77DBB8B32792D0D56EDCC3E` |
| 5 — `IMG_9811 (1).jpeg` | `580017E53FB8D49888AA852EB9AB87EDF2FA909F1794DC71EEAE3EB177898D36` |
| 6 — `IMG_9809 (1).jpeg` | `6576948A32C751664DE03AA9330A0B6CF43FF2D581D920CBD11157C982C95850` |
| 7 — `IMG_9816 (1).jpeg` | `2C49DDF4BD9E585497B868E014B1C7A925913652C61F7AB93B0A33818D01E700` |

A transformação da planta para o mapa é única e explícita: escala `1,35`, origem `[6760, 5290]` e rotação de 180° no espaço-fonte antes da projeção oficial. Pavilhão 9, Núcleo Crioulo e Pista Campeira são os três controles de referência. Os resíduos máximos desses controles permanecem abaixo de 7 m pela calibração métrica já adotada no mapa; isso prova coerência cartográfica interna, não precisão topográfica.

O satélite usa uma transformação de similaridade separada, ajustada por quatro referências reconhecíveis. Seu maior resíduo equivale a aproximadamente **4,30 m** na calibração local. Por isso, suas 32 observações de copa são tratadas como composição ambiental: 7 copas individuais e 25 lobos de dossel, nunca como inventário confirmado de árvores ou troncos.

## Arquitetura técnica

- **Dados:** fonte digitalizada, transformação, perímetros, operações, vegetação e apresentação ficam em módulos independentes. O mapa comercial não recebe coordenadas espalhadas por componentes.
- **Terreno:** superfícies de brita, terra compactada e grama usam uma família PBR procedural, com albedo e normal de 256², roughness alta, metalness zero, mipmaps, anisotropia limitada e transições suaves por borda.
- **Vagas e fileiras:** contornos exatos são agrupados em três lotes de marcação, um por grupo A/B/C, com uma quarta camada para zonas especiais. Não há uma malha ou elemento DOM por vaga.
- **Interação:** superfícies e camas de fileira resolvem o ponto selecionado por índice espacial; os IDs permanecem independentes da ordem de renderização. Labels são alinhados à tela e limitados progressivamente a 6 no desktop e 3 no mobile, além da seleção.
- **Vegetação:** as novas árvores entram no renderer instanciado já compartilhado, com reconciliação espacial contra árvores, fileiras e edificações existentes.
- **Câmera e UI:** presets de panorama, aéreo, traseiro, lateral e detalhe consideram o espaço ocupado pelo inspetor. O painel vira folha compacta no retrato e coluna lateral no paisagem, com safe areas e restauração de foco.
- **Contratos preservados:** rotas, autenticação, lotes, seleção comercial, IDs canônicos, Supabase e persistência não foram alterados. O retângulo genérico antigo do parque `J` é recortado somente na apresentação onde a planta comprova a faixa A; sua entidade e seus dados persistidos permanecem intactos.

Não foram instaladas dependências, ativado um composer de pós-processamento, importados modelos ou texturas externos, nem criado outro canvas. Os repositórios citados serviram como referências de técnica e qualidade, conforme a matriz.

## Otimizações e orçamento

- Três lotes de linhas para 1.912 vagas, um lote de zonas especiais e lotes pequenos para fileiras/operações.
- Materiais e geometrias exclusivos memoizados e descartados no desmontar; recursos compartilhados permanecem sob responsabilidade do cache existente.
- Texturas procedurais de 256², seis mapas no máximo e estimativa inferior a 2 MiB com mipmaps para essa camada.
- Índice espacial para seleção e reconciliação de obstáculos, bounds por grupo, frustum culling do renderer e `frameloop="demand"` preservado.
- Marcações com largura em tela, deduplicação e elevações/polygon offset separados para evitar z-fighting em vistas oblíquas.

## Validação executada

| Cobertura | Resultado |
| --- | --- |
| Testes focados de estacionamento, controles, renderização, viewport e árvores | **76/76 passaram** |
| TypeScript (`tsc --noEmit -p tsconfig.app.json`) | Passou |
| ESLint nos arquivos alterados | Passou |
| Build de produção (`npm.cmd run build`) | Passou; 5.059 módulos transformados |
| Suíte ampla `commercialMap` | **524 passaram; 3 falharam** |
| Aplicação autenticada no Chrome | Carregamento e inspeção concluídos, com dados persistidos reais presentes |

As três falhas da suíte ampla são dívidas reproduzidas na base sem este trabalho: seletor antigo `commercial-map-management` no teste de independência e duas expectativas antigas de histerese (`medium/near` e `near/detail`). Não foram mascaradas nem alteradas nesta entrega. O build mantém os avisos já existentes de chunks grandes (`CommercialMapPage` e vendor Three.js); a nova camada não adiciona dependência ao bundle.

Na aplicação real foram validados:

1. panorama completo, vista aérea, traseira e lateral;
2. distância média com blocos/fileiras/circulação e aproximação com vaga individual/material;
3. relação de A com Pavilhão 9, Crioulos e parque, e relação de B/C com Expo Rural e Pista Campeira;
4. seleção direta de vagas em A, B e C, inclusive `C15:E:007` em zona de idoso;
5. os 59 blocos no seletor, sem falha de navegação;
6. órbita, pan, zoom, gesto de um dedo e gesto de dois dedos sem perder a seleção;
7. desktop em aproximadamente 1344 × 900 CSS px, retrato em 390 × 844 e 360 × 799 CSS px, e paisagem em 844 × 390 CSS px;
8. mapa completo e rota `industria-comercio-servicos`, confirmando que o controle de estacionamento não vaza para o segmento industrial.
9. exclusividade entre inspetor e painel de camadas, e ocultação/restauração do estacionamento pela camada persistida `Estacionamentos` usando seus proprietários globais;
10. reenquadramento final de B29 após corrigir a abrangência do quadro `IDOSO`, sem duplicação das duas setas do corredor oeste de B.

Os logs da página ficaram sem erro da aplicação após recarga limpa. Permaneceram apenas avisos futuros do React Router e erros `M_ID` de uma extensão do Chrome, externos a esta mudança.

## Ambiguidades e limites

- O texto **“2.187 VAGAS”** impresso no Anexo 5 não define com segurança quais áreas entram no total. A entrega registra os **1.912 símbolos efetivamente rastreáveis** e não inventa as 275 vagas restantes.
- Os símbolos de C têm escala gráfica diferente dos símbolos de A/B no arquivo. Seus centros, ângulos e contornos visíveis foram preservados, mas não são declarados como dimensões operacionais aferidas.
- Portões, bloqueios, sentidos e restrição de conversão são apresentação da planta; implantação física e regras de tráfego exigem validação operacional.
- Não houve levantamento em campo, CAD vetorial georreferenciado, inventário arbóreo, medição em iPhone físico ou captura de FPS/GPU em hardware móvel. A validação móvel foi feita no Chrome autenticado com viewport e eventos de toque emulados.
- A aprovação topográfica e operacional deve substituir as interpretações registradas quando houver arquivo técnico vetorial ou levantamento de campo.
