# Mapa comercial nos espaços das comissões (Indústria, Expo Rural, Espaço do Automóvel)

## O que já foi confirmado
- **Elton (Espaço do Automóvel)** e **Felipe Bortoli / Felipe Carpenedo Gabriel (Indústria)**: não têm nenhuma permissão de mapa, só Agenda. O menu Mapa Comercial nunca aparece para eles.
- **Germano Tessmer Büttow (Expo Rural)**: já tem a permissão da Expo Rural, mas o mapa não carrega. A causa ainda não está confirmada. A suspeita principal é a conferência de quantidade de lotes do segmento, que continua esperando o cadastro antigo (95 lotes). Depois da revisão de 2028 e da área de 568,78 m², a Expo Rural passou a ter 101 lotes ativos, e essa diferença pode fazer o mapa recusar os dados.
- **Espaço do Automóvel**: não existe portal de mapa para essa comissão. Hoje só a Expo Rural e a Indústria têm esse portal.

## O que será feito
1. **Reproduzir e isolar o problema.** Vou entrar como Germano e como um usuário da Indústria no ambiente de teste, registrar o erro exato e confirmar ou descartar a causa suspeita antes de corrigir.
2. **Corrigir o carregamento.** A conferência de quantidade passará a usar o cadastro ativo atual, levando em conta a revisão de 2028, a linhagem dos lotes e a área sem número. Assim o mapa abre sem aceitar vínculos quebrados.
3. **Criar o portal do Espaço do Automóvel.** Ele terá o mesmo padrão dos outros dois: login dedicado, menu "Mapa Comercial" e acesso limitado ao próprio segmento.
4. **Liberar os acessos certos:**
   - Elton: Espaço do Automóvel.
   - Os dois Felipes: Indústria, Comércio e Serviços. Vou confirmar com você qual Felipe é o correto, ou se são os dois.
   - Germano: mantém a Expo Rural.
   - Todos continuam sem vendas, edição, dashboard e financeiro. O acesso é só de visualização.
5. **O que cada comissão vai ver:**
   - Lotes do próprio segmento com área oficial, situação nas quatro cores e preços 2028 de Renovação e 2ª Etapa, vindos da mesma fonte do mapa comercial normal, incluindo edições manuais de preço.
   - Modo visita com o parque inteiro. Os lotes de outros segmentos aparecem apagados, sem clique, ficha, busca ou preço. Por exemplo, a Expo Rural não seleciona lotes da Indústria, e a Indústria não seleciona lotes da Expo Rural.
   - A trava também vale no servidor: a leitura de preços e de lotes recusa lotes fora do segmento.
6. **Validar.** Vou entrar com cada um dos três perfis no computador e no celular e conferir que o menu aparece, o mapa carrega, os preços batem com o mapa normal, lotes de outros segmentos ficam bloqueados e o modo visita funciona. Vou rodar os testes e a compilação. Nada será publicado sem o seu pedido.

## Detalhes técnicos
- Diagnóstico: `get_commission_map_segment_inventory` usa `map_segment_baseline_count(boundary_data)` mais o delta de linhagem. O cliente compara esse valor em `isCommissionInventoryConsistent`. Primeiro vou comparar esse valor com a contagem real do segmento `exporural`.
- Portal novo em `commissionMapPortalRegistry.ts` com a capability `espaco_automovel_access` e o segmento `COMMERCIAL_MAP_SEGMENT_IDS.automotive`. Vou incluí-lo em `resolveMapPermissions` e em `map_can_access_segment`/RLS por meio de uma migração idempotente.
- A leitura de preços por comissão será feita pela view canônica `commercial_lot_pricing_2028`, filtrada pelo segmento no servidor.
- O bloqueio de seleção fora do escopo vai reutilizar o padrão de `canInspectLot`, que já existe nos links públicos.
- As permissões serão concedidas em `user_capabilities`, sem mudar o papel `leitura`.
