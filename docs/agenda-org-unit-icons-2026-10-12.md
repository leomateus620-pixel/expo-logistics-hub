# Identidade iconográfica do seletor de áreas da Agenda (2026-10-12)

Escopo: apenas apresentação do campo "Comissão ou Assessoria responsável" (criação e edição de eventos e subeventos).
IDs, vínculos, filtros, busca, permissões e persistência não foram alterados.

## Onde está

- Registro: `src/components/cronograma-eventos/org-unit-identity/registry.ts` (chave = slug canônico de `commissions.slug`;
  depois slug histórico; depois nome oficial exato — nunca posição, nunca trecho de nome).
- Glifos próprios (mesma grade 24×24, traço arredondado): `.../glyphs.ts`.
- Contêiner/ícone: `.../OrgUnitIdentityBadge.tsx`; estilos: `src/styles/org-unit-identity.css`.
- Ligação com os dados: `buildCommissionOptions` (`identityId`/`identityKind` em `RelationalOption`, campos só visuais).
- Marca oficial reduzida do CCPF: `src/assets/brand/fenasoja-symbol-144.webp` (recorte sem a margem transparente e
  reamostragem do `fenasoja-logo-oficial.png`; cores e proporções originais, sem redesenho).

## Matriz

| Slug (id estável) | Nome | Categoria | Conceito | Ícone |
| --- | --- | --- | --- | --- |
| `ccpf` | CCPF — Conselho Consultivo Permanente Fenasoja | Conselho | Símbolo oficial FENASOJA (sol sobre a lavoura) | marca oficial reduzida |
| `assessoria-de-sistemas` | Assessoria de Sistemas | Assessoria | Monitor com elemento de código | glifo próprio |
| `assessoria-de-sustentabilidade` | Assessoria de Sustentabilidade | Assessoria | Folha orgânica | `Leaf` |
| `assessoria-de-imprensa` | Assessoria de Imprensa | Assessoria | Jornal / publicação | `Newspaper` |
| `assessoria-de-projetos-e-captacoes` (slug no banco: `assessoria-projetos-e-captacoes-institucionais`) | Assessoria de Projetos e Captações | Assessoria | Documento de projeto com indicador de evolução | glifo próprio |
| `assessoria-juridica` | Assessoria Jurídica | Assessoria | Balança | `Scale` |
| `assessoria-de-relacoes-internacionais` | Assessoria de Relações Internacionais | Assessoria | Globo com conexões discretas | glifo próprio |
| `assessoria-de-protocolo` | Assessoria de Protocolo | Assessoria | Documento cerimonial com selo | `FileBadge` |
| `assessoria-de-marketing` | Assessoria de Marketing/Comunicação | Assessoria | Megafone | `Megaphone` |
| `acolhimento-e-bem-comum` | Acolhimento e Bem Comum | Comissão | Mão que acolhe um coração | `HandHeart` |
| `agricultura-soja-e-derivados` | Agricultura, Soja e Derivados | Comissão | Broto da lavoura | `Sprout` |
| `soy-summit` | Soy Summit | Comissão | Apresentação do encontro | `Presentation` |
| `inovacao-e-experiencia` | Inovação e Tecnologia | Comissão | Lâmpada de ideias | `Lightbulb` |
| `arte-e-cultura` | Arte e Cultura | Comissão | Paleta de artista | `Palette` |
| `bilheteria` | Bilheteria | Comissão | Ingresso | `Ticket` |
| `credenciamento` | Credenciamento | Comissão | Crachá | `IdCard` |
| `cooperativismo` | Cooperativismo | Comissão | Aperto de mãos | `Handshake` |
| `espaco-do-automovel` | Espaço do Automóvel | Comissão | Automóvel | `Car` |
| `exporural` | Exporural | Comissão | Trator | `Tractor` |
| `industria-comercio-e-servicos` | Indústria, Comércio e Serviços | Comissão | Fábrica | `Factory` |
| `infraestrutura-e-seguranca-do-trabalho` | Infraestrutura e Segurança do Trabalho | Comissão | Capacete de obra | `HardHat` |
| `relacionamento-e-experiencia` | Relacionamento e Experiência | Comissão | Conversa com afeto | `MessageCircleHeart` |
| `logistica-hotelaria-e-turismo` | Logística, Hotelaria e Turismo | Comissão | Mala de viagem | `Luggage` |
| `novas-geracoes` | Novas Gerações | Comissão | Capelo de formatura | `GraduationCap` |
| `pecuaria` | Pecuária | Comissão | Cabeça de bovino | glifo próprio |
| `prevencao-e-combate-a-incendio` | Prevenção e Combate a Incêndio | Comissão | Extintor | `FireExtinguisher` |
| `recepcao-e-cerimonial` | Recepção e Eventos | Comissão | Sineta de recepção | `ConciergeBell` |
| `relacoes-estrategicas` | Relações Estratégicas | Comissão | Rede de conexões | `Network` |
| `saude-bem-estar-e-acessibilidade` | Saúde, Bem-Estar e Acessibilidade | Comissão | Coração com pulsação | `HeartPulse` |
| `seguranca` | Segurança | Comissão | Escudo | `ShieldCheck` |
| `mercosul` | Mercosul | Comissão | Bandeira do bloco | `Flag` |
| `servicos` | Serviços | Comissão | Chave de serviço | `Wrench` |
| `soja-store` | Soja Store | Comissão | Sacola de loja | `ShoppingBag` |
| `shows` | Shows | Comissão | Nota musical | `Music4` |
| `central` (registro histórico) | Comissão Central | Comissão | Edifício institucional | `Landmark` |

Entidades futuras ainda não mapeadas usam o fallback `Shapes` com a categoria vinda de `unit_type`.

## Origem dos dados

A lista foi montada a partir de `sync_official_units_2028` (migração `20260803140802`), do rename de Marketing/Comunicação
(`20260831105332`), do CCPF (`drizzle/migrations/0003`) e de `officialCommissionCatalog.ts`. O banco de produção não estava
acessível a partir deste ambiente; os slugs de renomeações históricas (`logistica`, `infraestrutura`, `acessibilidade-e-inclusao`,
`assessoria-projetos-e-captacoes-institucionais`) e os nomes exatos servem de reconciliação e devem ser conferidos contra
`select slug, nome, unit_type from commissions` ao revisar.
