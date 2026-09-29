import { Suspense, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { applyPublicShareMetadata } from './publicShareMetadata';

const PublicAreaMapPage = lazyWithRetry(() => import('./PublicAreaMapPage'));

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function InvalidLink() {
  useEffect(() => { applyPublicShareMetadata('', false, window.location.href); }, []);
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-center text-foreground">
      <div className="max-w-sm space-y-2">
        <h1 className="text-xl font-bold tracking-tight">Link de mapa inválido ou ausente</h1>
        <p className="text-sm text-muted-foreground">Solicite à organização da Fenasoja o link da área ou pavilhão desejado.</p>
      </div>
    </main>
  );
}

/** Aplicação mínima do domínio público: somente mapas por escopo, sem login. */
export default function PublicMapApp() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/areas/:slug/:token" element={<PublicAreaMapPage />} />
            <Route path="*" element={<InvalidLink />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
