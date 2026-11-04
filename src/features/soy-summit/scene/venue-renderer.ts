import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Architecture } from './builders';
import { createMaterials } from './materials';
import { createExterior, createTree } from './exterior';
import { createDoors } from './doors';
import { createStagePanel } from './stage-panel';
import type { createStageReveal } from './stage-reveal';
import { isPathClear, neighbors, panelViewPosition, pathForEdge, routeBetween, VENUE, VISIT_NODES, type VisitNode, type Point3 } from '../venue-layout';

export type Quality = 'auto' | 'high' | 'balanced' | 'economy';
export type ResolvedQuality = Exclude<Quality, 'auto'>;
export interface VenueCallbacks {
  onReady: () => void;
  onMove: (node: VisitNode, moving: boolean) => void;
  onQuality: (quality: ResolvedQuality) => void;
  onError: (message: string) => void;
  onPreparing: (message: string) => void;
  onPresentation: (active: boolean) => void;
}

export class VenueRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(58, 1, .08, 240);
  private materials = createMaterials();
  private exterior = createExterior(this.materials);
  private tree = createTree(this.materials);
  private doors = createDoors(this.materials);
  private sun = new THREE.DirectionalLight('#fff4df', 2.7);
  private hemisphere = new THREE.HemisphereLight('#e2f0ff', '#7c725c', 1.5);
  private hall?: THREE.Group;
  private auditorium?: THREE.Group;
  private panel?: ReturnType<typeof createStagePanel>;
  private reveal?: Awaited<ReturnType<typeof createStageReveal>>;
  private presenting = false;
  private presented = false;
  private revealStarted = 0;
  private revealResolve?: () => void;
  private hallPromise?: Promise<void>;
  private auditoriumPromise?: Promise<void>;
  private textures = new Set<THREE.Texture>();
  private disposed = false;
  private failed = false;
  private frame?: number;
  private frames = 0;
  private previousTime = 0;
  private previousFrameAnimated = false;
  private frameTimes: number[] = [];
  private slowWindows = 0;
  private qualityChangedAt = 0;
  private quality: Quality = 'auto';
  private resolved: ResolvedQuality = 'balanced';
  private node: VisitNode = 'exterior';
  private move?: { points: THREE.Vector3[]; lengths: number[]; total: number; start: number; duration: number; fromRotation: THREE.Quaternion; toRotation: THREE.Quaternion; target: VisitNode; door?: string };
  private moving = false;
  private pausedAt = 0;
  private dragging?: { id: number; x: number; y: number; distance: number };
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private yaw = 0;
  private pitch = 0;
  private requestSerial = 0;
  private resizeObserver: ResizeObserver;
  private motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private hotspots: { button: HTMLButtonElement; node: VisitNode }[] = [];
  private bootAt = performance.now();
  private readyMs = 0;
  private environment?: THREE.WebGLRenderTarget;

  constructor(private canvas: HTMLCanvasElement, private overlay: HTMLDivElement, private callbacks: VenueCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure = .95;
    this.renderer.shadowMap.enabled = true;this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const generator = new THREE.PMREMGenerator(this.renderer), environmentScene = new RoomEnvironment();
    this.environment = generator.fromScene(environmentScene, .06);this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = .38;environmentScene.dispose();generator.dispose();
    this.scene.background = new THREE.Color('#b2d5eb');this.scene.fog = new THREE.Fog('#d6e3e7', 65, 175);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(195, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#5599ce') }, horizon: { value: new THREE.Color('#deebed') } },
      vertexShader: 'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 top;uniform vec3 horizon;varying vec3 vPosition;void main(){float h=pow(max(normalize(vPosition).y,0.0),.6);gl_FragColor=vec4(mix(horizon,top,h),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    }));this.scene.add(sky);
    this.sun.position.set(-20, 28, 18);this.sun.target.position.set(0, 0, -6);this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, { left: -37, right: 37, top: 35, bottom: -35, near: .5, far: 100 });
    this.sun.shadow.bias = -.00025;this.sun.shadow.normalBias = .055;
    this.scene.add(this.sun, this.sun.target, this.hemisphere, this.exterior, this.tree.group, this.doors.group);
    this.camera.position.set(...VISIT_NODES.exterior.position);this.camera.lookAt(...VISIT_NODES.exterior.target);this.readAngles();
    this.resizeObserver = new ResizeObserver(() => this.resize());this.resizeObserver.observe(canvas);
    canvas.addEventListener('pointerdown', this.pointerDown);canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerEnd);canvas.addEventListener('pointercancel', this.pointerEnd);
    canvas.addEventListener('lostpointercapture', this.pointerEnd);canvas.addEventListener('keydown', this.keyDown);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    window.addEventListener('blur', this.blur);window.addEventListener('focus', this.resume);document.addEventListener('visibilitychange', this.visibility);
    this.motion.addEventListener('change', this.motionChanged);
    this.applyQuality(window.innerWidth < 600 ? 'economy' : 'balanced');
  }

  async initialize() {
    try {
      const [banner, mural] = await Promise.all([this.loadTexture('/soy-summit/banner.webp'), this.loadTexture('/soy-summit/mural-reference-v2.webp')]);
      if (this.disposed) return;
      const art = new Architecture(this.exterior);
      const bannerMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.6), new THREE.MeshStandardMaterial({ map: banner, roughness: .91 }));
      bannerMesh.position.set(-10.4, 7.5, .2);this.exterior.add(bannerMesh);
      for (const x of [-12.6, -8.2]) art.cylinder([x, 5.63, .3], [x, 9.37, .3], .045, this.materials.metal);
      for (const y of [5.63, 9.37]) art.cylinder([-12.6, y, .3], [-8.2, y, .3], .045, this.materials.metal);
      for (const x of [-12.45, -11.45, -10.45, -9.45, -8.35]) for (const y of [5.75, 9.25]) {
        art.add(new THREE.TorusGeometry(.045, .012, 5, 12), this.materials.metal, [x, y, .23]);
        art.cylinder([x, y, .23], [x, y < 7 ? 5.63 : 9.37, .3], .012, this.materials.metal);
      }
      const muralMesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 8 * 778 / 2020), new THREE.MeshStandardMaterial({ map: mural, roughness: .95 }));
      muralMesh.position.set(7.98, 1.55, .195);this.exterior.add(muralMesh);art.finish();
      await this.renderer.compileAsync(this.scene, this.camera);
      if (this.disposed) return;
      this.readyMs = performance.now() - this.bootAt;
      this.refreshHotspots();this.invalidate();this.callbacks.onReady();
    } catch (error) { this.fail(error); }
  }

  private async loadTexture(url: string) {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    if (this.disposed) { texture.dispose(); throw new Error('Visita encerrada'); }
    texture.colorSpace = THREE.SRGBColorSpace;texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures.add(texture);return texture;
  }
  private prepareHall() {
    return this.hallPromise ??= import('./hall').then(({ createHall }) => {
      if (this.disposed) return;
      this.hall = createHall(this.materials);this.scene.add(this.hall);this.invalidate();
    });
  }
  private prepareAuditorium() {
    return this.auditoriumPromise ??= Promise.all([import('./auditorium'), this.loadTexture('/soy-summit/stage-static.webp'), import('./stage-reveal')]).then(async ([module, texture, presentation]) => {
      if (this.disposed) return;
      const reveal = await presentation.createStageReveal();
      if (this.disposed) { reveal.dispose(); return; }
      this.reveal = reveal;
      this.auditorium = module.createAuditorium(this.materials);
      this.auditorium.visible = false;
      this.panel = createStagePanel(texture, this.invalidate);this.auditorium.add(this.panel.group, reveal.group);this.scene.add(this.auditorium);this.invalidate();
    });
  }

  async go(target: VisitNode) {
    if (this.moving || this.presenting || this.disposed || this.failed || target === this.node) return;
    const route = routeBetween(this.node, target);
    if (route.length < 2) return;
    const edges = route.slice(1).map((next, index) => pathForEdge(route[index], next)!);
    if (edges.some(edge => !isPathClear(edge.points))) { this.fail(new Error('O percurso não está disponível.'));return; }
    const serial = ++this.requestSerial;this.moving = true;this.callbacks.onMove(this.node, true);this.refreshHotspots();
    try {
      this.callbacks.onPreparing('Preparando o próximo ambiente…');
      if (route.some(node => node === 'entrance' || VISIT_NODES[node].room !== 'exterior')) await this.prepareHall();
      if (route.some(node => VISIT_NODES[node].room === 'auditorium' || node === 'leftDoor' || node === 'rightDoor')) await this.prepareAuditorium();
      else if (route.includes('hall')) void this.prepareAuditorium().catch(error => this.fail(error));
      if (this.disposed || serial !== this.requestSerial) return;
      this.callbacks.onPreparing('');
      // Every edge is animated separately, including the same doors on return.
      for (let index = 1; index < route.length; index++) {
        if (serial !== this.requestSerial || this.disposed || this.failed) break;
        await this.animateEdge(route[index - 1], route[index]);
        if (!this.presented && VISIT_NODES[this.node].room === 'auditorium' && !this.disposed && !this.failed) {
          await this.playPresentation();
          if (!this.disposed && !this.failed) { this.moving = true; this.callbacks.onMove(this.node, true); }
        }
      }
    } catch (error) { this.fail(error); }
    finally { if (!this.disposed && serial === this.requestSerial) { this.moving = false;this.callbacks.onMove(this.node, false);this.refreshHotspots();this.invalidate(); } }
  }
  private playPresentation() {
    if (!this.reveal || this.disposed || this.failed) return Promise.resolve();
    this.moving = false; this.callbacks.onMove(this.node, false);
    this.presenting = true; this.revealStarted = performance.now(); this.reveal.update(0);
    this.callbacks.onPresentation(true); this.refreshHotspots();
    if (this.motion.matches) { this.skipPresentation(); return Promise.resolve(); }
    this.invalidate(); return new Promise<void>(resolve => { this.revealResolve = resolve; });
  }
  skipPresentation() {
    if (!this.presenting || !this.reveal) return;
    this.reveal.update(this.reveal.duration); this.presenting = false; this.presented = true;
    this.callbacks.onPresentation(false); this.revealResolve?.(); this.revealResolve = undefined;
    this.refreshHotspots(); this.invalidate();
  }
  replayPresentation() {
    if (!this.moving && !this.presenting && VISIT_NODES[this.node].room === 'auditorium') void this.playPresentation();
  }
  private motionChanged = () => { if (this.motion.matches) this.skipPresentation(); };
  private edgeResolve?: () => void;
  private positionFor(node: VisitNode) {
    const point = new THREE.Vector3(...VISIT_NODES[node].position);
    if (node === 'panel') {
      // Fit all four cards on portrait displays by walking farther along the
      // same clear central aisle; preserve human height and a comfortable FOV.
      point.set(...panelViewPosition(this.camera.aspect, this.camera.fov));
    }
    return point;
  }
  private animateEdge(from: VisitNode, target: VisitNode) {
    const edge = pathForEdge(from, target)!;
    const points = edge.points.map(p => new THREE.Vector3(...p));points[0].copy(this.camera.position);
    points[points.length - 1].copy(this.positionFor(target));
    if (!isPathClear(points.map(p => [p.x, p.y, p.z]))) throw new Error('O enquadramento não dispõe de um percurso livre.');
    const doorNode = (node: VisitNode) => node === 'leftDoor' || node === 'rightDoor';
    if (this.auditorium) this.auditorium.visible = VISIT_NODES[from].room === 'auditorium' || VISIT_NODES[target].room === 'auditorium' || doorNode(from) || doorNode(target);
    if (this.hall) this.hall.visible = from !== 'panel' || target !== 'panel';
    this.exterior.visible = VISIT_NODES[from].room !== 'auditorium' || VISIT_NODES[target].room !== 'auditorium';
    this.tree.group.visible = VISIT_NODES[from].room === 'exterior' || VISIT_NODES[target].room === 'exterior';
    const lengths = points.slice(1).map((p, i) => p.distanceTo(points[i]));const total = lengths.reduce((a, b) => a + b, 0);
    const destination = new THREE.PerspectiveCamera();destination.position.copy(points.at(-1)!);destination.lookAt(...VISIT_NODES[target].target);
    const duration = this.motion.matches ? 0 : Math.min(5200, Math.max(900, total * 200));
    this.move = { points, lengths, total, start: performance.now(), duration, fromRotation: this.camera.quaternion.clone(), toRotation: destination.quaternion, target, door: edge.door };
    if (edge.door && this.motion.matches) this.doors.setOpen(edge.door, 1);
    this.invalidate();return new Promise<void>(resolve => { this.edgeResolve = resolve; });
  }

  look(horizontal: number, vertical = 0) {
    if (this.moving) return;
    this.yaw += horizontal;this.pitch = THREE.MathUtils.clamp(this.pitch + vertical, -.65, .65);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));this.invalidate();
  }
  private readAngles() { const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');this.yaw = euler.y;this.pitch = euler.x; }
  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.moving) return;
    this.dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };this.canvas.setPointerCapture(event.pointerId);this.canvas.focus({ preventScroll: true });
  };
  private cardAt(event: PointerEvent) {
    if (this.node !== 'panel' || this.moving || this.presenting || !this.panel) return -1;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);return this.panel.pick(this.ray) ?? -1;
  }
  private pointerMove = (event: PointerEvent) => {
    if (!this.dragging || this.dragging.id !== event.pointerId) {
      const unit = this.cardAt(event);this.panel?.highlight(unit);this.canvas.style.cursor = unit >= 0 ? 'pointer' : 'grab';return;
    }
    this.dragging.distance += Math.abs(event.clientX - this.dragging.x) + Math.abs(event.clientY - this.dragging.y);
    this.look(-(event.clientX - this.dragging.x) * .004, -(event.clientY - this.dragging.y) * .003);
    this.dragging.x = event.clientX;this.dragging.y = event.clientY;
  };
  private pointerEnd = (event: PointerEvent) => {
    if (event.type === 'pointerup' && this.dragging && this.dragging.distance < 6) this.panel?.highlight(this.cardAt(event), true);
    this.dragging = undefined;
  };
  private keyDown = (event: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => this.look(.16), ArrowRight: () => this.look(-.16), ArrowUp: () => this.look(0, .1), ArrowDown: () => this.look(0, -.1),
      Enter: () => { const next = neighbors(this.node).at(-1);if (next) void this.go(next); },
      ...Object.fromEntries(['1', '2', '3', '4'].map((key, i) => [key, () => { if (this.node === 'panel' && !this.presenting) this.panel?.highlight(i, true); }])),
    };
    if (keys[event.key]) { event.preventDefault();keys[event.key](); }
  };
  private blur = () => { this.dragging = undefined;this.pauseMovement(); };
  private pauseMovement() { this.previousFrameAnimated = false;if ((this.move || this.presenting) && !this.pausedAt) this.pausedAt = performance.now(); }
  resume = () => {
    if (this.pausedAt) { const elapsed = performance.now() - this.pausedAt; if (this.move) this.move.start += elapsed; if (this.presenting) this.revealStarted += elapsed; }
    this.pausedAt = 0;this.invalidate();
  };
  private visibility = () => {
    if (document.hidden) { this.pauseMovement();if (this.frame !== undefined) cancelAnimationFrame(this.frame);this.frame = undefined; }
    else this.resume();
  };
  private contextLost = (event: Event) => { event.preventDefault();this.fail(new Error('O contexto gráfico foi interrompido.')); };
  private fail(error: unknown) {
    if (this.disposed || this.failed) return;
    this.failed = true;this.edgeResolve?.();this.edgeResolve = undefined;this.revealResolve?.();this.revealResolve = undefined;this.callbacks.onError(error instanceof Error ? error.message : 'Não foi possível preparar a visita 3D.');
  }

  setQuality(value: Quality) { this.quality = value;this.applyQuality(value === 'auto' ? (window.innerWidth < 600 ? 'economy' : 'balanced') : value); }
  private applyQuality(value: ResolvedQuality) {
    this.resolved = value;this.qualityChangedAt = performance.now();
    this.tree.foliage.count = { high: 6800, balanced: 4500, economy: 2400 }[value];
    const shadowSize = { high: 2048, balanced: 1024, economy: 512 }[value];
    this.sun.shadow.mapSize.setScalar(shadowSize);this.sun.shadow.map?.dispose();this.sun.shadow.map = null;
    this.sun.shadow.needsUpdate = true;this.callbacks.onQuality(value);this.resize();
  }
  private resize() {
    const { width, height } = this.canvas.getBoundingClientRect();if (!width || !height) return;
    const maxDpr = { high: 1.75, balanced: 1.25, economy: 1 }[this.resolved];
    const dpr = Math.min(devicePixelRatio || 1, maxDpr, Math.sqrt(3600000 / (width * height)));
    this.renderer.setPixelRatio(dpr);this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;this.camera.fov = width < 600 ? 65 : 58;this.camera.updateProjectionMatrix();
    if (this.node === 'panel' && !this.moving) { this.camera.position.copy(this.positionFor('panel'));this.camera.lookAt(...VISIT_NODES.panel.target);this.readAngles(); }
    this.invalidate();
  }

  private refreshHotspots() {
    this.overlay.replaceChildren();this.hotspots = [];
    if (this.moving || this.presenting) return;
    for (const node of neighbors(this.node)) {
      const button = document.createElement('button');button.type = 'button';button.className = 'soy-visit__hotspot';
      button.textContent = VISIT_NODES[node].label;button.setAttribute('aria-label', `Ir para ${VISIT_NODES[node].label}`);
      button.addEventListener('click', () => void this.go(node));this.overlay.append(button);this.hotspots.push({ button, node });
    }
  }
  private projectHotspots() {
    for (const spot of this.hotspots) {
      const p: Point3 = VISIT_NODES[spot.node].position;
      const projected = new THREE.Vector3(p[0], p[1] - .7, p[2]).project(this.camera);
      const visible = projected.z < 1 && Math.abs(projected.x) < .85 && Math.abs(projected.y) < .75;
      spot.button.hidden = !visible;
      spot.button.style.left = `${(projected.x + 1) * 50}%`;spot.button.style.top = `${(1 - projected.y) * 50}%`;
    }
  }
  private invalidate = () => { if (this.frame === undefined && !this.disposed && !this.failed && !document.hidden) this.frame = requestAnimationFrame(this.render); };
  private render = (time: number) => {
    this.frame = undefined;if (this.disposed || this.failed) return;
    const animating = Boolean((this.move || this.presenting) && !this.pausedAt);
    if (this.presenting && this.reveal && !this.pausedAt) {
      const elapsed = (time - this.revealStarted) / 1000;
      this.reveal.update(Math.min(elapsed, this.reveal.duration));
      if (elapsed >= this.reveal.duration) this.skipPresentation();
    }
    if (this.move && !this.pausedAt) {
      const move = this.move;const elapsed = time - move.start;
      const doorWait = move.door && move.duration ? 430 : 0;
      if (move.door) this.doors.setOpen(move.door, move.duration ? Math.min(1, elapsed / 400) : 1);
      const progress = move.duration ? THREE.MathUtils.clamp((elapsed - doorWait) / move.duration, 0, 1) : 1;
      const eased = progress * progress * (3 - 2 * progress);
      let distance = move.total * eased, segment = 0;
      while (segment < move.lengths.length - 1 && distance > move.lengths[segment]) distance -= move.lengths[segment++];
      this.camera.position.copy(move.points[segment]).lerp(move.points[segment + 1], Math.min(1, distance / (move.lengths[segment] || 1)));
      this.camera.quaternion.slerpQuaternions(move.fromRotation, move.toRotation, eased);
      if (progress >= 1) {
        this.node = move.target;this.move = undefined;this.readAngles();
        const room = VISIT_NODES[this.node].room;
        this.exterior.visible = room !== 'auditorium';this.tree.group.visible = room === 'exterior';
        if (this.hall) this.hall.visible = this.node !== 'panel';
        if (this.auditorium) this.auditorium.visible = room === 'auditorium' || this.node === 'leftDoor' || this.node === 'rightDoor';
        if (this.node === 'hall') { this.doors.setOpen('left', 0);this.doors.setOpen('right', 0); }
        this.hemisphere.intensity = room === 'exterior' ? 1.5 : .85;
        this.callbacks.onMove(this.node, true);this.edgeResolve?.();this.edgeResolve = undefined;
      }
    }
    this.renderer.render(this.scene, this.camera);this.frames++;this.projectHotspots();
    const duration = time - this.previousTime;
    // Exclude idle/hidden intervals, but retain genuine long movement frames.
    // Dropping frames >=100ms would hide stalls and defeat adaptive quality.
    if (animating && this.previousFrameAnimated && duration > 0) {
      this.frameTimes.push(duration);if (this.frameTimes.length > 120) this.frameTimes.shift();
      if (this.frames % 90 === 0 && this.frameTimes.length >= 60 && this.quality === 'auto') {
        const average = this.frameTimes.reduce((sum, dt) => sum + dt, 0) / this.frameTimes.length;
        this.slowWindows = average > 28 ? this.slowWindows + 1 : 0;
        if (this.slowWindows >= 2 && time - this.qualityChangedAt > 15000 && this.resolved !== 'economy') {
          this.applyQuality(this.resolved === 'high' ? 'balanced' : 'economy');this.slowWindows = 0;
        }
      }
    }
    this.previousTime = time;
    this.previousFrameAnimated = Boolean((this.move || this.presenting) && !this.pausedAt);
    if ((this.move || this.presenting) && !this.pausedAt) this.invalidate();
  };

  diagnostics() {
    return { node: this.node, moving: this.moving, paused: !!this.pausedAt, transition: this.move?.target, failed: this.failed, frames: this.frames, readyMs: this.readyMs, quality: this.resolved,
      calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
      programs: this.renderer.info.programs?.length, drawingBuffer: [this.canvas.width, this.canvas.height],
      frameTimes: [...this.frameTimes], camera: this.camera.position.toArray(), panel: this.panel?.diagnostics(), presenting: this.presenting, presented: this.presented, reveal: this.reveal?.diagnostics() };
  }
  dispose() {
    if (this.disposed) return;this.disposed = true;this.requestSerial++;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.edgeResolve?.();this.revealResolve?.();this.panel?.dispose();this.resizeObserver.disconnect();this.overlay.replaceChildren();
    this.canvas.removeEventListener('pointerdown', this.pointerDown);this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerEnd);this.canvas.removeEventListener('pointercancel', this.pointerEnd);
    this.canvas.removeEventListener('lostpointercapture', this.pointerEnd);this.canvas.removeEventListener('keydown', this.keyDown);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);window.removeEventListener('blur', this.blur);window.removeEventListener('focus', this.resume);document.removeEventListener('visibilitychange', this.visibility);
    this.motion.removeEventListener('change', this.motionChanged);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);(Array.isArray(object.material) ? object.material : [object.material]).forEach(material => {
          materials.add(material);
          Object.values(material).forEach(value => { if (value instanceof THREE.Texture) this.textures.add(value); });
        });
        if (object instanceof THREE.InstancedMesh) object.dispose();
        if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
      }
    });
    geometries.forEach(g => g.dispose());materials.forEach(m => m.dispose());this.textures.forEach(t => t.dispose());
    this.materials.dispose();this.sun.shadow.map?.dispose();this.environment?.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.scene.clear();
  }
}
