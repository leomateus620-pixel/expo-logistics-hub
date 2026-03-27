

# Corrigir Solicitação de Permissão de Localização ao Iniciar Viagem

## Diagnóstico

Analisando o fluxo completo:

1. Quando o motorista clica "Iniciar", `cycleStatus` chama `setTrackingTransportId(t.id)` (linha 610)
2. Um `useEffect` (linha 262) detecta a mudança e chama `locationTrackerRef.current.startTracking()`
3. `startTracking` chama `navigator.geolocation.watchPosition()`

**Problema principal**: O `startTracking` chama `watchPosition` que internamente usa `updateLocation`, mas `updateLocation` depende de `transportId` via closure. Quando o `useEffect` dispara, o `locationTrackerRef` pode ter a versão de `startTracking` que capturou o `transportId` anterior (null), fazendo com que `updateLocation` retorne silenciosamente sem salvar no banco — o GPS obtém a posição mas ela nunca é persistida.

**Problema secundário**: Se a permissão de localização foi negada anteriormente pelo browser, o `watchPosition` retorna erro imediatamente sem mostrar o prompt novamente. O usuário vê "Permissão de localização negada" sem saber como resolver.

## Solução

### 1. Corrigir race condition no `useLocationTracking.ts`

Usar refs para `transportId`, `orgId` e `user` dentro de `updateLocation` para evitar closures obsoletas:

```typescript
const transportIdRef = useRef(transportId);
const orgIdRef = useRef(orgId);
const userRef = useRef(user);

useEffect(() => { transportIdRef.current = transportId; }, [transportId]);
useEffect(() => { orgIdRef.current = orgId; }, [orgId]);
useEffect(() => { userRef.current = user; }, [user]);

const updateLocation = useCallback(async (pos: GeolocationPosition) => {
  const tid = transportIdRef.current;
  const oid = orgIdRef.current;
  const u = userRef.current;
  if (!tid || !oid || !u) return;
  // ... rest uses tid, oid, u
}, []); // No dependencies — always fresh via refs
```

Isso garante que `updateLocation` sempre usa os valores mais recentes, mesmo que `startTracking` tenha sido criado com uma closure anterior.

### 2. Verificar permissão antes de iniciar tracking

Adicionar verificação de permissão no `startTracking` usando `navigator.permissions.query()`:

```typescript
const startTracking = useCallback(async () => {
  if (!navigator.geolocation) {
    setState(prev => ({ ...prev, error: 'Geolocalização não suportada' }));
    return;
  }

  // Check permission state first
  try {
    const perm = await navigator.permissions.query({ name: 'geolocation' });
    if (perm.state === 'denied') {
      setState(prev => ({
        ...prev,
        error: 'Localização bloqueada. Acesse as configurações do navegador para permitir.',
      }));
      return;
    }
  } catch { /* Some browsers don't support permissions API — proceed anyway */ }

  setState(prev => ({ ...prev, isTracking: true, error: null }));
  // watchPosition...
}, []);
```

### 3. Melhorar UX de erro no `TransportDynamicIsland.tsx`

Quando o erro é de permissão negada, mostrar instruções claras com botão de retry:

```tsx
{trackingError && (
  <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-destructive/10 border border-destructive/20">
    <div className="flex items-center gap-2 text-xs text-destructive">
      <MapPinOff className="w-3.5 h-3.5" />
      <span>{trackingError}</span>
    </div>
    <button onClick={() => locationTracker.startTracking()} className="text-[10px] text-accent underline text-left">
      Tentar novamente
    </button>
  </div>
)}
```

### 4. Tornar `startTracking` async no `TransportsPage.tsx`

Atualizar o `useEffect` para chamar como async, já que agora `startTracking` é async:

```typescript
useEffect(() => {
  if (trackingTransportId && !locationTrackerRef.current.isTracking) {
    locationTrackerRef.current.startTracking();
  }
}, [trackingTransportId]);
```

## Arquivos alterados

1. `src/hooks/useLocationTracking.ts` — refs para valores frescos + verificação de permissão + startTracking async
2. `src/components/TransportDynamicIsland.tsx` — UX de erro melhorada com retry

