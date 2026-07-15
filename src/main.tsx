import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/cronograma-operational-overrides.css";
import "./styles/cronograma-mobile.css";
import "./styles/cronograma-mobile-overlays.css";

const RECOVERY_KEY = 'fenasoja-recovery-attempted';
const RELOAD_KEY = 'fenasoja-sw-reloaded';

async function nukeCachesAndReload() {
  const ss = safeSession();
  try { if (ss?.getItem(RECOVERY_KEY)) return; } catch {}
  try { ss?.setItem(RECOVERY_KEY, '1'); } catch {}
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {}
  window.location.reload();
}

function safeSession() {
  try { return window.sessionStorage; } catch { return null as any; }
}

function isChunkError(msg?: string, filename?: string) {
  if (!msg && !filename) return false;
  const m = (msg || '').toLowerCase();
  const f = (filename || '').toLowerCase();
  if (
    m.includes('chunkloaderror') ||
    m.includes('failed to fetch dynamically imported module') ||
    m.includes('importing a module script failed') ||
    m.includes('loading chunk') ||
    m.includes('loading css chunk')
  ) return true;
  // TDZ / init errors coming from a hashed asset bundle
  if (
    (m.includes('before initialization') || m.includes("can't access lexical declaration")) &&
    /\/assets\/.*-[a-f0-9]{6,}\.(js|mjs)/.test(f)
  ) return true;
  return false;
}

window.addEventListener('error', (e) => {
  const fname = (e as any)?.filename || '';
  if (
    isChunkError(e?.message, fname) ||
    isChunkError(String((e as any)?.error?.message || (e as any)?.error), fname)
  ) {
    nukeCachesAndReload();
  }
});
window.addEventListener('unhandledrejection', (e) => {
  const reason: any = e?.reason;
  const msg = typeof reason === 'string' ? reason : reason?.message;
  const stack: string = reason?.stack || '';
  if (isChunkError(msg, stack)) nukeCachesAndReload();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // When a new SW is found, ask it to take over immediately
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            sw.postMessage('SKIP_WAITING');
          }
        });
      });
    }).catch(() => {});

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const ss = safeSession();
      try { if (ss?.getItem(RELOAD_KEY)) return; } catch {}
      try { ss?.setItem(RELOAD_KEY, '1'); } catch {}
      window.location.reload();
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
