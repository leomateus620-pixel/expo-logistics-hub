import * as THREE from "three";
import { FENASOJA_COMPLEX } from "../../../data/fenasojaComplexReconstruction";
const hq = FENASOJA_COMPLEX.headquarters;
export function makeArtwork(invalidate: () => void) {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 384;
  const ctx = canvas.getContext("2d")!;
  const sign = new THREE.CanvasTexture(canvas);
  sign.colorSpace = THREE.SRGBColorSpace;
  sign.anisotropy = 8;
  sign.name = "B12:official-white-sign";
  let alive = true;
  const paint = (symbol?: HTMLImageElement) => {
    ctx.fillStyle = "#f4f4f0";
    ctx.fillRect(0, 0, 1536, 384);
    ctx.fillStyle = "#405a6c";
    ctx.font = "bold 143px Arial";
    ctx.textBaseline = "middle";
    ctx.fillText("FENASOJA", 95, 190, 905);
    ctx.font = "26px Arial";
    ctx.fillText("®", 995, 135);
    if (symbol) ctx.drawImage(symbol, 1020, 64, 240, 240);
    ctx.fillStyle = "#122638";
    ctx.font = "bold 45px Arial";
    ctx.fillText("Comissão", 1280, 265);
    ctx.fillText("Central", 1280, 315);
    sign.needsUpdate = true;
    invalidate();
  };
  paint();
  const art = document.createElement("canvas");
  art.width = 1024;
  art.height = 256;
  const c = art.getContext("2d")!;
  const gradient = c.createLinearGradient(0, 0, 1024, 256);
  gradient.addColorStop(0, "#123e34");
  gradient.addColorStop(1, "#087340");
  c.fillStyle = gradient;
  c.fillRect(0, 0, 1024, 256);
  c.fillStyle = "#f1de72";
  c.font = "bold 28px Arial";
  ["NOSSO", "OURO VEM", "DO CAMPO"].forEach((s, i) =>
    c.fillText(s, 28, 50 + i * 32),
  );
  for (let i = 0; i < 5; i++) {
    const x = 310 + i * 143,
      y = 120 + Math.sin(i * 3.3) * 54,
      r = 32 + (i % 3) * 21;
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
    g.addColorStop(0, "#fff2ba");
    g.addColorStop(0.48, "#dac461");
    g.addColorStop(1, "#a77c29");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(x, y, r, r * 0.87, -0.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#836035";
    c.beginPath();
    c.ellipse(
      x + r * 0.2,
      y + r * 0.15,
      r * 0.13,
      r * 0.3,
      -0.5,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  const graphics = new THREE.CanvasTexture(art);
  graphics.colorSpace = THREE.SRGBColorSpace;
  graphics.anisotropy = 8;
  graphics.name = "B12:green-window-artwork";
  const entryCanvas = document.createElement("canvas");
  entryCanvas.width = 1024;
  entryCanvas.height = 1024;
  const e = entryCanvas.getContext("2d")!;
  e.fillStyle = "#124f36";
  e.fillRect(0, 0, 1024, 1024);
  e.fillStyle = "#f0eaa5";
  e.font = "bold 59px Arial";
  ["NOSSO", "OURO VEM", "DO CAMPO"].forEach((s, i) =>
    e.fillText(s, 549, 97 + i * 65),
  );
  e.fillStyle = "#eeeece";
  e.font = "bold 56px Arial";
  e.fillText("FENASOJA", 36, 240);
  for (let i = 0; i < 7; i++) {
    const x = 80 + ((i * 193) % 850),
      y = 430 + ((i * 117) % 520),
      r = 26 + (i % 3) * 33;
    const g = e.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
    g.addColorStop(0, "#f7e8a4");
    g.addColorStop(0.5, "#cdb253");
    g.addColorStop(1, "#91733f");
    e.fillStyle = g;
    e.beginPath();
    e.ellipse(x, y, r, r * 0.88, 0.5, 0, Math.PI * 2);
    e.fill();
  }
  const entry = new THREE.CanvasTexture(entryCanvas);
  entry.colorSpace = THREE.SRGBColorSpace;
  entry.anisotropy = 8;
  const symbol = new Image();
  symbol.onload = () => {
    if (alive) {
      paint(symbol);
      e.drawImage(symbol, 198, 40, 122, 122);
      entry.needsUpdate = true;
      invalidate();
    }
  };
  symbol.src = hq.sign.symbolAsset;
  return {
    sign,
    graphics,
    entry,
    dispose: () => {
      alive = false;
      symbol.onload = null;
      sign.dispose();
      graphics.dispose();
      entry.dispose();
    },
  };
}
