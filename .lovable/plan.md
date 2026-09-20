# Links públicos sempre espelhando a versão oficial da área

Cada um dos dez endereços passa a ser uma janela viva sobre o Mapa Comercial oficial: o que for salvo e liberado no sistema aparece no link da área correspondente em até 30 segundos, sem gerar novo endereço, sem cadastro duplicado e sem expor nada interno.

## O que muda para quem usa

- Página aberta continua atualizando sozinha: preço, metragem, disponibilidade, identificação, geometria e infraestrutura.
- Lote novo no escopo aparece; lote arquivado, excluído ou movido para outra área some.
- Se o lote aberto sair de consulta, a ficha fecha com aviso claro ("Este lote não está mais disponível para consulta"), sem dados velhos.
- A câmera, o enquadramento e a seleção não se perdem em atualização; só reenquadra quando a geometria realmente muda.
- O mesmo link e a mesma chave continuam valendo para sempre.

## Como funciona (técnico)

### 1. Revisão por escopo no servidor
Nova RPC leve `public_map_scope_revision(_slug, _token)` (SECURITY DEFINER, `search_path` fixo), retornando apenas:
`revision` (hash estável do escopo), `lot_count`, `entity_revision`, `pricing_revision`, `asset_version`, `server_time`.

O hash é calculado sobre o escopo já autorizado, a partir de `max(updated_at)` + contagem de `map_entities`, `map_entity_geometries`, `commercial_lots` e da view `commercial_lot_pricing_2028`, mais `map_projects.active_version`. Nada de tabela interna exposta por Realtime; a única superfície pública continua sendo as RPCs com validação de token.

`public_map_inventory` passa a devolver o mesmo campo `revision`, para que metragem antiga nunca conviva com preço novo: se a revisão mudar no meio, o cliente refaz a consulta inteira.

### 2. Reconsulta no cliente
Novo hook `usePublicScopeRevision` em `src/features/commercial-map/public/`:
- Poll de 15 s da RPC de revisão (custo baixo, garante a defasagem máxima de 30 s).
- Revalida ao abrir o link, ao voltar para a aba (`visibilitychange`), ao recuperar conexão (`online`) e ao recuperar o foco.
- Pausa o poll com a aba oculta e retoma revalidando imediatamente.
- Quando a revisão muda, invalida `['public-map', slug, token, ...]` — inventário, geometria, preços, somatórios e ficha do lote — e refaz a leitura autorizada. Nenhum outro namespace de cache é tocado.

### 3. Continuidade da experiência
- `PublicAreaMapPage` recebe os novos dados por props; o `CommercialMapCanvas` não remonta (chaves de entidade estáveis e `keepPreviousData` na query).
- Seleção preservada por `lotId`; reenquadre somente se a geometria/bounds daquele lote mudarem.
- Lote fora do escopo após atualização: fecha a ficha com mensagem, limpa seleção, nunca busca em outra área.
- Atualização automática não dispara telemetria: `area_visit`, `lot_selected` e `lot_details_viewed` continuam presos a ação do visitante; o refresh silencioso não emite eventos.

### 4. Código, assets e publicação
- `asset_version` vem do build (`VITE_APP_BUILD_ID`) comparado ao servido; divergência mostra um aviso discreto "Nova versão disponível — atualizar", sem recarregar em cima da navegação do visitante.
- `public/sw.js`: `CACHE_VERSION` sobe e o escopo `/areas/` passa a ser sempre network-first, para que os links externos nunca fiquem presos numa versão visual antiga.
- A aplicação pública usa os mesmos componentes do mapa interno (já é o caso), então publicar o sistema publica também a experiência externa.

### 5. Validação
Com um link aberto, alterar em teste: preço, metragem, status, identificação, geometria, característica visual; criar, arquivar e transferir lote; derrubar e restaurar a conexão; publicar asset novo. Conferir em cada caso: chegada em ≤ 30 s, sem recarregar, sem vazamento entre áreas, sem perder seleção/câmera e sem visitas artificiais nas métricas.
Testes automatizados em `src/test/publicCommercialMap.test.ts`: mudança de revisão invalida o cache certo, refresh não gera telemetria, lote removido fecha a ficha, escopo continua isolado.

## Ordem de execução

1. Migração com `public_map_scope_revision` e `revision` no inventário.
2. Hook de revisão + invalidação por escopo.
3. Ajustes de continuidade na página pública e na ficha.
4. Versão de assets e service worker.
5. Testes e validação com link aberto.

Nada é publicado em produção sem seu pedido.
