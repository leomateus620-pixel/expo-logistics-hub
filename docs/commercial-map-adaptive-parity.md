# Paridade do parque nos perfis técnicos

A orientação adicional de 22/09/2026 substitui a permissão anterior de reduzir vegetação e efeitos em equipamentos limitados. HIGH, MEDIUM e LOW preservam o inventário, posições, silhuetas, materiais, animações, dados e ações comerciais. O orçamento técnico fica separado do conteúdo canônico em `utils/executionPolicy.ts`.

## Auditoria e correção

O controlador adaptativo já escolhia `renderQualityTier`, porém apenas ambiente e chuva consumiam esse valor diretamente. A maior parte da arquitetura recebia a preferência legada `reducedGraphics`; outras camadas consultavam o store ou capacidades do dispositivo. Conectar todos esses caminhos ao tier teria introduzido remoção de conteúdo: árvores regionais (840 → 220), árvores secundárias, condutores elétricos, cabines e veículos, detalhes arquitetônicos, células de solo, partículas de chuva e efeitos lunares.

O boundary `Scene` agora fornece conteúdo canônico aos componentes. Os leitores independentes de `StrategicLandmarks` e os planejadores compartilhados de vegetação, acesso, solo e rede elétrica usam a mesma política. Os parâmetros legados permanecem aceitos para compatibilidade, mas não removem elementos. Os planos completo e reduzido de solo são idênticos, tanto fora quanto dentro da visita; não são criados planos adicionais para sustentar o personagem.

As árvores comerciais mantêm todos os IDs e os mesmos lóbulos, contato e sombras por perfil. O LOD por distância continua permitido e igual para todos os tiers; somente a frequência da consulta espacial muda. A vegetação regional mantém seus três lotes instanciados e 840 instâncias em todos os perfis. Chuva conserva gotas, respingos, escoamento e poças; o lançamento lunar conserva todas as partículas e a iluminação.

O compositor permanece ativo também durante navegação e caminhada, com os mesmos efeitos, ordem, SMAA, bloom e nitidez. Fallback direto continua reservado a preparação indisponível, interior ou recuperação de erro. O PMREM permanece em 128; isso elimina a antiga troca 128 → 64 que alterava chaves de programas PBR e coincidiu com o stall medido de 12,9 s na visita. A luz solar, materiais e compositor mantêm identidade ao trocar tier. Apenas o alvo da sombra muda de resolução, após a navegação repousar.

## Orçamento técnico preservado

| Perfil | Sombra | Consulta LOD | Atualização de superfícies molhadas |
| --- | ---: | ---: | ---: |
| LOW | 1024 | 10 Hz | 20 Hz |
| MEDIUM | 1536 | 15 Hz | 30 Hz |
| HIGH | 2048 | 20 Hz | 45 Hz |
| ULTRA | 4096 | 30 Hz | 60 Hz |

O único proprietário de DPR continua sendo `CommercialMapAdaptiveQualityController`. A escala de movimento é aplicada uma vez na borda do gesto, inclusive por sinal mutável do VisitMode; não existe `setState` por frame nem segundo proprietário. O piso de apresentação é 0,85 (ou DPR nativo menor), portanto o orçamento de pixels é um limite flexível quando necessário para preservar legibilidade. Na visita, os tetos permanecem 1,35 / 1,10 / 0,85. Mudanças estruturais de alvo de sombras aguardam repouso; o benchmark deve avaliar o custo de uma caminhada prolongada antes de alterar essa decisão.

Ficam preservados instancing, frustum culling, consultas espaciais limitadas, caches, demanda de frames, pausa em background, carregamento progressivo e ownership do Canvas. A política pública/escopo de autorização continua independente de hardware; nenhum perfil modifica permissões ou ações.

## Instrumentação e validação

Somente builds de diagnóstico aceitam `?qualityQa=HIGH`, `MEDIUM`, `LOW` ou `ULTRA` antes do primeiro mount. O evento no canvas `commercial-map-quality-test`, com `detail: { tier }`, permite alternar; `tier: null` restaura o estado capturado. Há teste de 20 alternâncias, resize e cleanup. Em produção o parâmetro é ignorado.

O canvas publica `data-commercial-map-inventory` com IDs canônicos/apresentados de entidades, lotes e árvores comerciais; inventários procedurais complementares são verificados pelos respectivos planos determinísticos. `data-commercial-map-execution`, atualizado no máximo a 1 Hz, registra tier lógico/aplicado, DPR, resolução real da sombra, política, última janela de frame time e contagens. Não cria timers paralelos.

`commercialMapExecutionParity.test.ts` compara conteúdo/IDs/posições entre perfis, planos de solo, condutores, chuva, lançamento lunar e efeitos. Os testes do compositor preservam a mesma instância e o caminho post durante movimento e 20 trocas; os do controlador verificam restauração da visita e única alteração de DPR na borda da caminhada. O relatório focado é `artifacts/adaptive-parity-focused.json`; o baseline amplo em `docs/validation/visit-mode/evidence/baseline-tests.json` permite separar falhas existentes.

Esses testes demonstram contratos e ciclo de vida, não equivalência perceptual ou FPS em hardware físico. Os screenshots nos mesmos pontos, startup A–E, 20 trocas de tier e métricas de renderer são responsabilidade da validação integrada. Resultados anteriores à política de paridade não certificam seu custo. Manter todo o conteúdo e efeitos pode elevar GPU/tempo inicial em relação ao antigo LOW; o ganho deve vir de preparação, cache, DPR moderado e agendamento, sem prometer 3 s ou 30–60 FPS antes das medições.
