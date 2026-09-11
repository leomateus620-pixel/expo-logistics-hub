import { useEffect, useRef, useState } from 'react';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import type { LightingSample } from './LightingPerformanceProbe';
import { readLatestCommercialMapRenderHealth } from '../utils/renderingHealth';

function summarize(samples: LightingSample[]) {
  const range = (key: 'position' | 'quaternion' | 'target' | 'projection') => {
    const first = samples[0]?.[key] ?? [];
    return Math.max(0, ...samples.flatMap((s) => s[key].map((v, i) => Math.abs(v - first[i]))));
  };
  const times = samples.slice(1).map((s) => s.deltaMs).sort((a, b) => a - b);
  const percentile = (p: number) => times[Math.min(times.length - 1, Math.ceil(times.length * p) - 1)] ?? null;
  return {
    foreground: samples.every((s) => s.visible && s.focused),
    frames: samples.length, frameMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) },
    cameraDelta: range('position'), quaternionDelta: range('quaternion'), targetDelta: range('target'), projectionDelta: range('projection'),
    buffers: [...new Set(samples.map((s) => `${s.width}x${s.height}@${s.dpr}`))],
    programs: [...new Set(samples.map((s) => s.programs))],
    sunVisibility: [...new Set(samples.map((s) => s.sunVisible))],
    last: samples.at(-1),
  };
}

export function LightingBenchmark() {
  const active = useRef(true);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState('');
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const run = async () => {
    setStatus('running');
    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) { setStatus('canvas unavailable'); return; }
    const rows = [];
    const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    for (let cycle = 0; cycle < 20 && active.current; cycle++) {
      for (const mode of ['night', 'sunrise'] as const) {
        window.__commercialMapRuntimeDiagnostics?.resetSamples();
        canvas.dispatchEvent(new Event('commercial-map-trace-lighting'));
        const state = useCommercialMapStore.getState();
        if (mode === 'night') state.setNightModeActive(true);
        else state.requestSunrise();
        await delay(mode === 'night' ? 3500 : 8500);
        if (!active.current) return;
        rows.push({ cycle, mode, ...summarize(window.__commercialMapLightingTrace?.samples ?? []),
          health: readLatestCommercialMapRenderHealth(canvas),
          longTasks: window.__commercialMapRuntimeDiagnostics?.longTasks,
        });
        setStatus(`running ${cycle + 1}/20 ${mode}`);
      }
    }
    const report = { userAgent: navigator.userAgent, fixture: true, viewport: [innerWidth, innerHeight, devicePixelRatio], rows,
      performance: window.__commercialMapPerformance,
      resources: performance.getEntriesByType('resource').map((r) => { const e = r as PerformanceResourceTiming; return { name: new URL(e.name).pathname, start: e.startTime, duration: e.duration, bytes: e.transferSize }; }),
      lifecycle: window.__commercialMapRuntimeDiagnostics && {
        canvasMounts: window.__commercialMapRuntimeDiagnostics.canvasMounts,
        controlsCreates: window.__commercialMapRuntimeDiagnostics.controlsCreates,
        rendererCreates: window.__commercialMapRuntimeDiagnostics.rendererCreates,
      },
    };
    setResult(JSON.stringify(report));
    setStatus('complete');
  };
  return <div>
    <button disabled={status.startsWith('running')} onClick={() => void run()}>Medir 20 ciclos de iluminação</button>
    <output data-lighting-benchmark={status}>{status}</output>
    <details><summary>Resultado iluminação (fixture)</summary><pre id="lighting-benchmark-result">{result}</pre></details>
  </div>;
}
