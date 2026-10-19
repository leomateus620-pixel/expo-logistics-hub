# Aplicar e validar a ocupação comercial dos pavilhões (PR #216)

## Estado conferido
- PR #216 já está no código (commit `0e969588`); arquivo `supabase/migrations/20261019180000_commercial_pavilion_occupancy.sql` presente (5.255 bytes).
- Banco do projeto (o mesmo usado pelo app): a função `commercial_pavilion_occupancy` ainda não existe.
- Histórico oficial aplicado até 0021; nenhuma outra pendência será tocada.

## Etapas
1. Ler a migração, `AGENTS.md` raiz e `src/features/commercial-map/AGENTS.md`; conferir que só cria a função de leitura (SECURITY INVOKER/DEFINER conforme o arquivo, sem alterar lotes, vendas, contratos ou geometria).
2. Registrar SHA-256 do arquivo e um snapshot de contagens (lotes, pedidos, itens, contratos, vendas) antes da aplicação.
3. Aplicar pela ferramenta oficial como 0022, com conteúdo idêntico (retirando apenas BEGIN/COMMIT, se houver — o executor já roda em transação). Interromper em qualquer erro.
4. Conferir após aplicação: função existe, assinatura `(uuid, uuid)`, permissões (sem anon), contagens idênticas ao snapshot.
5. Validar com dados reais (leitura apenas):
   - inventário completo do pavilhão comparado com `commercial_lots` (IDs, números, status, datas);
   - associações expositor/pedido/contrato/lote; parciais, legados (`LEGACY_UNVERIFIED`) e conflitos;
   - venda aberta com documento anexado continua aberta;
   - sessões reais: usuário só com `map.view` (sem referências contratuais), usuário com `map.manage_contracts`, anônimo e outra organização negados;
   - ausência de contato, documento, pagamento e URLs privadas no retorno.
6. Regerar tipos (a ferramenta já faz), rodar testes da Dashboard listados no workflow e typecheck/build.
7. Dashboard autenticada no navegador: etiquetas, ramificações, contornos por contrato, seleção, tela cheia e PDF; conferir PDF contra o mesmo retorno real.
8. Relatório com projeto, histórico, verificações, arquivos e cenários sem dados.

## Bloqueios possíveis
- Sessões autenticadas exigem contas reais: se não houver usuário com cada perfil (só leitura, gestão de contratos, outra organização), essas checagens ficarão pendentes e serão relatadas, sem simular.
- Nada é publicado sem pedido explícito.
