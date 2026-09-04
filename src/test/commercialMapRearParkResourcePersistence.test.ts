import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('rear park quality resource lifetime', () => {
  it('keeps fixed-capacity tree and pole meshes mounted through reduced cycles', () => {
    const source = readFileSync(
      'src/features/commercial-map/components/canvas/RearParkEnvironmentLayer.tsx',
      'utf8',
    );
    expect(source).toContain('REAR_ENVIRONMENT_BUDGET.maximumTreeInstances');
    expect(source).toContain('REAR_ENVIRONMENT_BUDGET.maximumPoleInstances');
    expect(source).toContain('treeResources.poleGeometry');
    expect(source).toContain('visible={poles.length > 0}');
    expect(source).not.toContain('{poles.length > 0 && (');
  });
});
