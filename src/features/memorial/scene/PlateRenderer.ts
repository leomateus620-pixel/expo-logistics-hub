import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { faceUrl, thumbnailUrl, pieceAssets, type MemorialPiece } from '../catalog';
import { fitPlate, initialPose, textureLimit, textureTarget, type InspectionPose } from '../inspectionMath';

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

/** One active context, bounded progressive face textures and on-demand frames.
 * Lighting affects only the metal; historical lettering keeps its original color.
 */
export class PlateRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(37, 1, .01, 30);
  private plate = new THREE.Group();
  private resources = new Set<THREE.BufferGeometry | THREE.Material>();
  private environment?: THREE.WebGLRenderTarget;
  private bitmap?: ImageBitmap;
  private texture?: THREE.Texture;
  private ink?: THREE.MeshBasicMaterial;
  private fullBlob?: Blob;
  private disposed = false;
  private abort = new AbortController();
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private promotionTimer = 0;
  private promoting = false;
  private textureLong = 0;
  private failedPromotion = false;
  private pose = initialPose();
  private size = { width: 1, height: 1 };
  private renderedFrames = 0;
  private startedAt = performance.now();
  private memoryGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  private asset: ReturnType<typeof pieceAssets>;
  private aspect: number;

  constructor(private canvas: HTMLCanvasElement, private piece: MemorialPiece, private onReady: () => void, private onError: () => void) {
    canvas.dataset.pieceId = piece.id;
    this.asset = pieceAssets(piece); this.aspect = this.asset.width / this.asset.height;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.memoryGB <= 4 ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    const generator = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment();
    try { this.environment = generator.fromScene(room, .04); this.scene.environment = this.environment.texture; }
    finally { room.dispose(); generator.dispose(); }
    this.scene.environmentIntensity = .7;
    const key = new THREE.DirectionalLight('#ffe4ac', 3.4); key.position.set(-3, 5, 4);
    const rim = new THREE.DirectionalLight('#f2c669', 2); rim.position.set(3, -1, 2);
    this.scene.add(key, rim, new THREE.HemisphereLight('#f6eedb', '#171714', 1.2), this.plate);
    this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(canvas);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    document.addEventListener('visibilitychange', this.visibilityChanged);
  }
  private own<T extends THREE.BufferGeometry | THREE.Material>(resource: T): T { this.resources.add(resource); return resource; }
  private async blob(url: string) {
    const response = await fetch(url, { signal: this.abort.signal });
    if (!response.ok) throw new Error('Texture unavailable');
    return response.blob();
  }
  async initialize() {
    try {
      const height = 2.48, width = height * this.aspect;
      const shape = outline(width, height, this.piece.model.cornerRadius * height);
      const depth = this.piece.model.depth * height;
      const body = this.own(new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 4, curveSegments: 8 }));
      body.translate(0, 0, -depth);
      const gold = this.piece.model.profile !== 'matte';
      const metal = this.own(new THREE.MeshStandardMaterial({ color: gold ? '#d5ab54' : '#53503d', metalness: gold ? .9 : .55, roughness: gold ? .3 : .52 }));
      this.plate.add(new THREE.Mesh(body, metal));
      const face = this.own(new THREE.ShapeGeometry(shape, 8));
      const positions = face.getAttribute('position'), uv = face.getAttribute('uv');
      for (let i = 0; i < positions.count; i++) uv.setXY(i, positions.getX(i) / width + .5, positions.getY(i) / height + .5);
      this.ink = this.own(new THREE.MeshBasicMaterial({ toneMapped: false }));
      const front = new THREE.Mesh(face, this.ink); front.position.z = .014; this.plate.add(front);
      if (this.piece.model.screws) {
        const screw = this.own(new THREE.SphereGeometry(.014, 10, 6));
        for (const x of [-1, 1]) for (const y of [-1, 1]) {
          const head = new THREE.Mesh(screw, metal); head.scale.z = .33;
          head.position.set(x*(width/2-.035),y*(height/2-.035),.018); this.plate.add(head);
        }
      }
      // A small decoded preview is displayed before the full face is fetched.
      let preview: Blob;
      try { preview = await this.blob(thumbnailUrl(this.piece)); }
      catch { preview = await this.blob(faceUrl(this.piece)); this.fullBlob = preview; }
      await this.installTexture(preview, 420);
      if (this.disposed) return;
      this.resize();
      this.canvas.dataset.readyMs = String(Math.round(performance.now() - this.startedAt));
      this.canvas.dataset.quality = 'progressive';
      this.onReady(); this.requestPromotion();
    } catch { if (!this.disposed) this.onError(); }
  }
  private async installTexture(blob: Blob, longEdge: number) {
    const ratio = this.aspect;
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY', resizeWidth: Math.max(1, Math.round(ratio <= 1 ? longEdge * ratio : longEdge)), resizeHeight: Math.max(1, Math.round(ratio <= 1 ? longEdge : longEdge / ratio)), resizeQuality: 'high' });
    if (this.disposed) { bitmap.close(); return; }
    const texture = new THREE.Texture(bitmap);
    texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8);
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true; texture.needsUpdate = true;
    const oldTexture = this.texture, oldBitmap = this.bitmap;
    this.texture = texture; this.bitmap = bitmap; this.textureLong = longEdge;
    if (this.ink) { this.ink.map = texture; this.ink.needsUpdate = true; }
    // Pose/camera are not touched by a texture promotion.
    this.render(); oldTexture?.dispose(); oldBitmap?.close();
    this.canvas.dataset.textureSize = `${bitmap.width}×${bitmap.height}`;
    this.canvas.dataset.faceTextureBytes = String(Math.ceil(bitmap.width * bitmap.height * 4 * 4 / 3));
  }
  private targetTexture() {
    const sourceWidth = 'artWidth' in this.asset ? this.asset.artWidth : this.asset.width;
    const sourceHeight = 'artHeight' in this.asset ? this.asset.artHeight : this.asset.height;
    const limit = textureLimit(sourceWidth, sourceHeight, this.renderer.capabilities.maxTextureSize, this.memoryGB);
    const fit = fitPlate(this.size, this.aspect);
    return textureTarget(Math.max(fit.width, fit.height), this.renderer.getPixelRatio(), this.pose.scale, limit);
  }
  private requestPromotion() {
    if (this.disposed || this.failedPromotion || !this.texture || this.promoting) return;
    window.clearTimeout(this.promotionTimer);
    this.promotionTimer = window.setTimeout(() => void this.promote(), 120);
  }
  private async promote() {
    const target = this.targetTexture();
    if (this.disposed || this.promoting || target <= this.textureLong) return;
    this.promoting = true;
    try {
      this.fullBlob ??= await this.blob(faceUrl(this.piece));
      if (!this.disposed) await this.installTexture(this.fullBlob, target);
    } catch { this.failedPromotion = true; this.canvas.dataset.textureUpgrade = 'unavailable'; }
    finally { this.promoting = false; if (!this.disposed && !this.failedPromotion && this.targetTexture() > this.textureLong) this.requestPromotion(); }
  }
  setPose(pose: InspectionPose) { this.pose = { ...pose }; this.schedule(); this.requestPromotion(); }
  private schedule() {
    if (this.frame || this.disposed || document.hidden) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }
  private render() {
    if (this.disposed || document.hidden) return;
    const fit = fitPlate(this.size, this.aspect), units = 2.48 / fit.height;
    this.plate.position.set(this.pose.x * units, -this.pose.y * units, 0);
    this.plate.scale.setScalar(this.pose.scale);
    this.plate.rotation.set(this.pose.pitch, this.pose.yaw, 0);
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.frames = String(++this.renderedFrames);
    this.canvas.dataset.geometries = String(this.renderer.info.memory.geometries);
    this.canvas.dataset.textures = String(this.renderer.info.memory.textures);
    this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
  }
  resize = () => {
    if (this.disposed) return;
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (width < 1 || height < 1) return;
    this.size = { width, height };
    this.camera.aspect = width / height;
    const fit = fitPlate(this.size, this.aspect);
    this.camera.position.z = (2.48 / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * height / fit.height;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false); this.schedule(); this.requestPromotion();
  };
  private visibilityChanged = () => { if (!document.hidden) this.resize(); else { cancelAnimationFrame(this.frame); this.frame = 0; } };
  private contextLost = (event: Event) => { event.preventDefault(); if (!this.disposed) this.onError(); };
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.abort.abort(); cancelAnimationFrame(this.frame); window.clearTimeout(this.promotionTimer);
    this.resizeObserver.disconnect(); document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.resources.forEach(resource => resource.dispose()); this.resources.clear();
    this.texture?.dispose(); this.bitmap?.close(); this.fullBlob = undefined; this.environment?.dispose();
    this.scene.clear(); this.renderer.dispose();
    // React effect restarts can reuse a connected canvas. Losing that context
    // asynchronously would also invalidate its replacement renderer.
    if (!this.canvas.isConnected) this.renderer.forceContextLoss();
    this.canvas.dataset.disposed = 'true';
  }
}
