

# Diagnóstico: Links Redirecionando para Login

## Causa Raiz
O site publicado em `fenasojalog.lovable.app` / `fenasojalog.com` está com uma **versão antiga do código** — anterior à adição da rota pública `/f/mobilidade/:token`. Por isso, todos os 29 links caem no catch-all `/*` que exige autenticação e mostra a tela de login.

**Prova:**
- A edge function `resolve-public-link` funciona perfeitamente (testada com token `0943b0f2...` → retornou "Agricultura, Soja e Derivados")
- O código-fonte em `App.tsx` linha 50 define a rota pública corretamente, ANTES do `AuthGuard`
- Ao acessar `fenasojalog.com/f/mobilidade/TOKEN` no navegador, o site mostra a tela de login — confirmando que o deploy publicado não tem essa rota

## Solução

### Passo 1 — Republicar o site
Você precisa clicar em **Publish → Update** no editor do Lovable para publicar a versão mais recente do frontend. Isso vai incluir a rota pública no deploy.

### Passo 2 — Nenhuma alteração de código necessária
O código está correto:
- Rota `/f/mobilidade/:token` está isolada fora do `AuthGuard`
- Edge functions `resolve-public-link` e `submit-public-form` funcionam
- O formulário público (`PublicMobilityFormPage`) está completo
- Os 29 links no banco estão ativos e com tokens válidos

## Ação necessária do usuário
Clicar no botão **Publish** (canto superior direito) → **Update** para atualizar o site publicado. Após isso, todos os 29 links passarão a exibir o formulário público diretamente, sem exigir login.

