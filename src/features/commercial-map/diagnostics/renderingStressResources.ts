import type { CommercialMapRuntimeSummary } from '../utils/runtimeDiagnostics';

export type CommercialMapStressPhase = 'hydrology' | 'quality';
type ResourceMetric = 'geometries' | 'textures' | 'programs';
const RESOURCE_METRICS: ResourceMetric[] = ['geometries', 'textures', 'programs'];
const WARMUP_SAMPLES = 2;
const MINIMUM_WARM_SAMPLES = 4;
const MINIMUM_GROWTH = 3;

interface ResourceSnapshot {
  phase: CommercialMapStressPhase | 'baseline';
  cycle: number;
  target: boolean;
  runtime: Pick<CommercialMapRuntimeSummary, 'renderer'>;
}

interface ResourceTrend {
  metric: ResourceMetric;
  fromCycle: number;
  toCycle: number;
  from: number;
  to: number;
  growth: number;
  positiveSteps: number;
  leaking: boolean;
}

interface ResourceGroup {
  phase: CommercialMapStressPhase;
  target: boolean;
  configuration: string;
  samples: number;
  warmSamples: number;
  assessable: boolean;
  trends: ResourceTrend[];
}

export interface CommercialMapStressResourceAnalysis {
  status: 'passed' | 'failed' | 'inconclusive';
  warmupSamples: number;
  minimumWarmSamples: number;
  growthThreshold: number;
  requiredBuckets: number;
  coveredBuckets: number;
  groups: ResourceGroup[];
  issues: string[];
}

/** Compare like-for-like warmed configurations, never normal against hydro/reduced. */
export function analyzeCommercialMapStressResources(
  snapshots: readonly ResourceSnapshot[],
  phases: readonly CommercialMapStressPhase[],
): CommercialMapStressResourceAnalysis {
  const buckets = new Map<string, ResourceSnapshot[]>();
  const required = new Set(phases.flatMap((phase) => [`${phase}:true`, `${phase}:false`]));
  for (const snapshot of snapshots) {
    const renderer = snapshot.runtime.renderer;
    if (snapshot.phase === 'baseline' || !renderer) continue;
    if (!Number.isFinite(renderer.dpr) || renderer.dpr <= 0
      || !Number.isFinite(renderer.width) || renderer.width <= 0
      || !Number.isFinite(renderer.height) || renderer.height <= 0
      || RESOURCE_METRICS.some((metric) => !Number.isSafeInteger(renderer[metric]) || renderer[metric] < 0)) continue;
    const key = JSON.stringify([
      snapshot.phase, snapshot.target, renderer.qualityTier,
      renderer.width, renderer.height, renderer.dpr,
    ]);
    const bucket = buckets.get(key) ?? [];
    // Capturing the same cycle twice cannot manufacture the minimum evidence.
    if (!bucket.some((previous) => previous.cycle === snapshot.cycle)) bucket.push(snapshot);
    buckets.set(key, bucket);
  }

  const groups: ResourceGroup[] = [];
  const issues: string[] = [];
  const covered = new Set<string>();
  let leaking = false;
  for (const [configuration, samples] of buckets) {
    samples.sort((a, b) => a.cycle - b.cycle);
    const first = samples[0];
    const phase = first.phase as CommercialMapStressPhase;
    const warm = samples.slice(WARMUP_SAMPLES);
    const assessable = warm.length >= MINIMUM_WARM_SAMPLES;
    const trends: ResourceTrend[] = [];
    if (assessable) {
      covered.add(`${phase}:${first.target}`);
      for (const metric of RESOURCE_METRICS) {
        let start = 0;
        let positiveSteps = 0;
        for (let index = 1; index < warm.length; index += 1) {
          const previous = warm[index - 1].runtime.renderer![metric];
          const value = warm[index].runtime.renderer![metric];
          if (value < previous) {
            // Bounded reclamation ends a growth run; an earlier temporary
            // increase is not a leak if the renderer later releases it.
            start = index;
            positiveSteps = 0;
          } else if (value > previous) positiveSteps += 1;
        }
        const from = warm[start];
        const to = warm[warm.length - 1];
        const growth = to.runtime.renderer![metric] - from.runtime.renderer![metric];
        const isLeak = growth >= MINIMUM_GROWTH && positiveSteps >= MINIMUM_GROWTH;
        trends.push({
          metric, fromCycle: from.cycle, toCycle: to.cycle,
          from: from.runtime.renderer![metric], to: to.runtime.renderer![metric],
          growth, positiveSteps, leaking: isLeak,
        });
        if (isLeak) {
          leaking = true;
          issues.push(`${phase}:${first.target} ${metric} +${growth} across ${positiveSteps} increases (cycles ${from.cycle}–${to.cycle}; ${configuration})`);
        }
      }
    }
    groups.push({ phase, target: first.target, configuration, samples: samples.length, warmSamples: warm.length, assessable, trends });
  }
  for (const bucket of required) {
    if (!covered.has(bucket)) issues.push(`insufficient-warm-resource-samples: ${bucket}`);
  }
  const coveredBuckets = [...required].filter((bucket) => covered.has(bucket)).length;
  return {
    status: leaking ? 'failed' : required.size > 0 && coveredBuckets === required.size ? 'passed' : 'inconclusive',
    warmupSamples: WARMUP_SAMPLES,
    minimumWarmSamples: MINIMUM_WARM_SAMPLES,
    growthThreshold: MINIMUM_GROWTH,
    requiredBuckets: required.size,
    coveredBuckets,
    groups,
    issues,
  };
}
