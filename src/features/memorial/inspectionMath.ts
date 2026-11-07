import { clamp, type Point, type Size } from './surfaceMath';
export interface InspectionPose { scale: number; x: number; y: number; yaw: number; pitch: number }
export const initialPose = (): InspectionPose => ({ scale: 1, x: 0, y: 0, yaw: 0, pitch: 0 });
export function fitPlate(viewport: Size, aspect: number) {
  const height = Math.max(1, Math.min(viewport.height * .9, viewport.width * .9 / aspect));
  return { width: height * aspect, height };
}
export function boundPose(pose: InspectionPose, viewport: Size, aspect: number) {
  const fit = fitPlate(viewport, aspect);
  const x = Math.max(0, (fit.width * pose.scale - viewport.width) / 2 + 24);
  const y = Math.max(0, (fit.height * pose.scale - viewport.height) / 2 + 24);
  return { ...pose, x: clamp(pose.x, -x, x), y: clamp(pose.y, -y, y) };
}
export function zoomPose(pose: InspectionPose, factor: number, anchor: Point, viewport: Size, aspect: number) {
  const scale = clamp(pose.scale * factor, 1, 6), ratio = scale / pose.scale;
  const x = anchor.x - viewport.width / 2, y = anchor.y - viewport.height / 2;
  return boundPose({ ...pose, scale, x: x - (x - pose.x) * ratio, y: y - (y - pose.y) * ratio }, viewport, aspect);
}

/** RGBA + mipmaps; at most the old/new face coexist during a promotion. */
export function textureLimit(width: number, height: number, gpuMax: number, memoryGB = 8) {
  const aspect = Math.min(width, height) / Math.max(width, height);
  const budget = (memoryGB <= 4 ? 16 : 32) * 1024 * 1024;
  return Math.floor(Math.min(Math.max(width, height), gpuMax, memoryGB <= 4 ? 3072 : 4096, Math.sqrt(budget / (aspect * 4 * 4 / 3))));
}
export function textureTarget(projectedLongEdge: number, pixelRatio: number, scale: number, limit: number) {
  const needed = projectedLongEdge * pixelRatio * scale;
  return Math.min(limit, [1024, 1536, 2048, 3072, 4096].find(size => size >= needed) ?? 4096);
}
