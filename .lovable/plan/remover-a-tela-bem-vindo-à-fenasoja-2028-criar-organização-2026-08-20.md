# Remover a tela "Bem-vindo à Fenasoja 2028 / Criar Organização"

## O que está acontecendo

A tela do print vem de `CreateOrgPage`, exibida pelo `OrgGuard` sempre que a consulta de vínculo do usuário (`org_members`) não devolve um registro.

Verificações feitas:

1. O banco tem **uma única organização** ("Fenasoja 2026"). Nenhum usuário deveria criar organização — a tela é resíduo do template inicial.
2. Em `src/hooks/useCurrentOrg.ts`, a consulta trata **erro de rede igual a "sem vínculo"**: qualquer falha retorna `null`, apaga o org salvo no `localStorage` e o guard conclui que o usuário não tem organização.
3. A consulta só roda quando já existe `user`; enquanto a sessão ainda não hidratou, `isLoading` é `false` e `hasOrg` é `false`, então o guard renderiza direto a tela de criação.

No Safari isso aparece com muito mais frequência porque a restauração de sessão é mais lenta e o ITP/armazenamento restrito faz a primeira chamada falhar ou chegar sem token.

## Correção proposta

1. **Nunca mais exibir a criação de organização.** Remover `CreateOrgPage` do fluxo (rota/guard) — o sistema é de organização única.
2. **`OrgGuard` passa a ser resiliente:**
   - sessão ainda carregando ou consulta em andamento/erro recuperável → mantém o spinner e tenta de novo;
   - sem sessão → manda para o login, não para uma tela de cadastro;
   - usuário autenticado realmente sem vínculo → mensagem clara "Seu acesso ainda não foi liberado", com botão de voltar ao portal e sair — sem campo de criar organização.
3. **`useCurrentOrg` diferencia erro de ausência:** em falha de rede, lança o erro (react-query faz retry com backoff) em vez de retornar `null`, e **não apaga** o `org_id` salvo. O `localStorage` só é limpo quando a consulta confirma, com sucesso, que não há vínculo.
4. Acesso ao `localStorage` protegido por try/catch (Safari em navegação privada pode lançar exceção).

## Detalhes técnicos

- `src/hooks/useCurrentOrg.ts`: propagar `error` da query, `retry: 2`, expor `isError`; limpar `ORG_KEY` apenas em sucesso vazio; envolver `localStorage` em helpers seguros.
- `src/components/OrgGuard.tsx`: usar `isLoading || isError` para spinner/retry, redirecionar para login sem usuário, e renderizar o aviso de acesso pendente no lugar de `CreateOrgPage`.
- `src/pages/CreateOrgPage.tsx`: remover o arquivo (nenhum outro consumidor além do guard).
- Sem mudanças de banco, RLS ou permissões.

## Validação

- Abrir o sistema no Safari (iOS) logado e recarregar várias vezes: deve aparecer só o spinner e depois o portal — nunca "Criar Organização".
- Simular falha de rede na primeira chamada: o app deve tentar de novo, não cair na tela de cadastro.
- Usuário deslogado em `fenasojagestao.com`: vai para o login/portal.
