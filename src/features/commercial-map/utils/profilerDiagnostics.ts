import type { ProfilerOnRenderCallback } from 'react';
import { commercialMapDiagnosticsEnabled } from './performanceDiagnostics';
export const recordCommercialMapProfiler: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  if (!commercialMapDiagnosticsEnabled) return;
  const diagnostics = window.__commercialMapRuntimeDiagnostics;
  if (!diagnostics) return;
  diagnostics.reactCommits.push({
    type: 'react-commit',
    at: commitTime,
    id,
    phase,
    actualDuration: Number(actualDuration.toFixed(3)),
    baseDuration: Number(baseDuration.toFixed(3)),
    startTime: Number(startTime.toFixed(3)),
  });
  if (diagnostics.reactCommits.length > 240) diagnostics.reactCommits.splice(0, diagnostics.reactCommits.length - 240);
};
