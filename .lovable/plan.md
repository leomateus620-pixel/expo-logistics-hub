# Expansão do acesso "Comissões" — Fenasoja 2028

## Auditoria (já concluída)

O registro oficial **já existe no banco** (tabela de comissões/assessorias), com 26 comissões oficiais, a Comissão Central, 9 assessorias e os responsáveis vinculados por usuário. O que está desatualizado é apenas o **portal**, que usa uma lista fixa de 9 cards no código.

| Situação | Registros |
| --- | --- |
| Módulo implementado e funcional | Logística (Logística, Hotelaria e Turismo), Exporural, Indústria/Comércio e Serviços, Gastronomia, Financeiro Gerencial (separado) |
| Card/placeholder existente | Infraestrutura, Serviços, Arte e Cultura, Novas Gerações, Segurança |
| Ausente no portal (existe no banco) | Acolhimento e Bem Comum, Agricultura Soja e Derivados, Bilheteria, Credenciamento, Cooperativismo, Espaço do Automóvel, Inovação e Tecnologia, Mercosul, Pecuária, Prevenção e Combate a Incêndio, Recepção e Eventos, Relacionamento e Experiência, Relações Estratégicas, Saúde Bem-Estar e Acessibilidade, Shows, Soja Store, Soy Summit + as 6 assessorias + Assessoria de Marketing |
| Alias a reconciliar (sem duplicar) | logistica ↔ Logística, Hotelaria e Turismo; infraestrutura ↔ Infraestrutura e Segurança do Trabalho; industria-comercio-servicos ↔ Indústria, Comércio e Serviços; servicos, seguranca, arte-cultura, novas-geracoes, gastronomia, exporural |
| Obsoleto | Limpeza (fora da lista oficial) |
| Fora do escopo do portal | Comissão Central, Assessoria de Sistemas, Assessoria de Projetos e Captações, Fotografia (permanecem no banco, sem card) |

## O que será feito

### 1. Registro único orientado a dados
Um catálogo canônico das 26 comissões + 7 assessorias (as 6 oficiais + Assessoria de Marketing e Comunicação, com Zélia Savoldi), cada uma com id canônico, rota estável, ícone temático e capability. Os slugs/rotas dos módulos existentes são **reutilizados sem alteração**; apenas o nome exibido de "Infraestrutura" passa a ser o oficial. Nenhuma página nova é escrita à mão: as frentes ainda sem módulo próprio usam a base compartilhada já existente, apenas configurada.

### 2. Portal reorganizado
Dentro de "Comissões": grupo **Comissões** primeiro, depois **Assessorias**, cada um com cabeçalho, contagem e recolher/expandir. Cards mais compactos e mais baixos, em grid responsivo (várias colunas no desktop, 2 no tablet, 1 no mobile), mantendo azul profundo, dourado e tipografia institucional. Cada card traz: ícone temático, nome oficial, foto destacada do responsável, nome + função, avatares sobrepostos dos demais integrantes com indicador "+N", ação de abrir, estados de hover/foco/toque/carregando e tooltip acessível por foto. Fotos com lazy loading; sem foto, avatar refinado com iniciais (substituído automaticamente quando a foto for cadastrada).

### 3. Pessoas e fotos
Responsáveis e integrantes vêm dos cadastros do Agenda Fenasoja, associados por id de usuário (fallback: e-mail, depois nome normalizado). Uma pessoa em várias frentes continua com cadastro único. Nenhum telefone, e-mail ou data de nascimento aparece nos cards. Visitante não autenticado vê o catálogo institucional (nome, ícone, responsável) sem dados de equipe.

### 4. Módulos das frentes novas
Cabeçalho próprio, responsável e equipe com fotos, eventos reais vinculados àquela frente quando existirem, estado vazio elegante quando não houver (sem dados fictícios), e espaço preparado para documentos, tarefas e agenda.

### 5. Acesso
Mantém-se o modelo atual (admin/gestor + capability específica) e, conforme decidido, **o responsável ou integrante já cadastrado numa frente passa a abrir o módulo dela automaticamente** — sem virar administrador e sem remover permissões de ninguém. Todas as novas rotas passam pelos mesmos guards.

### 6. Limpeza
Card e rota deixam de ser exibidos e a permissão `limpeza_access` é revogada dos 3 usuários que a possuem. Nenhum dado histórico é apagado.

## Detalhes técnicos

- Novo catálogo `src/modules/commissions/officialCommissionCatalog.ts` (id canônico, slug, aliases normalizados, tipo comissão/assessoria, ordem, ícone, capability, `basePath`), reconciliado por slug/alias com `commissionRegistry.ts`; os módulos já registrados (incluindo `commissionMapPortalRegistry`) têm prioridade e não são sobrescritos.
- `getPortalCommissionModules()` passa a derivar do catálogo e retornar grupos (`comissao`, `assessoria`), excluindo `limpeza`, `financeiro-gerencial`, Central, Sistemas, Projetos e Fotografia.
- Novo hook `usePortalCommissionPeople` (React Query) lendo `commissions` + `commission_responsibles` (+ `org_members` para foto/função), com `staleTime` e desativação quando não há sessão/org; fotos resolvidas por `personPhotos.ts` e `memberIdentity.ts`.
- `CommissionCard.tsx` recebe responsável e integrantes; novo `CommissionPeopleStack.tsx` (avatares sobrepostos + "+N" + tooltip); novo `src/styles/portal-commission-groups.css` para grupos e grid compacto; nenhum estilo de módulo interno é tocado.
- `resolveModuleAccess` ganha o vínculo por membership (lista de slugs das frentes do usuário) como fonte extra de permissão; regras sensíveis (Financeiro) permanecem inalteradas.
- `App.tsx` continua usando a rota genérica `/comissoes/:moduleSlug/*`; nenhuma rota existente é alterada.
- Migração de dados: `UPDATE` para revogar `limpeza_access` (3 registros).
- Testes: atualizar `portalArchitecture.test.ts` / `commissionPortal.test.tsx` com as contagens oficiais (26 comissões, 7 assessorias, ausência de Limpeza e de Assessoria Financeira) e rodar a suíte de mapa/comissões para garantir não regressão.

## Validação final
Conferência contra a planilha, abertura de todas as rotas, checagem de fotos e responsáveis, teste com Zélia (Central + Marketing), teste de perfil admin e comum, desktop/tablet/mobile, e relatório com módulos preservados, criados, aliases reconciliados, itens removidos da visualização, usuários sem foto e ambiguidades.
