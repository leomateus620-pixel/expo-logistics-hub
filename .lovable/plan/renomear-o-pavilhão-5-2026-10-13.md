# Renomear o Pavilhão 5

## Resultado
Exibir **Pavilhão 5: Floriculturas** onde atualmente aparece “Pavilhão 5 — Veterinária, Pequenos Animais e Rações”. Nos campos que mostram somente a atividade, usar **Floriculturas**.

## Diagnóstico confirmado
- O nome antigo está nas referências e na configuração visual do mapa, incluindo a categoria do Pavilhão 5.
- O banco ativo também mantém o nome antigo na entidade **B8**, no projeto Parque Fenasoja — referência oficial 2026.
- O registro público usa o identificador B8 e o endereço `pavilhao-5`; esses identificadores serão preservados.

## Alterações
1. Atualizar os rótulos usados no mapa, na planta interna, nas legendas, na seleção do pavilhão e no painel comercial, incluindo o título indicado na imagem.
2. Corrigir exclusivamente o nome da entidade B8 identificada no banco, com alteração incremental, auditável e idempotente. Preservar snapshots históricos.
3. Alinhar o nome completo nos links públicos, mantendo o nome curto “Pavilhão 5” quando o espaço exigir e sem mudar endereços.
4. Atualizar os testes relacionados e conferir que o nome antigo não permanece nas fontes ativas de exibição.

## Preservação
Não alterar IDs, numeração, geometria, áreas, quantidade de módulos, preços, vendas, contratos, vínculos ou permissões. A imagem enviada será usada apenas como referência. Não publicar.

## Validação
- Executar os testes pertinentes de identificação, módulos e legendas.
- Consultar novamente o banco para confirmar o nome e a identidade preservada.
- Conferir o título do Pavilhão 5 na prévia e os nomes nas superfícies acessíveis; informar qualquer limitação de acesso.
- Separar na entrega o que foi alterado no código, confirmado no banco e conferido visualmente.

## Detalhes técnicos
Fontes confirmadas: `commercialPavilions.ts`, `pavilion5CommercialReference.ts`, `officialReference2026.ts` e `publicAreaRegistry.ts`. A atualização persistida será limitada à entidade `93e05f88-fa8e-4cc3-8294-f3f7fbd29053`, identificador B8, projeto `0538d132-34dd-4347-a33c-526edac7339c`, com verificação do estado antes da gravação.