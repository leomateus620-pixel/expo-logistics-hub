# Fazer o mapa comercial completo abrir para Felipe (validação com a conta real)

## O que já está confirmado
- A conta de Felipe (`bortoli.felipe@gmail.com`, papel leitura) já tem a permissão de consulta `map.view` na organização Fenasoja e entrou às 17:34 em fenasojagestao.com.
- Ele chega ao mapa completo, mas a carga falha ("Não foi possível sincronizar o mapa" / parada em "Estrutura do parque").
- As regras de leitura do banco permitem que ele veja projeto, camadas, áreas, geometrias, lotes e preços. Não há bloqueio de permissão explícito nessas tabelas.
- O endereço fenasojagestao.com roda a versão publicada. As mudanças desta conversa (nome do comprador, entrada pela comissão, tela de erro) ainda não estão publicadas.
- Os registros do servidor dos últimos minutos não estavam disponíveis para consulta, então a causa exata ainda não está provada.

## Hipótese principal (a confirmar no passo 1)
Para administradores, cada regra de leitura é aprovada logo na primeira checagem. Para Felipe, cada linha passa por várias checagens em sequência: papel, depois permissão explícita, além das regras de segmento da comissão. Isso se repete em cerca de 1.600 lotes e nos dados anexados a cada lote (preços, reservas, vendas, contratos e cálculo de preço 2028). A consulta pode estar passando do limite de 8 segundos do servidor e sendo cancelada. Para o usuário, isso aparece como falha de sincronização.

## Passos
1. **Reproduzir como Felipe, sem alterar nada:**
   - Rodar no banco, com a identidade dele e dentro de uma transação desfeita no final, as mesmas consultas da carga do mapa: projeto, camadas, áreas, geometrias, lotes com anexos e consulta de compradores.
   - Medir o tempo de cada uma e capturar o erro exato (tempo esgotado, permissão ou relação).
   - Abrir a sessão de Felipe no ambiente de testes, com o pedido de aprovação que aparece para você, e capturar no navegador a requisição que falha.
2. **Corrigir pela causa comprovada:**
   - Se for tempo esgotado: otimizar as regras de leitura do mapa para que a autorização da organização seja calculada uma vez por consulta, e não uma vez por linha. As regras de quem pode ver continuam iguais. Vale para lotes, preços, áreas, geometrias, camadas, calibração, regras e exceções de preço, e auditoria de esquinas.
   - Se for permissão em uma tabela específica: ajustar só a leitura daquela tabela para `map.view`, sem liberar escrita.
   - Se for o cálculo de preços 2028 anexado a cada lote: carregar os preços em uma consulta separada por projeto, em vez de anexá-los lote a lote.
3. **Erro claro no app:** guardar o código do erro real (tempo esgotado, permissão ou rede) e mostrar a mensagem certa, com "Tentar novamente" e "Voltar". Assim a falha não fica igual para todos os casos.
4. **Validar com a sessão de Felipe no ambiente de testes:**
   - Entrada pela comissão e pela URL direta, e recarregamento da página.
   - Mapa completo, pavilhões, lotes disponíveis, em andamento e vendidos, com o nome do comprador.
   - Sem botões de venda ou administração.
   - Celular, computador e a lista sem 3D.
   - Medir o tempo de carga antes e depois.
5. **Conferir outros perfis:** administrador e um membro de comissão sem `map.view` continuam como antes; os links públicos não mudam.
6. **Publicação:** a correção no banco vale na hora para fenasojagestao.com. As mudanças do app (entrada pela comissão, nome do comprador em andamento, tela de erro) só chegam ao endereço real depois de publicar. Só publico se você pedir.

## Detalhes técnicos
- Medição: `EXPLAIN (ANALYZE, BUFFERS)` com `request.jwt.claims` de `6dde1d6f-…` e `SET LOCAL ROLE authenticated`, em transação com `ROLLBACK`; `statement_timeout` do papel authenticated = 8s.
- Otimização provável: nova função `STABLE SECURITY DEFINER` `map_viewable_org_ids()` (orgs em que `can_view_commercial_map` é verdadeiro para `auth.uid()`). As políticas de SELECT passam de `can_view_commercial_map(p.org_id)` para `p.org_id IN (SELECT public.map_viewable_org_ids())`, avaliado uma vez por consulta. Mesma semântica; nada de escrita muda; uma migration rastreável com a política anterior registrada para reversão.
- Sessão real: `lovable auth-session --json --user 6dde1d6f-ee4a-4d49-ad4d-d20986d73515` (exige sua aprovação), usada só no Playwright local; o token não é exibido.
- Arquivos prováveis: nova migration, `commercialMapService.ts` (propagar código do erro e, se necessário, separar a carga de preços), `CommercialMapPage.tsx` (mensagem por tipo de falha) e testes.
