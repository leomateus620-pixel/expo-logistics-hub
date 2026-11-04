import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SOY_SUMMIT, SOY_SUMMIT_IDENTITY as identity } from '@/config/soy-summit';
import { calculateEventCountdown, eventClock } from '@/lib/event-clock';
import { VENUE } from '../venue-layout';

/** Static art is uploaded once. Only changed 384×192 digit patches update on ticks. */
export function createStagePanel(texture: THREE.Texture, invalidate: () => void) {
  const group = new THREE.Group();group.name = 'Painel Soy Summit';
  const { width, height, y, z } = VENUE.screen;
  const staticMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const staticMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), staticMaterial);
  staticMesh.position.set(0, y, z);group.add(staticMesh);
  const keys = ['days', 'hours', 'minutes', 'seconds'] as const;
  const labels = ['DIAS', 'HORAS', 'MINUTOS', 'SEGUNDOS'];
  const frameGeometry = new RoundedBoxGeometry(2.35, 1.7, .14, 3, .10);
  const faceGeometry = new RoundedBoxGeometry(2.23, 1.58, .05, 3, .075);
  const digitGeometry = new THREE.PlaneGeometry(2.12, 1.06);
  // One shared satin face texture; the grain contour and fine inset rim are static.
  const faceCanvas = document.createElement('canvas');faceCanvas.width = 512;faceCanvas.height = 384;
  const faceContext = faceCanvas.getContext('2d')!;
  const satin = faceContext.createLinearGradient(0, 0, 512, 384);
  satin.addColorStop(0, '#285f49');satin.addColorStop(.48, identity.green);satin.addColorStop(1, identity.cardShadow);
  faceContext.fillStyle = satin;faceContext.fillRect(0, 0, 512, 384);
  faceContext.strokeStyle = '#dfc17766';faceContext.lineWidth = 1.5;
  faceContext.beginPath();faceContext.roundRect(13, 13, 486, 358, 18);faceContext.stroke();
  faceContext.strokeStyle = '#dfc1771f';faceContext.lineWidth = 2;
  faceContext.beginPath();faceContext.ellipse(490, 355, 87, 47, -.65, 0, Math.PI * 2);faceContext.stroke();
  const faceMap = new THREE.CanvasTexture(faceCanvas);faceMap.colorSpace = THREE.SRGBColorSpace;
  const faceMaterial = new THREE.MeshBasicMaterial({ map: faceMap, toneMapped: false });
  const targets: THREE.Object3D[] = [];
  let selected = -1, hovered = -1;
  let uploads = 0;
  const cells = keys.map((key, index) => {
    const card = new THREE.Group();card.name = labels[index];
    card.position.set(-3.75 + index * 2.5, y - .92, z + .09);group.add(card);
    const frameMaterial = new THREE.MeshStandardMaterial({ color: identity.gold, metalness: .65, roughness: .3, emissive: identity.goldDark, emissiveIntensity: .18 });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);card.add(frame);
    const face = new THREE.Mesh(faceGeometry, faceMaterial);face.position.z = .09;face.userData.unit = index;card.add(face);targets.push(face);
    const canvas = document.createElement('canvas');canvas.width = 384;canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    const map = new THREE.CanvasTexture(canvas);map.colorSpace = THREE.SRGBColorSpace;
    map.generateMipmaps = false;map.minFilter = THREE.LinearFilter;
    const material = new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false, depthWrite: false });
    const mesh = new THREE.Mesh(digitGeometry, material);
    mesh.position.set(0, .15, .124);card.add(mesh);
    const labelCanvas = document.createElement('canvas');labelCanvas.width = 512;labelCanvas.height = 128;
    const labelContext = labelCanvas.getContext('2d')!;
    labelContext.fillStyle = identity.goldLight;labelContext.textAlign = 'center';labelContext.textBaseline = 'middle';labelContext.font = '700 76px Arial';labelContext.fillText(labels[index], 256, 68, 448);
    const labelMap = new THREE.CanvasTexture(labelCanvas);labelMap.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2, .5), new THREE.MeshBasicMaterial({ map: labelMap, transparent: true, toneMapped: false, depthWrite: false }));
    label.position.set(0, -.53, .125);card.add(label);
    return { key, map, ctx, card, frameMaterial, last: '' };
  });
  const highlight = (index: number, toggle = false) => {
    if (!toggle && hovered === index) return;
    if (toggle) selected = selected === index ? -1 : index;
    else hovered = index;
    for (let i = 0; i < cells.length; i++) {
      const active = i === selected || i === hovered;
      cells[i].card.position.z = z + (active ? .17 : .09);
      cells[i].frameMaterial.emissiveIntensity = active ? .5 : .18;
    }
    invalidate();
  };
  const statusCanvas = document.createElement('canvas');statusCanvas.width = 1024;statusCanvas.height = 64;
  const statusMap = new THREE.CanvasTexture(statusCanvas);statusMap.colorSpace = THREE.SRGBColorSpace;
  const status = new THREE.Mesh(new THREE.PlaneGeometry(6, .375), new THREE.MeshBasicMaterial({ map: statusMap, transparent: true, toneMapped: false, depthWrite: false }));
  status.position.set(0, y - 2.3, z + .014);group.add(status);
  let started = false;
  const update = () => {
    const value = calculateEventCountdown(SOY_SUMMIT.startsAt, eventClock.now());
    if (value.phase === 'invalid') return;
    for (const cell of cells) {
      const next = String(value[cell.key]).padStart(cell.key === 'days' && value.phase === 'countdown' ? 3 : 2, '0');
      if (next === cell.last) continue;
      cell.last = next;cell.ctx.clearRect(0, 0, 384, 192);
      const gold = cell.ctx.createLinearGradient(0, 32, 0, 170);
      gold.addColorStop(0, '#fff8d8');gold.addColorStop(.28, identity.goldLight);gold.addColorStop(.75, identity.gold);gold.addColorStop(1, identity.goldDark);
      cell.ctx.fillStyle = gold;cell.ctx.textAlign = 'center';cell.ctx.textBaseline = 'middle';
      cell.ctx.font = `800 ${next.length > 3 ? 112 : 142}px Arial`;
      cell.ctx.fillText(next, 192, 104, 370);cell.map.needsUpdate = true;uploads++;
    }
    if (value.phase === 'started' && !started) {
      started = true;const ctx = statusCanvas.getContext('2d')!;
      ctx.fillStyle = '#073d32';ctx.font = '28px Arial';ctx.textAlign = 'center';ctx.fillText('O Soy Summit 2027 começou', 512, 43);statusMap.needsUpdate = true;
    }
    invalidate();
  };
  update();const unsubscribe = eventClock.subscribe(update);
  return { group, dispose: unsubscribe, highlight,
    pick: (ray: THREE.Raycaster) => ray.intersectObjects(targets, false)[0]?.object.userData.unit as number | undefined,
    diagnostics: () => ({ digitUploads: uploads, patchPixels: 384 * 192, staticPixels: 2000 * 900, selectedUnit: selected, hoveredUnit: hovered }) };
}
