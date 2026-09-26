# Área comercial sem número de 568,78 m² — Expo Rural 2028

## Resultado esperado
- Integrar o espaço irregular desenhado no mapa oficial como um lote comercial disponível da Quadra R, acima do Mirante, sem inventar numeração e sem modificar as parcelas vizinhas.
- Mostrar sempre a área oficial de 568,78 m² e precificar Renovação a R$ 27,50/m² (R$ 15.641,45) e 2ª Etapa a R$ 30,25/m² (R$ 17.205,60), usando o cálculo central.

## Diagnóstico confirmado
- O registro de revisão 2028 guarda os 568,78 m² apenas como área sem número excluída, com destinação pendente; não há lote ativo de 568,78 m² nem polígono próprio dessa área no inventário comercial persistido. A exclusão explica a ausência no mapa, não um filtro isolado do desenho.
- A antiga Praça de Acesso à Exporural é uma entidade de via **arquivada** nas imediações; sua forma retangular não corresponde ao polígono oficial e não será reaproveitada nem desarquivada automaticamente. O Mirante é outra entidade ativa, separada.
- A visão de preços atual depende da numeração para casar faixas da Quadra R; o cadastro aceita número vazio. As regras cadastradas para a Quadra R incluem R$ 27,50/m² na Renovação de 01–12, mas a 2ª Etapa está em R$ 30,00/m², diferente dos R$ 30,25/m² solicitados. Não alterar silenciosamente as demais parcelas: o novo espaço terá associação explícita e auditável à faixa aprovada.
- Um registro anterior de acompanhamento chamou os 568,78 m² de “via”, enquanto o relatório cartográfico os deixava com destinação pendente. Esta autorização específica substitui essa classificação **somente para este polígono**, sem modificar vias existentes.

## Implementação
1. Delinear a forma assimétrica diretamente nas imagens oficiais de alta resolução, converter com a calibração existente, confrontar o recuo, a diagonal e os limites com os lotes 03/04 e 20–22, Mirante e vias. Medir interseções e preservar distância/acesso; recusar aplicação se houver invasão ou geometria inválida.
2. Auditar novamente a região e vínculos comerciais imediatamente antes da escrita. Criar uma migração idempotente, restrita ao projeto/segmento Expo Rural, com identificador **técnico** estável, entidade SELLABLE_LOT, geometria versionada, lote AVAILABLE, `lot_number = NULL`, área oficial 568,78 e histórico/snapshot pertinentes. Se a auditoria revelar uma entidade física existente para a mesma área ou negócio vinculado, reconciliar sua identidade antes de criar qualquer registro; não duplicar nem apagar. Não tocar no Mirante, na antiga praça arquivada, vias ou lotes vizinhos.
3. Resolver as duas etapas na fonte canônica de precificação por uma associação explícita de grupo/faixa comercial para **esse lote**, independente de `lot_number`; reutilizar as taxas aprovadas e o arredondamento monetário do motor existente. Confirmar elegibilidade no servidor e não alterar as regras/preços de outros lotes.
4. Ajustar apenas os pontos que pressupõem número obrigatório: identificação legível sem exibir ID técnico como número, ausência de rótulo no polígono enquanto null, painel, busca, carrinho, revisão e links públicos. Manter edição administrativa do número com permissão/histórico e permitir apagá-lo novamente; número futuro não deve perder a faixa de preço explícita. Reutilizar o fluxo existente de status, venda, expositor/logo, dashboard, relatórios e exportações.

## Validação e limites
- Conferir na base uma única entidade/lote ativo com 568,78 m², número nulo, categoria/segmento corretos, geometria válida e sem interseções indevidas; comparar contagem, IDs, área e versões dos vizinhos antes/depois. Atualizar asserções/documentação que hoje exigem a exclusão da parcela; a contagem comercial passa de 100 para 101 **somente após** confirmar o registro.
- Testar seleção, duas etapas e totais, multiseleção com outro lote, edição temporária da numeração e retorno a NULL; conferir dashboard, PDF/CSV e link público autorizado. No navegador, comparar com o recorte oficial em desktop/mobile, visão superior, zoom e rotação, nos modos normal/vendas, inspecionando z-fighting e oclusão.
- Não registrar venda fictícia na base oficial nem publicar. Se o teste de numeração em ambiente isolado não for possível, não alterar temporariamente dados oficiais apenas para simular: automatizar em fixture e relatar a limitação.

## Detalhes técnicos
- Fonte de imagem: anexos oficiais já disponíveis em alta resolução; área comercial persistida prevalece sobre área calculada do polígono. `public_identifier` é chave técnica não numérica, distinta de `lot_number` e de `display_name`.
- A migração nova não reescreve migrações históricas. A associação de preço deve operar na visão/RPC canônica e preservar snapshots de vendas; políticas existentes de autorização e isolamento de links públicos permanecem vigentes.
