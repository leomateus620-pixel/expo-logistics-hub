
## Diagnóstico
Do I know what the issue is? Sim.

O problema não está na permissão do formulário público em si. Pelo código atual:
- a rota pública já existe em `src/App.tsx` (`/f/mobilidade/:token`) e fica fora do `AuthGuard`
- as funções `resolve-public-link` e `submit-public-form` são públicas e não exigem login
- o erro acontece porque alguns links ainda estão usando host/fluxo errado e acabam caindo no app autenticado ou em uma build/domínio que não deve ser usada para acesso público

A imagem com `404` confirma que, em vez de abrir direto o formulário público, o usuário está entrando em um fluxo de rota incorreto e terminando no `NotFound`.

## Correção proposta
### 1. Blindar a origem pública dos links
Ajustar a lógica para que links de mobilidade sejam sempre gerados/copied com o domínio público oficial, nunca com preview/host interno.

Arquivo:
- `src/components/mobility/MobilityLinksPanel.tsx`

### 2. Forçar redirecionamento canônico para o domínio público
Adicionar uma proteção no próprio fluxo público para que, se alguém abrir `/f/mobilidade/:token` em host de preview/host interno, o app redirecione imediatamente para o domínio público correto com o mesmo token, antes de qualquer fluxo de login.

Arquivos:
- `src/App.tsx` ou um wrapper novo para rota pública
- possivelmente `src/pages/PublicMobilityFormPage.tsx` ou um helper compartilhado

### 3. Garantir que a rota pública nunca passe pelo login
Revisar a montagem da rota pública para manter o formulário totalmente isolado do app autenticado e evitar qualquer fallback indevido para `AuthGuard`/`LoginPage`.

Arquivos:
- `src/App.tsx`
- `src/components/AuthGuard.tsx` (apenas conferência; a ideia não é abrir o sistema inteiro, só preservar a rota pública)

### 4. Manter o backend público como está
Não vou mexer em autenticação do sistema para “liberar tudo”. O correto é:
- manter o sistema interno protegido
- deixar apenas os links `/f/mobilidade/:token` públicos e funcionais

Arquivos conferidos:
- `supabase/functions/resolve-public-link/index.ts`
- `supabase/functions/submit-public-form/index.ts`

### 5. Validar os 29 links end to end
Depois da correção, verificar:
- abrir link público sem login
- carregar comissão correta
- não cair em login
- não cair em 404
- testar envio do formulário público
- conferir que os 29 links copiados usam somente o domínio público oficial

Se algum token antigo tiver sido distribuído com host errado e não puder ser reaproveitado com segurança, farei uma rodada única controlada para recopiá-los no formato final correto.

## Resultado esperado
- qualquer pessoa que clicar no link público abre diretamente o formulário
- nenhum link de comissão pede login
- nenhum link termina em `404`
- os 29 links passam a ser distribuídos no domínio público correto
- o sistema interno continua protegido, mas o formulário público funciona para todos

## Arquivos que vou ajustar
- `src/components/mobility/MobilityLinksPanel.tsx`
- `src/App.tsx`
- `src/pages/PublicMobilityFormPage.tsx` ou um wrapper/helper novo para domínio público

## Observação importante
Se os links antigos estiverem em host de preview/interno, eu não vou “abrir” esse host inteiro ao público. A correção certa é fazer o fluxo público apontar e permanecer no domínio publicado oficial, que é o que realmente deve ser acessível sem login.
