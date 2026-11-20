#!/usr/bin/env node
/** Renderiza os dois planos no mapa de diagnóstico local. Não altera a aplicação ou o banco. */
const { mkdtemp, mkdir, rm, writeFile, rename } = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseArgs } = require("node:util");

const shots = { "00": { name: "00-parque", count: 114 }, "09": { name: "09-embarque-parque", count: 84 } };
const { values } = parseArgs({
  options: {
    out: { type: "string" },
    shot: { type: "string", default: "both" },
    url: { type: "string" },
    smoke: { type: "boolean" },
    "full-hd": { type: "boolean" },
    "4k": { type: "boolean" },
    ffmpeg: { type: "string", default: "ffmpeg" },
    help: { type: "boolean", short: "h" },
  },
});
const usage =
  "node scripts/filme-fenasoja-2028/parque/render.cjs --out PASTA [--shot 00|09|both] [--smoke] [--full-hd|--4k] [--ffmpeg CAMINHO] [--url URL_LOCAL_DO_VITE]";
if (values.help) {
  console.log(usage);
  process.exit(0);
}
if (!values.out || !["00", "09", "both"].includes(values.shot) || (values["4k"] && values["full-hd"])) {
  console.error(usage);
  process.exit(2);
}
const width = values["4k"] ? 3840 : values["full-hd"] ? 1920 : 1280;
const viewport = { width, height: width * 9 / 16 };
const output = path.resolve(values.out),
  project = path.resolve(__dirname, "../../..");

function ffmpeg(args) {
  const result = spawnSync(values.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Falha na conversão de vídeo com FFmpeg.");
}

async function capture(browser, origin, shot, work) {
  const { count, name } = shots[shot];
  const indices = values.smoke ? [0, Math.floor(count / 2), count - 1] : Array.from({ length: count }, (_, i) => i);
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, serviceWorkers: "block" });
  try {
    page.on("pageerror", (error) => console.error(error.message));
    await page.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== origin) return route.abort();
      // Expõe a geometria do modelo somente nesta resposta local da sessão de captura.
      if (requestUrl.pathname.endsWith("/VisitHelicopterModel.tsx") && requestUrl.searchParams.has("filme")) {
        const response = await route.fetch();
        const renderExports = "export {buildHelicopterBody,buildHelicopterMainRotor,buildHelicopterTailRotor};";
        return route.fulfill({ response, body: (await response.text()) + "\n" + renderExports + "\n" });
      }
      return route.continue();
    });
    await page.goto(origin + "/__dev/commercial-map-rendering?qualityQa=ULTRA", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector("canvas");
        return (
          canvas?.dataset.territoryQa === "ready" &&
          canvas.dataset.commercialMapReady === "true" &&
          JSON.parse(canvas.dataset.commercialMapRenderHealth || "{}").status === "ready"
        );
      },
      null,
      { timeout: 90000 },
    );
    await page.addStyleTag({
      content:
        ".commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;}",
    });
    await page.waitForFunction(
      ({ width, height }) => {
        const canvas = document.querySelector("canvas");
        const bounds = canvas?.getBoundingClientRect();
        return bounds?.width === width && bounds.height === height;
      },
      viewport,
      { timeout: 30000 },
    );
    await page.evaluate(async ({ shot, viewport }) => {
      const { prepare } = await import("/scripts/filme-fenasoja-2028/parque/cena.mjs");
      window.renderParkFrame = await prepare(shot, viewport);
    }, { shot, viewport });
    for (const [ordinal, index] of indices.entries()) {
      const { jpg, matte, treeCount, anchor } = await page.evaluate(
        ([idx, total]) => window.renderParkFrame(idx, total),
        [index, count],
      );
      if (!treeCount || anchor.some((x) => x <= 0 || x >= 1))
        throw new Error("Bosque ausente ou Casa B12 fora do enquadramento.");
      const stem = String(ordinal).padStart(4, "0");
      await writeFile(path.join(work, stem + ".jpg"), Buffer.from(jpg, "base64"));
      if (matte) await writeFile(path.join(work, "mask-" + stem + ".png"), Buffer.from(matte, "base64"));
      if (ordinal && (ordinal + 1) % 12 === 0) console.log(shot + " · " + (ordinal + 1) + "/" + indices.length);
      if (!ordinal) console.log(shot + " · " + treeCount + " troncos nas posições do cadastro.");
    }
  } finally {
    await page.close();
  }
  const suffix = values.smoke ? "-amostra" : "";
  const clip = name + suffix + ".mp4",
    input = ["-framerate", "24"];
  ffmpeg([
    ...input,
    "-i",
    path.join(work, "%04d.jpg"),
    "-frames:v",
    String(indices.length),
    "-vf",
    "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "16",
    "-color_range",
    "tv",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-colorspace",
    "bt709",
    "-movflags",
    "+faststart",
    path.join(work, clip),
  ]);
  await rename(path.join(work, clip), path.join(output, clip));
  if (shot === "09") {
    const mask = "09-vegetacao-matte" + suffix + ".mkv";
    ffmpeg([
      ...input,
      "-i",
      path.join(work, "mask-%04d.png"),
      "-frames:v",
      String(indices.length),
      "-c:v",
      "ffv1",
      "-level",
      "3",
      "-pix_fmt",
      "bgr0",
      path.join(work, mask),
    ]);
    await rename(path.join(work, mask), path.join(output, mask));
  }
}

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  const { createServer } = await import("vite");
  await mkdir(output, { recursive: true });
  const scratch = await mkdtemp(path.join(output, ".quadros-"));
  let server, browser;
  try {
    let origin;
    if (values.url) {
      const url = new URL(values.url);
      if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Use o Vite local do projeto em --url.");
      origin = url.origin;
    } else {
      server = await createServer({
        root: project,
        cacheDir: path.join(scratch, "vite"),
        resolve: { dedupe: ["react", "react-dom", "three", "@react-three/fiber"] },
        optimizeDeps: {
          entries: ["index.html", "scripts/filme-fenasoja-2028/parque/cena.mjs"],
          include: [
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "three/examples/jsm/loaders/GLTFLoader.js",
            "three/examples/jsm/libs/meshopt_decoder.module.js",
            "three/examples/jsm/utils/BufferGeometryUtils.js",
          ],
        },
        server: { host: "127.0.0.1", port: 0, open: false, hmr: false },
        logLevel: "error",
      });
      await server.listen();
      origin = new URL(server.resolvedUrls.local[0]).origin;
    }
    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
      headless: true,
      args: ["--enable-webgl", "--ignore-gpu-blocklist"],
    });
    const selection = values.shot === "both" ? ["00", "09"] : [values.shot];
    for (const shot of selection) {
      const frames = path.join(scratch, shot);
      await mkdir(frames);
      await capture(browser, origin, shot, frames);
    }
  } finally {
    await browser?.close();
    await server?.close();
    await rm(scratch, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
