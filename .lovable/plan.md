# Links públicos no domínio mapafenasoja.com

## Situação atual (verificada)
- Os endereços copiados no painel "Interesse por áreas e lotes" usam o endereço do site aberto no momento (hoje fenasojagestao.com), no formato `/areas/<área>/<chave>`.
- mapafenasoja.com e www.mapafenasoja.com já estão conectados e ativos, mas **redirecionam para fenasojagestao.com**, porque fenasojagestao.com está marcado como domínio principal. Enquanto isso não mudar, o domínio novo não abre nada por conta própria.
- As chaves (tokens) e o escopo de cada link são validados no servidor e não dependem do domínio. Nenhuma chave precisa ser trocada.

## Ação necessária sua (uma vez)
Em Configurações do projeto → Domínios, no menu (⋯) de fenasojagestao.com, escolha **"Unset as primary"**. Sem isso, qualquer acesso a mapafenasoja.com volta para fenasojagestao.com. Eu não consigo alterar essa opção.

## O que vou implementar
1. **Endereço oficial dos links**: todos os links copiados/abertos no painel passam a sair sempre como `https://mapafenasoja.com/areas/<área>/<chave>`, independente de onde o gestor está logado.
2. **mapafenasoja.com só para mapas públicos**: nesse domínio, apenas `/areas/<área>/<chave>` funciona, sem login. Qualquer outra página (login, painel, cronograma, raiz) mostra uma tela simples "Link de mapa inválido ou ausente", sem expor o sistema interno. www.mapafenasoja.com é tratado igual.
3. **Desvincular de fenasojagestao.com**: quem abrir um link antigo `fenasojagestao.com/areas/...` é redirecionado automaticamente para o mesmo endereço em mapafenasoja.com (links já enviados continuam funcionando). O sistema interno em fenasojagestao.com segue igual.
4. **Sem login/cache indevido**: no domínio público não inicia tela de login, splash nem instalação do app interno; o mapa segue isolado ao escopo do link.

## Testes
- Testes automáticos: montagem do endereço oficial, regra de domínio (público x interno), redirecionamento de links antigos e bloqueio das demais páginas no domínio público.
- Conferência dos 11 links: cada chave responde no servidor com o escopo certo.
- Após você desmarcar o principal e publicar: abrir os links em mapafenasoja.com (desktop e celular) sem login e confirmar que um link antigo em fenasojagestao.com redireciona.

## Detalhes técnicos
- `publicMapOrigin()` passa a usar constante `https://mapafenasoja.com` (sobrescrevível por `VITE_PUBLIC_MAP_ORIGIN`; em preview/localhost mantém a origem atual para testes).
- Novo utilitário `isPublicMapHost(hostname)` (mapafenasoja.com, www.mapafenasoja.com). Em `App.tsx`, quando host público: renderiza apenas a rota `/areas/:slug/:token` + fallback, sem AuthProvider/splash/registro de service worker do app.
- Em host interno (fenasojagestao.com/www), rota `/areas/*` faz `window.location.replace` para mapafenasoja.com preservando caminho.
- Sem alterações em banco, RPCs, tokens, escopos ou demais rotas. Publicação só com seu pedido explícito.
