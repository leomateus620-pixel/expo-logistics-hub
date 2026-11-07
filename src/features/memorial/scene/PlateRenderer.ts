import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { faceUrl, pieceAssets, type MemorialPiece } from '../catalog';

function outline(width: number, height: number, radius: number) {
  const x = -width / 2, y = -height / 2, r = radius;
  const shape = new THREE.Shape();
  shape.moveTo(x+r,y); shape.lineTo(x+width-r,y);
  shape.quadraticCurveTo(x+width,y,x+width,y+r); shape.lineTo(x+width,y+height-r);
  shape.quadraticCurveTo(x+width,y+height,x+width-r,y+height); shape.lineTo(x+r,y+height);
  shape.quadraticCurveTo(x,y+height,x,y+height-r); shape.lineTo(x,y+r);
  shape.quadraticCurveTo(x,y,x+r,y);
  return shape;
}

/** Same direct-Three.js/RoomEnvironment pattern as the existing Soy Summit renderer.
 * One context, on-demand frames, bounded inspection and explicit resource ownership.
 * Dimensions of the hidden back, thickness and bevel are display inferences.
 */
export class PlateRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(37, 1, .1, 20);
  private plate = new THREE.Group();
  private resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  private environment?: THREE.WebGLRenderTarget;
  private bitmap?: ImageBitmap;
  private disposed = false;
  private abort = new AbortController();
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private introStart = 0;
  private introDone = false;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private drag?: { id: number; x: number; y: number; startX: number; startY: number; touch: boolean; claimed: boolean };
  private economy = window.innerWidth < 700 || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
  private readyAt = 0;
  private startedAt = performance.now();
  private renderedFrames = 0;

  constructor(private canvas: HTMLCanvasElement, private piece: MemorialPiece, private onReady: () => void, private onError: () => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !this.economy, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.economy ? 1.25 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    const generator = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    try { this.environment = generator.fromScene(room, .04); this.scene.environment = this.environment.texture; }
    finally { room.dispose(); generator.dispose(); }
    this.scene.environmentIntensity = .65;
    const key = new THREE.DirectionalLight('#ffe7b2', 3);
    key.position.set(-3, 5, 4);
    const fill = new THREE.DirectionalLight('#f6efdd', 1.4);
    fill.position.set(3, -1, 3);
    this.scene.add(key, fill, new THREE.HemisphereLight('#f0e9d6', '#171714', 1.4), this.plate);
    this.camera.position.z = 4.7;
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerEnd);
    canvas.addEventListener('pointercancel', this.pointerEnd);
    canvas.addEventListener('lostpointercapture', this.pointerEnd);
    canvas.addEventListener('keydown', this.keyDown);
    this.reduced.addEventListener('change', this.motionChanged);
  }

  private own<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T): T { this.resources.add(resource); return resource; }

  async initialize() {
    try {
      const response = await fetch(faceUrl(this.piece), { signal: this.abort.signal });
      if (!response.ok) throw new Error('Texture unavailable');
      const blob = await response.blob();
      const asset = pieceAssets(this.piece);
      const max = this.economy ? 1024 : 1536;
      // The clean typeset export can be sharper than its photographic crop.
      // Budget from the actual texture dimensions, keeping the restored lettering.
      const textureWidth = 'artWidth' in asset ? asset.artWidth : asset.width;
      const textureHeight = 'artHeight' in asset ? asset.artHeight : asset.height;
      const scale = Math.min(1, max / Math.max(textureWidth, textureHeight));
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY', resizeWidth: Math.round(textureWidth * scale), resizeHeight: Math.round(textureHeight * scale) });
      if (this.disposed) { bitmap.close(); return; }
      this.bitmap = bitmap;
      const texture = this.own(new THREE.Texture(bitmap));
      texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), this.economy ? 2 : 4);
      texture.needsUpdate = true;
      const height = 2.48, width = height * asset.width / asset.height;
      const radius = this.piece.model.cornerRadius * height;
      const depth = this.piece.model.depth * height;
      const shape = outline(width, height, radius);
      const body = this.own(new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: true, bevelSize: .009, bevelThickness: .009, bevelSegments: 3, curveSegments: 6 }));
      body.translate(0, 0, -depth);
      const gold = this.piece.model.profile !== 'matte';
      const material = this.own(new THREE.MeshStandardMaterial({ color: gold ? '#bd994e' : '#222523', metalness: gold ? .85 : .18, roughness: gold ? .38 : .87 }));
      this.plate.add(new THREE.Mesh(body, material));
      const face = this.own(new THREE.ShapeGeometry(shape, 8));
      const positions = face.getAttribute('position');
      const uv = face.getAttribute('uv');
      for (let i = 0; i < positions.count; i++) uv.setXY(i, positions.getX(i) / width + .5, positions.getY(i) / height + .5);
      // The photograph already contains the historical finish. Keep inscription colors independent of lighting.
      const ink = this.own(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
      const front = new THREE.Mesh(face, ink); front.position.z = .011; this.plate.add(front);
      if (this.piece.model.screws) {
        const screw = this.own(new THREE.SphereGeometry(.014, 10, 6));
        for (const x of [-1, 1]) for (const y of [-1, 1]) {
          const head = new THREE.Mesh(screw, material);
          head.scale.z = .33;
          head.position.set(x*(width/2-.035),y*(height/2-.035),.014);
          this.plate.add(head);
        }
      }
      this.readyAt = performance.now();
      this.canvas.dataset.readyMs = String(Math.round(this.readyAt - this.startedAt));
      this.canvas.dataset.quality = this.economy ? 'economy' : 'balanced';
      this.canvas.dataset.textureSize = `${bitmap.width}×${bitmap.height}`;
      this.introDone = this.reduced.matches;
      this.canvas.dataset.reducedMotion = String(this.reduced.matches);
      if (this.introDone) this.canvas.dataset.pose = 'frontal';
      this.resize(); this.onReady();
      if (!this.introDone) this.frame = requestAnimationFrame(this.intro);
    } catch (error) {
      if (!this.disposed && !(error instanceof DOMException && error.name === 'AbortError')) this.onError();
    }
  }

  private intro = (time: number) => {
    if (this.disposed || this.introDone) return;
    if (!this.introStart) this.introStart = time;
    const progress = Math.min(1, (time-this.introStart)/650);
    const remaining = Math.pow(1-progress, 3);
    this.plate.position.y = -.12*remaining;
    this.plate.rotation.y = -.16*remaining;
    this.render();
    if (progress < 1) this.frame = requestAnimationFrame(this.intro);
    else { this.introDone = true; this.canvas.dataset.pose = 'frontal'; }
  };
  private stopIntro() { this.introDone = true; cancelAnimationFrame(this.frame); this.plate.position.y = 0; }
  private render() {
    if (this.disposed || document.hidden) return;
    const start = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.frames = String(++this.renderedFrames);
    if (performance.now()-start > 55 && !this.economy) {
      this.economy = true; this.renderer.setPixelRatio(1); this.resize();
      this.canvas.dataset.quality = 'economy';
    }
    this.canvas.dataset.geometries = String(this.renderer.info.memory.geometries);
    this.canvas.dataset.textures = String(this.renderer.info.memory.textures);
  }
  private resize = () => {
    if (this.disposed) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(width,height,false); this.render();
  };
  zoom(direction: number) { this.stopIntro(); this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z - direction * .5, 2.6, 7); this.render(); }
  rotate(horizontal: number, vertical = 0) {
    this.stopIntro();
    this.plate.rotation.y = THREE.MathUtils.clamp(this.plate.rotation.y + horizontal, -.7, .7);
    this.plate.rotation.x = THREE.MathUtils.clamp(this.plate.rotation.x + vertical, -.38, .38);
    this.canvas.dataset.pose = 'inspection'; this.render();
  }
  frontal() { this.stopIntro(); this.plate.rotation.set(0,0,0); this.camera.position.z = 4.7; this.canvas.dataset.pose = 'frontal'; this.render(); }
  private pointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) { this.drag = undefined; return; }
    this.stopIntro();
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, touch: event.pointerType === 'touch', claimed: false };
  };
  private pointerMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.claimed) {
      const dx = Math.abs(event.clientX-drag.startX), dy = Math.abs(event.clientY-drag.startY);
      if (drag.touch && (dx < 8 || dx < dy * 1.3)) return;
      drag.claimed = true;
      this.canvas.setPointerCapture(event.pointerId);
    }
    this.rotate((event.clientX-drag.x)*.006, drag.touch ? 0 : (event.clientY-drag.y)*.004);
    drag.x = event.clientX; drag.y = event.clientY;
  };
  private pointerEnd = () => { this.drag = undefined; };
  private keyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const handlers: Record<string, () => void> = {
      ArrowLeft: () => this.rotate(-.12), ArrowRight: () => this.rotate(.12),
      ArrowUp: () => this.rotate(0,-.1), ArrowDown: () => this.rotate(0,.1),
      '+': () => this.zoom(1), '=': () => this.zoom(1), '-': () => this.zoom(-1), Home: () => this.frontal(),
    };
    if (handlers[event.key]) { event.preventDefault(); handlers[event.key](); }
  };
  private motionChanged = () => { if (this.reduced.matches) this.frontal(); };
  private contextLost = (event: Event) => { event.preventDefault(); if (!this.disposed) this.onError(); };

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.abort.abort(); cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect(); this.reduced.removeEventListener('change', this.motionChanged);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerEnd);
    this.canvas.removeEventListener('pointercancel', this.pointerEnd);
    this.canvas.removeEventListener('lostpointercapture', this.pointerEnd);
    this.canvas.removeEventListener('keydown', this.keyDown);
    this.resources.forEach(resource => resource.dispose()); this.resources.clear();
    this.bitmap?.close(); this.environment?.dispose();
    this.scene.clear(); this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
