# Assessoria de Sistemas no portal + Jeferson Araújo

## Situação atual (verificada)

- A frente "Assessoria de Sistemas" **já existe** no registro institucional, ativa e oficial, mas está na lista de frentes **ocultas do portal** — por isso não aparece como card/módulo.
- **Jeferson Araújo já tem usuário** (`633araujo@gmail.com`) e já está cadastrado como **responsável principal** da Assessoria de Sistemas, com vínculo ativo na organização (cargo "ASSESSORIA DE SISTEMAS", perfil de leitura).
- Ele ainda **não tem foto oficial** no sistema (aparece com iniciais).

Ou seja: falta publicar o card do módulo, colocar a foto e ajustar a senha/acesso dele.

## O que será feito

1. **Publicar a Assessoria de Sistemas como módulo**
   - Retirar a frente da lista de ocultas e cadastrá-la no catálogo oficial das Assessorias, com nome, ícone próprio (tema de tecnologia), descrição e responsável "Jeferson Araújo".
   - Isso gera automaticamente o card no portal e a rota do painel da comissão, no mesmo padrão das demais assessorias.

2. **Foto do Jeferson**
   - Publicar a imagem enviada como retrato oficial e associá-la ao nome e ao usuário dele, para aparecer no card da assessoria, na equipe e nos eventos.

3. **Acesso do Jeferson**
   - Definir a senha `Fenasoja!2028` para a conta existente.
   - Conceder a permissão de acesso ao módulo da Assessoria de Sistemas, para ele entrar no painel da própria frente.

4. **Verificação**
   - Conferir o card no portal (celular e computador), o painel do módulo e a foto exibida; rodar os testes de portal/comissões e a checagem de tipos.

## Detalhes técnicos

- `src/modules/commissions/officialCommissionCatalog.ts`: remover `assessoria-de-sistemas` de `NON_PORTAL_UNIT_SLUGS`; adicionar entrada em `OFFICIAL_COMMISSION_UNITS` (`type: 'assessoria'`, `order: 7`, ícone Lucide `MonitorCog`, tone existente, `responsible: 'Jeferson Araújo'`, aliases `['sistemas', 'assessoria de sistemas', 'ti']`). O módulo derivado usa a rota `/comissoes/assessoria-de-sistemas/dashboard` e a capability `assessoria_de_sistemas_access`.
- Foto: subir a imagem via `lovable-assets create` gerando `src/assets/person-jeferson-araujo.png.asset.json`, e registrar em `src/components/cronograma-eventos/personPhotos.ts` em `PERSON_PHOTOS` (`'jeferson araujo'`) e `PERSON_PHOTOS_BY_USER_ID` (`7e2422a6-91e8-428c-9cdd-f25eb503e9c3`).
- Senha: atualização administrativa da conta `7e2422a6-91e8-428c-9cdd-f25eb503e9c3` via Admin API (não expõe segredo em código).
- Permissão: inserir `user_capabilities` com `assessoria_de_sistemas_access` para o usuário na org `985888b8-...`.
- Testes: `src/test/portalArchitecture.test.ts`, `src/test/commissionPortal.test.ts`, `src/test/memberIdentity.test.ts` e checagem de tipos.
- Nada será publicado em produção.
