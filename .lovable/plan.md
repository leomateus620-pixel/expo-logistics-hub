

# Formulário Público Completo + Integração com Menus Internos

## Resumo
Transformar a página pública `/f/mobilidade/:token` de um placeholder "Link válido!" para um formulário funcional completo. Criar edge function de submissão. Adicionar aba "Autorizados" nos menus de Carrinhos Elétricos e Patinetes consumindo `mobility_authorizations`.

## 1. Edge Function `submit-public-form`
Criar `supabase/functions/submit-public-form/index.ts`:
- Recebe `{ token, operational_responsible_name, operational_responsible_phone, operational_responsible_email, needs_electric_car, needs_scooter, members[] }`
- Computa SHA-256 do token
- Chama a RPC `submit_public_mobility_form` já existente via service role
- Retorna success ou erro formatado
- CORS habilitado

## 2. Atualizar `resolve-public-link`
- Além de `committee_name` e `president_name`, retornar `has_existing_submission` (boolean) verificando se já existe registro em `public_mobility_forms` para aquele `link_id`
- Se já enviado, retornar também os dados do formulário existente e membros para permitir edição/visualização

## 3. Reescrever `PublicMobilityFormPage.tsx`
Formulário público completo e isolado com:
- Header: Fenasoja 2026 + "Autorização de Mobilidade"
- Contexto: nome da comissão e presidente (read-only, preenchido pelo token)
- Campos editáveis:
  - Responsável operacional (nome, telefone, email)
  - Toggles: "Precisa de carro elétrico" / "Precisa de patinete"
  - Lista dinâmica de integrantes com botão "Adicionar integrante":
    - Nome (obrigatório)
    - Cargo
    - Identificador (CPF/matrícula)
    - Checkboxes: carro elétrico / patinete (ao menos um obrigatório)
    - Checkbox: QR gratuito
  - Botão remover integrante
- Botão "Enviar Autorização"
- Estados: loading, inválido, inativo, formulário aberto, enviando, sucesso, erro
- Se já enviado: mostrar resumo com opção de reenviar
- Layout 100% isolado, sem sidebar/nav do app
- Mobile-first, design limpo com identidade Fenasoja

## 4. Hook `useMobilityAuthorizations.ts`
Novo hook para leitura de `mobility_authorizations`:
- Query por `org_id`
- Filtros por `authorization_type` (carro_eletrico / patinete)
- Mutation para atualizar `access_status` (liberar/bloquear)

## 5. Integrar `ElectricCartsPage.tsx`
Adicionar aba/seção "Autorizados" usando Tabs:
- Tab "Frota" (conteúdo atual)
- Tab "Autorizados" lendo `mobility_authorizations` com `authorization_type = 'carro_eletrico'`
- Tabela com: nome, comissão, presidente, responsável operacional, status, QR
- Filtros por comissão, status, busca por nome
- Botões liberar/bloquear
- Exportar CSV

## 6. Integrar `ScootersPage.tsx`
Mesmo padrão do item 5, filtrando `authorization_type = 'patinete'`.

## Arquivos a criar
| Arquivo | Descrição |
|---|---|
| `supabase/functions/submit-public-form/index.ts` | Edge function de submissão pública |
| `src/hooks/useMobilityAuthorizations.ts` | Hook para autorizações consolidadas |

## Arquivos a modificar
| Arquivo | Alteração |
|---|---|
| `supabase/functions/resolve-public-link/index.ts` | Retornar dados de submissão existente |
| `src/pages/PublicMobilityFormPage.tsx` | Formulário completo funcional |
| `src/pages/ElectricCartsPage.tsx` | Aba "Autorizados" |
| `src/pages/ScootersPage.tsx` | Aba "Autorizados" |

## Segurança
- Submissão via edge function com service role (público não tem acesso direto às tabelas)
- Token nunca armazenado, apenas hash comparado server-side
- RLS das tabelas staging bloqueia acesso anon
- Sync automático via `submit_public_mobility_form` RPC que já chama `sync_public_mobility_form`

