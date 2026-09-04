# Remoção de 4 módulos não permanentes do Mapa Comercial

## O que foi verificado

Os quatro itens existem hoje no inventário do mapa (revisão 2026.4) e estão ativos:

| Pedido | Entidade | Situação atual |
|---|---|---|
| Módulo de Imprensa B15 | B15 — Imprensa | ativa |
| Monumento dos Voluntários B30 | B30 — Monumento do Voluntariado | ativa |
| Parque Infantil Sojinha B18 | B18 — Parque Infantil Sojinha | ativa |
| Módulo de Informações B42-02 | B42-02 — Módulo de Informações | ativa |

O B42-01 (mesmo nome, outro ponto do parque) **não** entra: só a instância 02 será removida.

## O que será feito

1. **Remoção visual dos quatro blocos**, pelo mesmo caminho já usado na limpeza anterior dos 41 itens não permanentes: as entidades entram na lista de removidos da referência oficial e passam a arquivadas no banco. Some o volume 3D, o marcador, a haste, o rótulo e a área clicável de uma vez só — de forma reversível.
2. **Nada muda embaixo deles**: o piso, o gramado, o asfalto e o paisagismo da Quadra A e do entorno permanecem exatamente como estão. Não há recorte de terreno por estrutura, então não sobram buracos nem manchas.
3. **Sem resíduos nem bugs de câmera**: os elementos que hoje se apoiam nesses blocos serão ajustados para não ficarem soltos no ar — em especial o poste elétrico que hoje é montado na fachada do B30 e os trechos de rede que o contornam (passam a apoio próprio no solo, sem alterar o traçado da rede). Também será garantido que clique, busca e enquadramento não tentem focar entidades inexistentes (nada de zoom perdido ou tela travada).
4. **Referências de traçado preservadas**: o recuo do apron do Portão 3 e a marcação dos estacionamentos usam o contorno oficial do B42-02/B15 apenas como medida cadastral. Essas medidas continuam válidas; só o modelo 3D deixa de ser desenhado.
5. **Validação**: testes atualizados para a nova lista fechada de removidos, checagem de que nenhum outro item mudou de estado, e conferência visual em desktop e mobile (visão geral, isométrica e zoom nas áreas liberadas).

## Detalhes técnicos

- `src/features/commercial-map/data/officialReference2026.ts`: incluir `B15`, `B18`, `B30`, `B42-02` em `NON_PERMANENT_REMOVED_IDENTIFIERS_2026` (passa de 41 para 45), mantendo-os em `OFFICIAL_REFERENCE_ENTITIES` para que cálculos cadastrais (parkAccess, rearParking, quadrasABEnvironment) sigam íntegros.
- `src/features/commercial-map/data/electricalInfrastructure.ts`: trocar o `mountMode: 'FACADE_POLE'` do `pole-ref-390` ancorado em `B30` por poste próprio e reavaliar as duas obstruções de vão que citam `B30`.
- `src/features/commercial-map/data/commercialMapSegments.ts` e `quadrasABEnvironment.ts`: retirar os identificadores das listas de membros de segmento/ambientação, ajustando as notas afetadas.
- Migração SQL idempotente marcando as quatro entidades como `is_archived = true` na revisão 2026.4, preservando geometrias para reversão e registrando em log de atividade; a rotina ignora qualquer item com lote/contrato vinculado e reporta.
- Testes: atualizar `src/test/commercialMapNonPermanentCleanup.test.ts` (contagens e amostra de permanentes, que hoje inclui B15 e B42-02) e os testes de segmentos/estacionamento/acesso impactados.

## Fora de escopo

Terreno, ruas, lotes, quadras, pavilhões, portões, estacionamentos, arena, vegetação, camadas e permissões permanecem inalterados.
