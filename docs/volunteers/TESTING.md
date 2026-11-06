# Validação executada

## Checks do repositório

| Check | Resultado |
|---|---|
| `npm install` | Executado conforme AGENTS.md; nenhuma nova dependência de produção |
| `npm run typecheck` | Passou |
| `npm run build` | Passou; avisos existentes de chunks grandes/Browserslist |
| `npm test` | 4.240 passaram; 91 falharam em 52 arquivos, mesmas falhas do checkout original |
| `vitest run src/features/volunteers` | 56 passaram: 37 unidades, 4 aliases e 15 casos de identidade, formulário, Ecossistema, cache e permissões |
| Voluntários + Ecossistema | 109 passaram após a correção visual, incluindo apoio separado com e sem liderança |
| PostgreSQL descartável real | 21 cenários passaram, incluindo quatro sessões concorrentes |
| Deno decoder real | 6 passaram: JPEG, PNG, WebP, EXIF, bytes/tamanhos inválidos e recorte |
| `deno check` da edge function | Passou |
| ESLint nos componentes/hooks novos e Ecossistema alterado | 0 erros; 5 avisos de dependências de hooks/Fast Refresh |
| `git diff --check` | Passou |

As 91 falhas não foram presumidas antigas: a suíte foi executada também num checkout materializado de `19d54148`; os nomes dos 91 casos foram comparados. Não houve falha adicionada ou removida. [baseline-comparison.json](evidence/baseline-comparison.json). O lint global possui dívida histórica indicada no AGENTS.md; não é declarado limpo.

## Backend conectado e fotos hospedadas

- Aplicação efetiva de quatro migrações pelo Lovable; hashes do SQL relidos do histórico do banco. [Evidência](evidence/lovable-application.json).
- Preservação de IDs, snapshots, campos e timestamps nas nove tabelas verificadas; zero vínculos sem pessoa. 64 vínculos/60 identidades; Soja Store 9/8/7 (integrantes/apoio/sem conta).
- Cinco cenários conectados com os papéis reais `authenticated`/`anon`, claims de atribuições verificadas e `ROLLBACK`: criação/retry pelo presidente da Soja Store; negação entre unidades; voluntário/visitante sem contato; joins privados negados; revogação imediata. [Evidência](evidence/live-authorization.json).
- Processamento **real autenticado na edge function publicada** com fixture isolada, contas sintéticas e contatos `example.invalid`: formatos aceitos, WebP 256 × 256, bucket privado, troca/remoção, retry sem duplicação, formato falsificado e escopo forjado negados. [Evidência](evidence/avatar-hosted.json).
- O teste hospedado encontrou um defeito que o PostgreSQL local não revelava: `40001` era repetido pela infraestrutura até timeout. A migração incremental `20261106103000` corrigiu para `PT409`. Três chamadas diretas recusaram em 0,25/0,59/0,26 s; a edge respondeu 409 em 1,78 s; escrita com versão antiga foi recusada em 0,56 s, preservando versão/dados. [Reteste](evidence/avatar-conflict-fix.json).
- Todas as fixtures hospedadas foram removidas por IDs explícitos, inclusive auth e storage. Nenhum convite, mensagem a voluntário real ou publicação do frontend foi feito.

O teste de RLS com `SET LOCAL ROLE` exercita o banco real; não equivale a login humano no browser. Os testes hospedados usam sessões sintéticas reais na API. Separadamente, foi feito login real pelo Chrome em uma conta sintética de organização isolada: cadastro com nome/e-mail/foto, recorte, confirmação do servidor, persistência após reload e presença na agenda interna, Agenda Fenasoja e Ecossistema. Nenhum formulário de evento foi enviado e não houve convite. O seed preexistente da Agenda criou automaticamente 27 eventos na organização sintética; todos foram removidos junto com o fixture. A sessão foi encerrada. Os nove checksums legados foram relidos após a limpeza e permaneceram idênticos. [Evidência do fluxo](evidence/live-ui.json). O fixture PostgreSQL local usa schema mínimo, não uma cópia integral de produção.

## Critérios de aceite e evidência

| Critério | Verificação |
|---|---|
| 1. Todas as unidades/aliases | Matriz de 38 registros; 37 páginas e 4 aliases montados/remontados em testes; rota exata fora do mapa |
| 2. Responsável cadastra nome/e-mail/foto | Presidente real por papel SQL; cadastro completo no browser como admin da organização sintética; upload hospedado |
| 3. Uma identidade nas três superfícies sem conta | Confirmado no browser com a mesma pessoa/foto; hook compartilhado, FK estável e teste SQL sem `user_id` |
| 4. Nome/foto e homônimos | Tests do resolver, multiunidades, persistência do avatar e fallback restrito a legados |
| 5–8. Privacidade/forja/elevação/revogação | RLS/grants/joins/COPY/RPCs/cache/realtime testados; funções não possuem payload de perfil |
| 9. Duplicidade e concorrência | Idempotência com quatro sessões; queue admin; CAS; conflito hospedado retestado |
| 10. Soja Store | Mapa de IDs e checksums; 9 integrantes, 8 apoios e fotos legadas preservados |
| 11. Rotas especiais | Casos separados para Exporural, ICS, Automóvel, Logística e Infraestrutura/Serviços/Segurança |
| 12. Foto e responsividade | Decoder real e hosted; revisão Chrome desktop/mobile/área reduzida; dispositivo físico pendente |
| 13. Inativação | Teste real de vínculo inativo mantendo evento e outra unidade |
| 14. Falha de convite | Formulário repete só solicitação; cadastro não é apagado; fila não cria conta nem envia mensagem |
| 15. Listas | Leituras paginadas por tabela, miniaturas em lotes, paginação visual; sem benchmark de carga em produção |

## Limites explícitos

- Não foram feitos testes em câmera física, Safari/iPhone real ou leitor de tela. A revisão mobile usou Chrome com viewport 390 × 844; teclado simulado pela área útil 390 × 440.
- Os 37 testes de rota isolam autenticação/layout e não representam 37 logins diferentes em produção.
- Não foram enviados e-mails de acesso reais: o produto mantém solicitação administrativa rastreável, respeitando a governança existente.
- O frontend ainda precisa do merge/publicação pelo fluxo normal do repositório. Backend e edge foram aplicados pelo Lovable; essas ações têm evidência separada.
- Não se afirma que a suíte histórica inteira está verde, nem que foi feito teste de carga do banco compartilhado.
