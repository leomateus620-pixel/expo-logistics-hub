# Endereço principal: fenasojagestao.com (sistema) e mapafenasoja.com (links públicos)

## Situação atual (verificada)
- Nenhum domínio está mais marcado como principal. Por isso a hospedagem não redireciona nada: fenasojagestao.com, www.fenasojagestao.com, mapafenasoja.com, www.mapafenasoja.com e o endereço técnico fenasoja-gestao.lovable.app abrem cada um sozinho.
- A hospedagem só permite um domínio principal. Se fenasojagestao.com voltar a ser principal, mapafenasoja.com volta a redirecionar para ele e os links públicos param. Por isso o redirecionamento certo precisa ser feito pelo próprio sistema, não pela configuração de domínio.
- O painel de publicação sempre mostra o endereço técnico .lovable.app como padrão. Isso é só um rótulo do painel e não muda para onde as pessoas vão.

## O que vou implementar
Regra de endereço aplicada assim que a página abre, antes de carregar o sistema:

```text
fenasoja-gestao.lovable.app/...        -> fenasojagestao.com/...
www.fenasojagestao.com/...             -> fenasojagestao.com/...
fenasojagestao.com/areas/...           -> mapafenasoja.com/areas/...   (já existe)
fenasoja-gestao.lovable.app/areas/...  -> mapafenasoja.com/areas/...
www.mapafenasoja.com/...               -> mapafenasoja.com/...
mapafenasoja.com/areas/<área>/<chave>  -> mapa público, sem login
mapafenasoja.com/(qualquer outra)      -> "Link de mapa inválido"
```

- Caminho, parâmetros e âncora são mantidos. Assim, login, convites, retorno do Google Agenda e links de e-mail continuam funcionando.
- O preview do editor (id-preview--…) e localhost ficam de fora, para os testes seguirem funcionando.
- Os e-mails e o retorno do Google Agenda já usam fenasojagestao.com. Nada muda neles.

## Testes
- Testes automáticos para cada linha da tabela acima, com e sem parâmetros, e confirmação de que o preview não redireciona.
- Depois de você pedir a publicação: conferir no ar os quatro domínios, o endereço .lovable.app e os 10 links públicos em mapafenasoja.com.

## Detalhes técnicos
- Troca de `legacyPublicLinkRedirect` por `resolveCanonicalRedirect(location)` em `publicMapHost.ts`. O endereço .lovable.app publicado fica numa constante (`fenasoja-gestao.lovable.app`).
- `main.tsx` usa essa função única e chama `window.location.replace` antes de renderizar ou registrar o service worker.
- Não mexe em banco, chaves, rotas nem configurações de domínio. Não publico sem pedido seu.
