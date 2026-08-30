# Limpeza estrutural do Mapa Comercial — remoção dos blocos não permanentes

## Diagnóstico verificado

O mapa 3D renderiza exclusivamente as entidades persistidas no banco (projeto cartográfico 2026.4). Consultei o inventário atual e localizei, por identificador e por equivalência semântica, todos os itens citados:

Sanitários (classificação RESTROOM, camada de sanitários): E-01 a E-26 — 26 pontos, todos com o nome "Sanitários". A lista do pedido cita E01, E2, E5, E9, E10, E11, E12, E13, E15 e "todos os banheiros e sanitários", então a remoção cobre a série E completa.

Estruturas nominais encontradas:

| Pedido | Entidade no mapa |
|---|---|
| Módulo Fenasoja 60 anos | B14 — Módulo Fenasoja 60 anos (Prefeitura / Câmara / TVs) |
| Fenasoja Store | B16 — Fenasoja Store / Informações |
| Polícia Civil | B17 — Polícia Civil / Sala Lilás |
| 19 / RC MEC | B21 — 19º RC MEC |
| Ambulatório | B23 |
| Corpo de Bombeiros | B24 |
| Comissão de Logística | B25 |
| Comissão de Gastronomia | B26 |
| Catering Bebidas | B27 — Ketten Bebidas |
| Polícia Penal | B31 |
| Expo BM | B32 |
| ACISAP | B33 |
| Tomeleiro | B34 — Tomelero |
| Espaço Institucional Emater Ascar | B40 |
| Caminhos da Soja Emater Ascar | B39 |

Total: 26 sanitários + 15 estruturas = 41 entidades. Nada além disso entra na operação.

Premissa a confirmar durante a execução: "Catering Bebidas" é lido como B27 Ketten Bebidas (única entidade de bebidas do parque). Se não for essa a intenção, basta avisar e retiro B27 da lista.

## O que será feito

1. **Arquivamento seguro (não exclusão física)**: cada uma das 41 entidades passa a `is_archived = true`, junto com suas geometrias correntes desativadas. Isso remove volume 3D, marcador, haste, rótulo e área clicável de uma só vez, mantendo histórico auditável e permitindo reversão imediata.
2. **Proteção comercial**: a rotina só arquiva entidades sem lote comercial, contrato, reserva, negociação ou venda vinculada. Qualquer item nessa condição é ignorado e reportado.
3. **Base do terreno**: nenhuma alteração no terreno. As áreas liberadas voltam automaticamente à superfície verde/base padrão já existente sob as estruturas — não há recorte de terreno por entidade, então não sobram buracos nem manchas.
4. **Resíduos visuais**: os sanitários usam haste + pictograma + elevação de marcador derivados da própria entidade; ao arquivar, esses elementos deixam de ser montados. Verificarei que nenhum componente da cena instancia estruturas por lista fixa (fora dos dados), para garantir zero placa flutuante ou sombra fantasma.
5. **Rotina de validação**: teste automatizado que compara o inventário antes/depois e falha se qualquer entidade fora da lista das 41 mudar de estado, e que confirma que as 41 estão ausentes do payload do mapa. Inclui checagem de contagem de ruas, lotes, pavilhões e demais permanentes inalterados.

## Detalhes técnicos

- Migração SQL idempotente: `update map_entities set is_archived = true ... where public_identifier in (...)` restrito ao projeto 2026.4, com `map_entity_geometries.is_current` preservada para reversão, e registro em `map_activity_logs`.
- Ajuste da referência estática `officialReference2026.ts` para não recriar essas entidades numa futura sincronização oficial (marcadas como removidas da revisão vigente).
- Novo teste em `src/test/` validando a lista fechada de remoção e a integridade do restante do inventário; ajuste dos testes existentes que contam sanitários/estruturas.
- Validação visual com Playwright: desktop e mobile, visão geral, topo, isométrica e zoom nas áreas liberadas (Quadra B, entorno do Espaço Mirante, Alameda Gastronômica), confirmando solo verde contínuo e ausência de rótulos órfãos.
- Ganho de performance esperado: menos 41 volumes, marcadores e candidatos a rótulo; `frameloop="demand"` e orçamento de draw calls permanecem inalterados.

## Fora de escopo

Ruas, lotes, quadras, pavilhões, portões, estacionamentos, arena, vegetação, terreno, calibração, camadas e permissões permanecem exatamente como estão.
