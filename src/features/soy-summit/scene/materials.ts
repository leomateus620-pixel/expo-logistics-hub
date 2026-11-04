import * as THREE from 'three';

export function seededRandom(seed: number) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

export function createMaterials() {
  const textures: THREE.Texture[] = [];
  function surface(base: string, kind: 'noise' | 'wood' | 'tiles' | 'pavers') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
    const random = seededRandom(47);
    for (let i = 0; i < (kind === 'wood' ? 2500 : 6500); i++) {
      ctx.fillStyle = random() > .5 ? `rgba(255,255,255,${random() * .04})` : `rgba(0,0,0,${random() * .055})`;
      ctx.fillRect(random() * 256, random() * 256, kind === 'wood' ? 1 : 2, kind === 'wood' ? 20 + random() * 80 : 2);
    }
    if (kind === 'tiles' || kind === 'pavers') {
      const size = kind === 'tiles' ? 128 : 32;
      ctx.strokeStyle = kind === 'tiles' ? '#8c877c66' : '#4d514b70';ctx.lineWidth = 1;
      for (let y = 0; y <= 256; y += size) {
        ctx.beginPath();ctx.moveTo(0, y);ctx.lineTo(256, y);ctx.stroke();
        for (let x = -(y / size % 2) * size; x < 256; x += size * (kind === 'pavers' ? 2 : 1)) ctx.strokeRect(x, y, size * (kind === 'pavers' ? 2 : 1), size);
      }
    }
    const map = new THREE.CanvasTexture(canvas);map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;map.repeat.set(1, 1);map.anisotropy = 8;
    textures.push(map);return map;
  }
  const plaster = surface('#e7e7df', 'noise');
  const wood = surface('#71401e', 'wood');
  const tile = surface('#c9c5b6', 'tiles');
  const pavers = surface('#92948b', 'pavers');
  const asphalt = surface('#545752', 'noise');
  const cloth = surface('#794b39', 'noise');
  const mats = {
    white: new THREE.MeshStandardMaterial({ map: plaster, bumpMap: plaster, bumpScale: .008, roughness: .91 }),
    cream: new THREE.MeshStandardMaterial({ color: '#e6dfcc', roughness: .83 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, bumpMap: wood, bumpScale: .015, roughness: .6 }),
    floor: new THREE.MeshStandardMaterial({ map: tile, roughness: .47, metalness: .03 }),
    pavers: new THREE.MeshStandardMaterial({ map: pavers, bumpMap: pavers, bumpScale: .025, roughness: .95 }),
    asphalt: new THREE.MeshStandardMaterial({ map: asphalt, bumpMap: asphalt, bumpScale: .04, roughness: .96 }),
    dark: new THREE.MeshStandardMaterial({ color: '#20251f', roughness: .64, metalness: .15 }),
    black: new THREE.MeshStandardMaterial({ color: '#10130f', roughness: .95 }),
    seat: new THREE.MeshStandardMaterial({ map: cloth, roughness: .84 }),
    metal: new THREE.MeshStandardMaterial({ color: '#9fa6a1', metalness: .8, roughness: .3 }),
    glass: new THREE.MeshStandardMaterial({ color: '#7b9f9b', metalness: .25, roughness: .15, transparent: true, opacity: .32, depthWrite: false }),
    window: new THREE.MeshStandardMaterial({ color: '#365454', metalness: .25, roughness: .3 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#c9a753', roughness: .82 }),
    blue: new THREE.MeshStandardMaterial({ color: '#4e98b2', roughness: .83 }),
    terracotta: new THREE.MeshStandardMaterial({ color: '#9d7460', roughness: .82 }),
    bark: new THREE.MeshStandardMaterial({ map: surface('#60513c', 'wood'), roughness: 1 }),
    green: new THREE.MeshStandardMaterial({ color: '#3f6630', roughness: .96 }),
    light: new THREE.MeshBasicMaterial({ color: '#fff1c6', toneMapped: false }),
  };
  for (const [key, tileSize] of Object.entries({ white: 2, wood: 2.4, floor: 1.2, pavers: 1.2, asphalt: 2, bark: 1.5 })) {
    mats[key as keyof typeof mats].userData.tileSize = tileSize;
  }
  return { ...mats, dispose: () => { Object.values(mats).forEach(m => m.dispose()); textures.forEach(t => t.dispose()); } };
}
export type Materials = ReturnType<typeof createMaterials>;
