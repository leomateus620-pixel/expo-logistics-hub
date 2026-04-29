## Objetivo

Cada motorista da LOGÍSTICA passa a ter login próprio (Admin) com senha padrão única. O sistema já reconhece quem está logado para iniciar a viagem (graças ao isolamento por `motorista_user_id` + `tracking_device_id`), então basta cada um entrar com a própria conta para o GPS dele ser o usado.

## O que vai acontecer

### 1. Promoção a Admin (8 pessoas)

Promoção de `operador` → `admin` na organização:

| Nome | Email |
|---|---|
| LEONARDO MATEUS STROSCHEIN | leomateus620@gmail.com |
| LUCAS FRANKEN | lucas.franken@gmail.com |
| LUIS FERNANDO FURLANETTO | lffurla@gmail.com |
| MARCELO DE BAIRROS | marcelo.bairros84@gmail.com |
| MICAEL ARCANJO BÖCK | micael@fenasoja.com.br |
| RICARDO CARPENEDO CAETANO | ricardoccaetano@hotmail.com |
| RICARDO EMILIO ZIMMERMANN | ricardo@escritoriozimmermann.com.br |
| VLADIMIR ANTÔNIO MADALOSSO DA ROSA | vladi@fenasoja.com.br |

Eduardo Santos já é Admin — não muda.

### 2. Senha inicial padrão

**Senha: `Fenasoja@2026`** definida para todos os 8 acima.

Cada motorista entra com **email pessoal + Fenasoja@2026**, depois pode trocar em "Configurações → Minha Conta" se quiser. (Ela passa no HIBP Check porque mistura maiúscula/símbolo.)

### 3. Como o sistema "sabe" quem é o motorista

Já está pronto pelos ajustes anteriores:

- Ao iniciar o transporte, o GPS só é reivindicado pelo **primeiro `publish` do motorista designado** (validado por `motorista_user_id` + `tracking_device_id` no banco).
- Se Marcelo abrir o app dele e iniciar a viagem onde ele é o motorista, o GPS dele é registrado. Ninguém mais consegue sobrescrever.
- Se outro coordenador clicar "Iniciar viagem" remotamente, o transporte muda de status, mas o GPS espera o motorista verdadeiro abrir o app.

Não há mudança de UI necessária — só a separação de contas resolve a "bagunça".

## Como executo

Crio um Edge Function **one-shot** chamado `setup-driver-admins` que:

1. Exige que quem chamar seja Admin da org (ou seja, você).
2. Para cada motorista: faz `UPDATE org_members SET role='admin'` + `auth.admin.updateUserById(..., { password })`.
3. Retorna o relatório de sucesso/erro por pessoa.

Em seguida disparo a função uma única vez via `curl_edge_functions` com seu token de admin atual. A função fica no projeto (não deletada) caso precise resetar senhas no futuro — mas só Admin consegue chamar.

## Comunicado para os motoristas (sugestão)

> Olá! Seu acesso ao Fenasoja Logística foi liberado.
> 
> **Site:** www.fenasojalog.com
> **Login:** seu email cadastrado
> **Senha inicial:** Fenasoja@2026
> 
> Após entrar, vá em Configurações → Minha Conta para trocar a senha.
> Para iniciar suas viagens, **sempre entre com sua própria conta** — assim o GPS do seu celular será o usado durante o transporte.

## Arquivos

- **Novo**: `supabase/functions/setup-driver-admins/index.ts`
- **Sem migration de schema** (operação é só dado via Auth Admin API).
- Nenhuma outra alteração de UI ou lógica.
