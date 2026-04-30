## Objetivo

Padronizar a origem de **todos os transportes** como **Parque de Exposições Alfredo Leandro Carlson — Santa Rosa, RS** e corrigir as coordenadas usadas em todo o sistema, que hoje estão imprecisas (~3 km de desvio).

## Diagnóstico

1. Hoje a origem é detectada via GPS (`navigator.geolocation` + reverse geocode), o que coloca valores como "SANTA ROSA" ou outras cidades dependendo de onde o usuário está.
2. As coordenadas usadas como "Santa Rosa / Parque" no código são `-27.8708, -54.4814` (Centro de Santa Rosa, **erradas**).
3. Coordenadas reais do Parque, validadas (mypacer + wikimapia, endereço R. Chile - Glória):
   - **Latitude:** `-27.84502`
   - **Longitude:** `-54.47892`
   - **Endereço:** `R. Chile, Glória, Santa Rosa - RS, 98900-000`

Isso impacta: cálculo de distância (Google Routes), preview de rota, telemetria de retorno, mapa, PDFs e label "Origem" dos transportes.

## Mudanças

### 1. Constantes centrais — coordenadas corretas

Atualizar em **todos** os locais que hoje usam `-27.8708, -54.4814` como "Santa Rosa/Parque":

- `src/pages/TransportsPage.tsx` — `SANTA_ROSA_LAT/LNG` e entrada `'Parque'` em `knownDestCoords`.
- `src/components/transport/TransportForm.tsx` — `SANTA_ROSA` e `knownDestCoords['Parque']`.
- `supabase/functions/estimate-return/index.ts` — `SANTA_ROSA` e `knownDestinations['Parque']`.

Novos valores:
```ts
const PARQUE_FENASOJA = {
  lat: -27.84502,
  lng: -54.47892,
  label: 'Parque de Exposições Alfredo Leandro Carlson',
  endereco: 'R. Chile, Glória, Santa Rosa - RS',
};
```

### 2. Origem fixa no formulário de transporte

`src/components/transport/TransportForm.tsx`:

- Remover auto-detecção via GPS no mount (`detectOrigin()` no `useEffect`).
- Remover botão `LocateFixed` de detectar localização.
- Tornar o campo Origem **somente leitura** (com visual sutil) exibindo:
  `PARQUE DE EXPOSIÇÕES ALFREDO LEANDRO CARLSON — SANTA ROSA, RS`
- Adicionar tooltip/legenda: "Origem padrão de todos os transportes da Fenasoja".
- Manter a função `places-autocomplete` (modo `reverse`) intacta — usada em outros fluxos.

### 3. Inicialização do form em TransportsPage

`src/pages/TransportsPage.tsx`:

- Em `setForm(...)` (linha ~504) e no reset pós-criar (linha ~584): trocar `origem: 'Santa Rosa'` / `origem: ''` por `origem: 'Parque de Exposições Alfredo Leandro Carlson — Santa Rosa, RS'`.
- No fluxo de "viagem de volta" automática (linha ~670): inverter corretamente — origem do retorno = aeroporto/destino anterior; destino do retorno = Parque (já é o esperado, apenas usar a label nova).

### 4. Edição de transportes existentes

- No `editForm`, manter `origem` editável (caso transportes antigos tenham origens diferentes), mas pré-preencher com a label do Parque quando vazia.
- Não migrar dados antigos no banco — apenas novos cadastros usarão a origem padronizada.

### 5. Verificação de impacto no Google Maps

- O cálculo de distância (`estimate-return`, modo `ROUTE_PREVIEW`) passará a usar as coordenadas corretas → as estimativas em km exibidas no formulário ficarão **mais precisas** (ajuste de poucos km).
- Sem necessidade de mudar a chave da Google Maps API nem o `places-autocomplete`.

### 6. Memória do projeto

Salvar nova memória `mem://features/transport-origin-standard`:
> Origem padrão de todo transporte: Parque de Exposições Alfredo Leandro Carlson — Santa Rosa, RS. Coordenadas oficiais: -27.84502, -54.47892. Campo Origem é fixo (read-only) no form de novo transporte.

E atualizar `mem://index.md` adicionando essa referência + nota nas Core rules sobre as coordenadas corretas do Parque.

## Arquivos a editar

- `src/components/transport/TransportForm.tsx`
- `src/pages/TransportsPage.tsx`
- `supabase/functions/estimate-return/index.ts`
- `mem://features/transport-origin-standard` (novo)
- `mem://index.md` (atualizar)

## Fora de escopo

- Migração das origens dos transportes já cadastrados.
- Mudanças em eventos da Fenasoja (`EventForm.tsx`) ou em outros módulos que não envolvem transporte.
