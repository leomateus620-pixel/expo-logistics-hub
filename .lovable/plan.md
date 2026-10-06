# Acesso de Felipe Bortoli ao Mapa Comercial completo (somente consulta)

## Diagnóstico confirmado
- Conta única encontrada: `bortoli.felipe@gmail.com` (`6dde1d6f-…d73515`), último login hoje, membro da organização `985888b8-…99b` com papel `leitura`.
- Permissões atuais: `cronograma_eventos_access`, `cronograma_scoped_access`, `industria_comercio_servicos_access`. Não tem `map.view`.
- A regra de banco `can_view_commercial_map` libera admin/gestor/operador **ou** `map.view` explícito. Felipe (leitura, sem `map.view`) só alcança o mapa travado da comissão (`/comissoes/industria-comercio-servicos/mapa-comercial`), nunca o mapa normal `/mapa-comercial`.
- Nome do comprador: `commercialMapService.ts` preenche `currentBuyer` apenas com venda `CONFIRMED`; venda `OPEN` define a situação, mas o nome não aparece (cai para reserva/negociação ou vazio).
- O catálogo oficial usa `industria-comercio-e-servicos`, o portal usa `industria-comercio-servicos`.

## O que será feito
1. **Concessão mínima (precisa da sua confirmação na implementação):** inserir somente `map.view` para a conta acima, na organização acima. Nada de admin, gestor, full_access, map.admin ou map.manage_sales. Outros membros da comissão não mudam.
2. **Entrada pelo módulo:** quando o usuário tiver `map.view`, o card/menu da comissão Indústria, Comércio e Serviços leva direto a `/mapa-comercial` (mapa normal, sem segmento travado). Quem não tiver continua no mapa da comissão como hoje. Os dois identificadores (`-e-servicos` e `-servicos`) passam a resolver para o mesmo portal. Links antigos, retorno após login, recarregar e voltar/avançar preservados (redirecionamento com `replace`).
3. **Guard da rota `/mapa-comercial`:** verificar e alinhar com `map.view` (mesma regra do banco). Diferenciar "sem permissão" de "falha ao verificar" (erro de rede/consulta mostra tela recuperável com "Tentar novamente" e "Voltar ao módulo", sem loop).
4. **Somente leitura na interface e no servidor:** ações de venda, cancelamento, preço, contrato, pagamento e configuração continuam exigindo suas permissões próprias; conferir que as funções de escrita já validam `map.manage_sales`/`map.manage_contracts`/`map.admin` no servidor (sem mudança se confirmado).
5. **Nome do comprador com venda em andamento:**
   - Usar a venda vigente do lote: CONFIRMED → nome como vendido; OPEN → nome como "em negociação/venda em andamento"; CANCELLED ignorada; lote disponível sem nome.
   - Se houver mais de uma venda ativa incompatível no mesmo lote, marcar como inconsistente e não exibir nome escolhido ao acaso.
   - Exibido via `buyerDisplayName` (nome fantasia → razão social) no painel do lote, lista, busca e identificação contextual já existente; sem rótulos permanentes novos.
6. **Dados mínimos:** para quem só tem `map.view`, a carga do mapa passa a trazer do pedido apenas situação e nome de exibição — por uma função/visão de leitura no servidor que revalida `map.view` e devolve só `lot_id`, situação e nome. CPF/CNPJ, telefone, e-mail, parcelas, pagamentos e documentos ficam fora; as cargas de identidade e histórico de venda com esses campos só rodam para quem tem permissão de vendas. Links públicos não mudam (continuam com a regra própria SOLD + CONFIRMED).
7. **Alternativa sem 3D (lista):** mesma situação e nome, mesmas permissões.

## Validação
- Antes: revisão vigente do código e comparar no banco as funções/políticas de leitura de vendas e lotes com as migrations atuais (sem reaplicar nada).
- Testes automatizados: resolução de portal, redirecionamento por `map.view`, composição do comprador (OPEN, CONFIRMED, cancelada, disponível, conflito), guard com erro vs negado.
- Navegador com perfil equivalente (papel leitura + `map.view` em organização de teste ou sessão autorizada): card e URL direta, login/recarregar, pavilhões, estados, nomes, bloqueio de edição e dados pessoais, isolamento de outra organização, desktop e celular, lista.
- Só declarar "Felipe acessa" após comprovar o percurso com a conta real; se não for possível daqui, deixo explícito.

## Detalhes técnicos
- Arquivos previstos: `src/App.tsx` (guard `/mapa-comercial`), `src/pages/commissions/CommissionPortalPage.tsx` e/ou layout da comissão (redirecionamento), `commissionMapPortalRegistry.ts` (alias de slug), `commercialMapService.ts` (composição do comprador + carga reduzida), componentes de painel/lista/busca do mapa, nova migration com função `security definer` de leitura de nome/situação revalidando `map.view` e organização, testes em `src/test/`.
- Concessão: `insert into user_capabilities (user_id, org_id, capability) values ('6dde1d6f-…', '985888b8-…', 'map.view') on conflict do nothing` — executada só após sua confirmação.
- Registrar a regra de leitura separada da edição em `AGENTS.md`.
- Sem publicação.
