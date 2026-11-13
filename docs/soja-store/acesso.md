# Acesso operacional da Soja Store

A liberação usa os vínculos institucionais existentes. Uma sessão precisa de vínculo ativo em `org_members` na organização da Soja Store. O acesso completo às áreas liberadas vem de uma destas condições:

- A conta tem função `admin` no vínculo ativo dessa organização.
- A conta consta em `commission_people.user_id` e sua pessoa tem um vínculo ativo do tipo `pessoa` em `commission_responsibles` na comissão Soja Store. A associação é resolvida pelo ID da comissão e da pessoa, ambos na mesma organização.

O cadastro de uma pessoa sem conta ou sem vínculo ativo na organização continua visível na equipe conforme as regras institucionais. A remoção do vínculo ativo ou a troca da conta verificada altera a autorização na próxima consulta ao banco. Nomes, e-mails, papel global, `org_members.commission_id` e o campo histórico `commission_responsibles.user_id` não estabelecem elegibilidade.

O servidor calcula as capacidades atuais por `soja_store_private.operational_capabilities()`, a partir do registro privado preenchido por migrações versionadas. O acesso pleno desta etapa abrange as áreas liberadas da Soja Store, inclusive custos de compras. O Financeiro Fenasoja continua condicionado ao próprio roster e às próprias permissões. Os lotes, correções e trilhas já existentes de importação permanecem armazenados em suas tabelas privadas. As RPCs de importação consultam capacidades fora do conjunto operacional e continuam fechadas para contas da aplicação. As concessões anteriormente gravadas são preservadas para auditoria e ficam fora do cálculo desta etapa.

## Liberação e verificação

1. Aplique `20261112120500_soja_store_access_rollout.sql` pelo conector Lovable. A migração resolve uma única comissão canônica ativa e registra seu escopo inicialmente desabilitado. O gatilho de `org_members` limita a criação, promoção e reativação de papéis privilegiados e a troca de identidade por usuários autenticados. Ele é restrito à organização do escopo. A administração legítima de vínculos da organização e a manutenção de outras organizações seguem as permissões existentes.
2. Confirme no projeto Fenasoja Log que a versão publicada de `create-user` valida organização de destino, vínculo ativo e alçada sobre o usuário afetado. A requisição `OPTIONS` deve devolver `X-Fenasoja-Account-Policy: org-scoped-v1`. Valide também a negação da versão implantada. A publicação do frontend é uma verificação distinta.
3. Aplique o script de ativação explícita `scripts/soja-store/20261112120550_soja_store_enable.sql` pelo conector Lovable após verificar a função publicada. Gere a transação com `node scripts/soja-store/migration-envelope.mjs 20261112120550`. A ativação fica fora da pasta de migrações automáticas e exige o gatilho ativo, a comissão canônica, a ausência de escrita direta da API nas tabelas de equipe e ao menos uma conta administradora ativa na organização.
4. Execute `scripts/soja-store/access-verification.sql` pelo conector. Confirme os checksums no histórico, um único escopo, os totais dos grupos elegíveis e os controles de acesso. Teste menu e URL para uma conta administradora, uma da comissão e uma sem vínculo na loja.
5. Para suspender o acesso operacional, desabilite o escopo via migração compensatória pelo conector. Os registros operacionais, os vínculos e o controle de integridade dos papéis ficam preservados.

A suíte `scripts/soja-store/access-qa.mjs` usa PostgreSQL descartável. Ela carrega as permissões legadas de associação, aplica as duas etapas e valida acesso ativo, isolamento entre organizações e comissões, tentativa de autoinscrição, promoção por gestor, mudança de identidade, revogação, suspensão e bloqueio de importações.
