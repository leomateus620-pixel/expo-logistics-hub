/** Explicit opt-in for a production QA build. No commercial rows or credentials. */
export const commercialMapDiagnosticsEnabled = import.meta.env.DEV
  || import.meta.env.VITE_COMMERCIAL_MAP_DIAGNOSTICS === 'true';

interface PerformanceEvent {
  name: string;
  at: number;
  duration?: number;
  failed?: boolean;
}

declare global {
  interface Window {
    __commercialMapPerformance?: { events: PerformanceEvent[] };
  }
}

export function markCommercialMapStage(name: string, duration?: number, failed?: boolean) {
  if (!commercialMapDiagnosticsEnabled || typeof window === 'undefined') return;
  const diagnostics = window.__commercialMapPerformance ??= { events: [] };
  diagnostics.events.push({ name, at: performance.now(), duration, failed });
  if (diagnostics.events.length > 500) diagnostics.events.splice(0, diagnostics.events.length - 500);
  document.documentElement.dataset.commercialMapPerformance = JSON.stringify(diagnostics);
}

export async function measureCommercialMapStage<T>(name: string, task: () => PromiseLike<T>): Promise<T> {
  const start = performance.now();
  markCommercialMapStage(`${name}:start`);
  try {
    const result = await task();
    markCommercialMapStage(`${name}:end`, performance.now() - start);
    return result;
  } catch (error) {
    markCommercialMapStage(`${name}:end`, performance.now() - start, true);
    throw error;
  }
}
