

# Plano de Implementacao - Login, Mobile, Melhorias de Frota e Painel

Este plano cobre 6 alteracoes principais no sistema FeiraPro.

---

## 1. Sistema de Login com Usuario e Senha

O acesso ao sistema sera restrito. Somente usuarios criados pelo administrador poderao entrar.

**O que sera feito:**
- Criar tabela `profiles` no banco de dados para guardar nome e papel de cada usuario
- Criar tabela `user_roles` para controle de permissoes (admin vs usuario comum)
- Criar pagina de Login (e-mail + senha)
- Proteger todas as rotas -- quem nao estiver logado e redirecionado para o login
- Criar funcao no backend para o administrador criar novas contas
- O primeiro usuario sera criado manualmente como administrador

**Fluxo:**
- Usuario acessa o sistema -> ve tela de login
- Digita e-mail e senha -> entra no sistema
- Se nao tiver conta, precisa que o admin crie

---

## 2. Remover KM dos Carrinhos Eletricos

- Na pagina "Carrinhos Eletricos", remover todos os campos de KM (retirada, devolucao, KM atual)
- O formulario de retirada passa a ter apenas: carrinho, responsavel, data/hora
- O formulario de devolucao fica apenas com data/hora
- No historico, mostrar apenas quem usou, quando retirou e quando devolveu

---

## 3. Melhorar Historico de KM dos Veiculos Botolli

- No formulario de retirada: adicionar campos de **horario de retirada** (hora especifica, nao apenas automatico) e **observacao**
- No formulario de devolucao: adicionar campos de **horario de devolucao** e **observacao**
- No historico do veiculo, cada registro mostrara:
  - Nome do responsavel
  - Data/hora de retirada e KM de retirada
  - Data/hora de devolucao e KM de devolucao
  - Observacao (se houver)
- Atualizar a interface `VehicleLog` no store com campos `pickupTime`, `returnTime`, `note`

---

## 4. Escala da Equipe no Painel de Controle

- No Dashboard, adicionar uma secao "Equipe Disponivel Agora"
- Verificar a escala de cada membro: se o horario atual esta dentro do intervalo de trabalho cadastrado para hoje, a pessoa aparece como disponivel
- Mostrar avatar, nome, funcao e horario da escala
- Quem nao tem escala para hoje ou esta fora do horario aparece em uma lista separada ou nao aparece

---

## 5. Layout Responsivo para Celular

- **Sidebar:** em telas menores que 768px, o menu lateral fica escondido e acessivel por um botao "hamburguer"
- **Header mobile:** barra superior fixa com logo + botao de menu + titulo da pagina
- **Cards e grids:** mudam de 2-3 colunas para 1 coluna em telas pequenas
- **Dialogos:** ocupam tela cheia em mobile (`DialogContent` com classes responsivas)
- **Botoes de acao:** maiores e mais faceis de tocar em tela pequena
- **Tabelas e listas:** scroll horizontal quando necessario

---

## 6. Botao para Recolher o Menu (Desktop)

- Adicionar um botao no topo do sidebar para recolher/expandir
- Quando recolhido: sidebar mostra apenas os icones (largura ~64px)
- A area de trabalho se expande automaticamente
- O estado (aberto/fechado) sera mantido via estado local
- Usar o hook `useIsMobile` ja existente para combinar com o comportamento mobile

---

## Detalhes Tecnicos

### Banco de Dados (Migracoes SQL)

1. **Tabela `profiles`:**
   - `id` (uuid, PK), `user_id` (uuid, FK auth.users, unique), `full_name`, `created_at`
   - RLS: leitura para autenticados, update apenas do proprio perfil

2. **Tabela `user_roles`:**
   - `id` (uuid, PK), `user_id` (uuid, FK auth.users), `role` (enum: admin, user)
   - Funcao `has_role(user_id, role)` com SECURITY DEFINER

3. **Trigger** para criar perfil automaticamente ao cadastrar usuario

### Arquivos Novos
- `src/pages/LoginPage.tsx` -- tela de login
- `src/components/AuthGuard.tsx` -- componente que protege rotas
- `src/hooks/useAuth.ts` -- hook para gerenciar sessao

### Arquivos Modificados
- `src/App.tsx` -- adicionar rota /login e proteger demais rotas com AuthGuard
- `src/components/Layout.tsx` -- sidebar colapsavel + responsivo
- `src/components/Sidebar.tsx` -- estado collapsed, botao toggle, overlay mobile
- `src/pages/Dashboard.tsx` -- secao "Equipe Disponivel Agora"
- `src/pages/ElectricCartsPage.tsx` -- remover campos de KM
- `src/pages/VehiclesPage.tsx` -- campos de horario e observacao nos formularios de retirada/devolucao
- `src/store/useAppStore.ts` -- atualizar VehicleLog com novos campos (note, pickupTime, returnTime)

### Ordem de Implementacao
1. Criar migracoes do banco (profiles, user_roles, trigger, RLS)
2. Configurar autenticacao (desabilitar auto-confirm de e-mail? ou habilitar para facilitar criacao pelo admin)
3. Criar LoginPage + AuthGuard + useAuth
4. Atualizar Layout/Sidebar para responsivo + colapsavel
5. Atualizar Dashboard com escala da equipe
6. Atualizar ElectricCartsPage (remover KM)
7. Atualizar VehiclesPage (campos de horario e observacao)

