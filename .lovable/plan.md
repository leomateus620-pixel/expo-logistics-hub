
# Busca de destino via Google Maps ao selecionar "Outros"

## Resumo

Quando o usuário selecionar "Outros" no título do transporte, em vez de só digitar texto livre no campo "Destino", aparecerá um campo de busca integrado com Google Places Autocomplete. Ao selecionar um local, o sistema preencherá automaticamente: nome do destino, cidade, coordenadas (lat/lng), distância estimada e tempo estimado via Routes API. Essas coordenadas serão salvas no banco para que o rastreamento ao vivo funcione corretamente.

## Alterações

### 1. Migração de banco — adicionar colunas de coordenadas

Adicionar `destino_lat` e `destino_lng` (float8, nullable) na tabela `transports` para armazenar as coordenadas do destino personalizado.

```sql
ALTER TABLE public.transports ADD COLUMN destino_lat double precision;
ALTER TABLE public.transports ADD COLUMN destino_lng double precision;
```

### 2. Edge function — `places-autocomplete` (nova)

Criar uma nova edge function que faz proxy para a Google Places API (New):
- **Endpoint**: `POST /places-autocomplete`
- **Body**: `{ query: string }`
- **Resposta**: Lista de sugestões com `place_id`, `description`, `lat`, `lng`, `city`
- Usa a Google Places API (New) — `searchText` endpoint
- Protegida por JWT (mesmo padrão das outras funções)

### 3. `src/components/transport/PlacesAutocomplete.tsx` (novo componente)

Componente de busca de lugares:
- Input com debounce (300ms) que chama a edge function
- Dropdown com sugestões (nome + endereço)
- Ao selecionar: retorna `{ name, city, lat, lng }` via callback
- Responsivo: funciona em mobile e desktop
- Mostra loading spinner enquanto busca
- Mostra "Nenhum resultado" quando não encontra

### 4. `src/components/transport/TransportForm.tsx`

- Quando `titulo === 'Outros'`, substituir o campo de texto "Destino" pelo `PlacesAutocomplete`
- Ao selecionar um local:
  - Preencher `data.destino` com a cidade do local
  - Salvar coordenadas em `data.destino_lat` e `data.destino_lng`
  - Disparar fetch de `ROUTE_PREVIEW` usando as coordenadas reais → atualizar `apiKm`
- Mostrar nome completo do local selecionado abaixo do campo
- Atualizar o `useEffect` de km para usar `destino_lat/lng` quando disponível (em vez de `knownDestCoords['Outros']`)

### 5. `src/pages/TransportsPage.tsx`

- Incluir `destino_lat` e `destino_lng` no payload de criação do transporte
- Atualizar `getDestCoords()` para verificar se o transporte tem `destino_lat/lng` antes de usar os coords fixos
- Atualizar `fetchRoutePreview()` para aceitar coordenadas customizadas

### 6. `src/components/TransportDynamicIsland.tsx`

- Atualizar `getDestCoords()` para usar `t.destino_lat` e `t.destino_lng` quando disponíveis (prioridade sobre o mapeamento fixo)
- Isso garante que o rastreamento ao vivo e recálculo de rota funcionem para destinos personalizados

### 7. `supabase/functions/estimate-return/index.ts`

- Nenhuma alteração necessária — já suporta `dest_lat/dest_lng` arbitrários nos modos `ROUTE_PREVIEW` e `LIVE_ROUTE`

## Fluxo do usuário

```text
1. Usuário abre "Novo Transporte"
2. Seleciona "Outros" no título
3. Campo "Destino" vira campo de busca com ícone de pesquisa
4. Digita "Ijuí" → aparece lista: "Ijuí, RS, Brasil", etc.
5. Seleciona "Ijuí, RS, Brasil"
6. Sistema preenche: destino="Ijuí", lat/lng salvos
7. Sistema calcula: "🛣️ Distância estimada: ~190 km (ida e volta) · via Google Maps"
8. Ao salvar, coordenadas vão pro banco
9. Durante viagem ao vivo, rota real é calculada usando as coordenadas corretas
```

## Arquivos

| Arquivo | Ação |
|---|---|
| Migração SQL | Adicionar `destino_lat`, `destino_lng` |
| `supabase/functions/places-autocomplete/index.ts` | Nova edge function (proxy Google Places) |
| `src/components/transport/PlacesAutocomplete.tsx` | Novo componente de busca |
| `src/components/transport/TransportForm.tsx` | Integrar autocomplete quando "Outros" |
| `src/pages/TransportsPage.tsx` | Salvar coords, atualizar getDestCoords |
| `src/components/TransportDynamicIsland.tsx` | Usar coords do banco para rastreamento |
