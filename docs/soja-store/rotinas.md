# Rotinas da Soja Store

O menu da loja usa as capacidades retornadas pelo banco. Produtos, Estoque e Caixa ficam em Operação. Fornecedores, Compras, Clientes e apoiadores, Financeiro da loja, Equipe e Configurações ficam em Gestão conforme o acesso. Agenda, Documentos e Tarefas continuam na área Comissão. O endereço antigo de Importações informa a indisponibilidade da área operacional.

## Clientes e apoiadores

A lista consulta o servidor por nome, cidade ou contato. A busca não vai para o histórico do navegador. O cadastro registra tipo, nome, cidade e canais de contato opcionais. A autorização para comunicações tem campo próprio, inicialmente desmarcado.

Cada interesse referencia uma variante do catálogo e pode indicar quantidade e observação. É possível editar ou encerrar o interesse. O servidor impede dois interesses em aberto para a mesma pessoa e variante. Registrar interesse não reserva estoque nem cria recebimento.

## Caixa e regra de atendimento

Em Caixa, abra uma sessão com ponto e fundo inicial, consulte a trilha de movimentos, registre suprimento ou sangria e feche a sessão com o valor contado. Informe motivo para suprimento, sangria, intervenção em sessão de outra pessoa ou diferença no fechamento. A conferência usa a versão da sessão apresentada e o servidor calcula o dinheiro esperado. Se a sessão mudou, carregue a versão atual.

Em Configurações, quem tem permissão de gestão de vendas pode registrar a referência da decisão aprovada e as formas de pagamento. A primeira configuração começa desabilitada. A autorização para habilitar a operação deve vir do documento responsável.

## Reservas, pagamentos e entregas

Em Vendas, selecione os produtos e, se houver cadastro, associe o cliente pelo nome ou cidade. A seleção é opcional. O atendimento de balcão pode confirmar o pagamento e a entrega numa transação. Para retirada posterior, registre a reserva e abra seu detalhe para registrar um ou mais pagamentos.

A reserva fica ativa por 24 horas até o primeiro pagamento confirmado. Cada pagamento usa o caixa aberto no ponto, é alocado ao mesmo título da venda e gera um comprovante interno numerado. A quantidade física permanece no estoque e fica reservada. Após o primeiro pagamento, a reserva permanece ativa até a conclusão. Ao quitar o valor, use **Confirmar entrega** para registrar a retirada e baixar o estoque. A entrega independe de o caixa que recebeu o valor continuar aberto.

Uma reserva sem pagamento pode ser cancelada com motivo. Ao vencer, ela pode ser liberada manualmente no detalhe ou pela rotina que processa um vencimento por minuto quando o agendador do banco está ativo. A liberação preserva a trilha e devolve a quantidade ao disponível. Reservas com pagamentos confirmados exigem conciliação antes do cancelamento. Os comprovantes internos registram o valor e, quando aplicável, o saldo pendente. A referência fiscal externa permanece em campo próprio.

## Equipe

A rota de Equipe mantém o cadastro institucional. Na seção Operação da equipe, registre a função no turno, o horário de Brasília e o ponto quando aplicável. O sistema evita turnos sobrepostos para a mesma pessoa. Registre conclusões de treinamento em uma lista própria com data civil.

Os registros referenciam pessoas já vinculadas à comissão. As alterações são versionadas e cancelamentos permanecem no histórico. O fluxo não cria novas contas nem altera os papéis institucionais.
