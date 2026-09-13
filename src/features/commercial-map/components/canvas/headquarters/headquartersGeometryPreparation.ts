import { createHeadquartersGeometry } from './geometry';
import { buildShell } from './architecture';
import { buildFrontage } from './landscape';
import { buildSoybeanMonument } from './monument';
import { bakeArchitecturalContact } from './contact';
import { packHeadquartersGeometry, type PreparedHeadquartersGeometry } from './headquartersGeometryPacking';

/** Deterministic CPU geometry/occlusion only. This path creates no material,
 * texture, renderer, WebGL context or browser DOM, so it runs unchanged in a worker. */
export function prepareHeadquartersGeometry(): PreparedHeadquartersGeometry {
  const geometryStart = performance.now();
  const builder = createHeadquartersGeometry();
  buildShell(builder);
  buildFrontage(builder);
  buildSoybeanMonument(builder);
  const geometry = builder.finish();
  const geometryMs = performance.now() - geometryStart;
  try {
    const contactStart = performance.now();
    const contact = bakeArchitecturalContact(geometry.geometry);
    return { ...geometry, contact, timings: { geometryMs, contactMs: performance.now() - contactStart } };
  } catch (error) {
    geometry.geometry.forEach((part) => part.geometry.dispose());
    throw error;
  }
}

export function preparePackedHeadquartersGeometry() {
  const prepared = prepareHeadquartersGeometry();
  try { return packHeadquartersGeometry(prepared); }
  finally { prepared.geometry.forEach((part) => part.geometry.dispose()); }
}
