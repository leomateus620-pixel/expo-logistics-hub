## Configuração correta no Google Console

A integração do Google Agenda usa o callback seguro do Lovable Connector Gateway. Por isso, o domínio de redirecionamento **não deve ser o domínio do sistema**; ele precisa ser o gateway abaixo.

### 1. Authorized redirect URI

Adicione exatamente este URI em **Google Cloud Console → Google Auth Platform → Clients → Web client → URIs de redirecionamento autorizados**:

```text
https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback
```

Se você cadastrou uma versão cortada como `/callb`, corrija para o caminho completo acima.

### 2. Authorized JavaScript origins

Adicione estes origins em **Origens JavaScript autorizadas**:

```text
https://fenasojagestao.com
https://www.fenasojagestao.com
https://fenasoja-gestao.lovable.app
https://id-preview--756eeb64-0d44-4171-b445-f8a60f0492c0.lovable.app
```

Não inclua caminhos como `/cronograma-eventos`; aqui entram apenas esquema + domínio.

### 3. Authorized domains na tela de consentimento

Em **Branding / Tela de consentimento → Domínios autorizados**, deixe pelo menos:

```text
lovable.dev
fenasojagestao.com
lovable.app
```

Se o app também usa domínio institucional de logística, adicione:

```text
fenasojalog.com
```

### 4. Scopes necessários

Na configuração do app OAuth, confirme estes escopos:

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/calendar.events
```

## Plano para concluir

1. Você atualiza o Google Console com os URLs acima e salva.
2. Aguarda alguns minutos para propagação das alterações do OAuth.
3. Eu valido novamente o fluxo no sistema:
   - botão de conectar aparece;
   - janela Google abre corretamente;
   - callback retorna ao app;
   - widget sai de “Aguardando autorização”;
   - conexão fica como ativa;
   - calendário secundário “FENASOJA — Cronograma” é criado;
   - eventos pendentes são enviados ao Google Agenda.
4. Se ainda falhar, eu verifico logs e banco para identificar se o problema restante é credencial, sessão, callback ou sincronização de eventos.