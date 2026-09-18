/* Browser-only, synthetic auth/organization fixture. No production backend writes. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "docs/validation/internal-ground/functional");
const args = process.argv.slice(2);
const url = args[1] || "http://127.0.0.1:4198/mapa-comercial?groundQa&quality=fixed";
const mobile = args.includes("--mobile");
let debugPage;
let debugBrowser;
async function snapshot(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".commercial-map-stage canvas");
    const rect = canvas?.getBoundingClientRect();
    const diagnostics = window.__commercialMapRuntimeDiagnostics;
    diagnostics?.capture();
    const parse = (value) => {
      try {
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    };
    return {
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      page: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      canvasCount: document.querySelectorAll(".commercial-map-stage canvas")
        .length,
      canvas: rect && {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        bufferWidth: canvas.width,
        bufferHeight: canvas.height,
      },
      health: parse(canvas?.dataset.commercialMapRenderHealth),
      camera: parse(canvas?.dataset.commercialMapCameraDiagnostics),
      transition: parse(canvas?.dataset.commercialMapCameraTransition),
      runtime: diagnostics && {
        canvasMounts: diagnostics.canvasMounts,
        activeCanvases: diagnostics.activeCanvases,
        rendererCreates: diagnostics.rendererCreates,
        controlsCreates: diagnostics.controlsCreates,
        activeControls: diagnostics.activeControls,
        rendererIds: diagnostics.rendererIds,
        cameraIds: diagnostics.cameraIds,
        contextLost: diagnostics.contextLost,
        renderer: diagnostics.snapshots.at(-1),
      },
      images: Array.from(document.images, (image) => ({
        src: image.getAttribute("src"),
        complete: image.complete,
        width: image.naturalWidth,
      })),
    };
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  debugBrowser = browser;
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: "pt-BR",
    serviceWorkers: "block",
  });
  const {mutations} = await require('./fixture.cjs').install(context);
  const page = await context.newPage();
  debugPage = page;
  const errors = [];
  const requests = [];
  const resources = [];
  page.on("response", async (response) => {
    try {
      const sizes = await response.request().sizes();
      resources.push({
        url: new URL(response.url()).pathname,
        type: response.request().resourceType(),
        bytes: sizes.responseBodySize,
      });
    } catch {}
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.log("PAGE ERROR", error.message);
  });
  page.on("request", (request) => {
    if (request.resourceType() === "image")
      requests.push(new URL(request.url()).pathname);
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  console.log("Document loaded", url);
  await page.waitForSelector(".commercial-map-stage canvas", {
    timeout: 90000,
  });
  console.log("Canvas mounted");
  await page.waitForFunction(
    () => {
      const raw = document.querySelector(".commercial-map-stage canvas")
        ?.dataset.commercialMapRenderHealth;
      return raw && JSON.parse(raw).status === "ready";
    },
    null,
    { timeout: 90000 },
  );
  await page.waitForTimeout(5000);
  const deferNotifications = page.getByRole("button", {
    name: "Agora não",
    exact: true,
  });
  if (await deferNotifications.isVisible()) await deferNotifications.click();

  const result = {
    errors,
    mutations,
    before: await snapshot(page),
    checks: {},
  };
  await page.screenshot({
    path: path.join(
      OUT,
      `functional-${mobile ? "mobile" : "desktop"}-initial.png`,
    ),
  });
  const canvas = page.locator(".commercial-map-stage canvas");
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await page.mouse.wheel(0, -180);
  await page.waitForTimeout(800);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width * 0.56,
    rect.y + rect.height * 0.52,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.waitForTimeout(800);
  result.checks.navigation =
    JSON.stringify((await snapshot(page)).camera?.position) !==
    JSON.stringify(result.before.camera?.position);
  await page
    .getByRole("button", { name: "Buscar no mapa comercial", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Buscar no mapa comercial", exact: true })
    .press("Enter");
  await page.waitForTimeout(500);
  const filters = page.getByRole("group", {
    name: "Filtrar por situação comercial",
    exact: true,
  });
  await filters.waitFor({state: 'visible', timeout: 15000});
  result.checks.filtersOpened = await filters.isVisible();
  const available = filters.getByRole("button", { name: /Bloqueado/ });
  await available.click();
  result.checks.filterToggled =
    (await available.getAttribute("aria-pressed")) === "true";
  await available.click();
  await page.screenshot({
    path: path.join(
      OUT,
      `functional-${mobile ? "mobile" : "desktop"}-filters.png`,
    ),
  });

  await page.keyboard.press("Escape");
  const close = page.getByRole("button", {
    name: /Fechar filtros|Fechar painel/,
  });
  if (await close.count()) await close.first().click();
  if (
    !(await page
      .getByRole("searchbox", { name: "Buscar no mapa comercial", exact: true })
      .isVisible())
  )
    await page
      .getByRole("button", { name: "Buscar no mapa comercial", exact: true })
      .click();
  await page
    .getByRole("searchbox", { name: "Buscar no mapa comercial", exact: true })
    .fill("B10");
  await page
    .getByRole("searchbox", { name: "Buscar no mapa comercial", exact: true })
    .press("Enter");
  await page.getByRole("option", { name: /B10\./ }).click();
  await page.waitForTimeout(2500);
  result.checks.selection = !!(await page
    .getByRole("button", { name: "Conhecer a história", exact: true })
    .count());

  result.selected = await snapshot(page);
  const interior = page.locator("[data-commercial-map-interior-trigger]");
  if (await interior.count()) {
    await interior.first().click();
    await page.waitForTimeout(3500);
    result.interior = await snapshot(page);
    result.checks.interior = !!result.interior.camera?.interiorEntityId;
  }
  await page.screenshot({
    path: path.join(
      OUT,
      `functional-${mobile ? "mobile" : "desktop"}-selected.png`,
    ),
  });
  if (mobile) {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(1500);
    result.landscape = await snapshot(page);
    await page.screenshot({
      path: path.join(OUT, "functional-mobile-landscape.png"),
    });
  }
  const back = page.locator("[data-map-interior-back]");
  if (await back.count()) {
    await back.click();
    await page.waitForTimeout(2200);
    result.checks.interiorExit = !(await snapshot(page)).camera
      ?.interiorEntityId;
  }
  result.after = await snapshot(page);
  result.checks.noOverflow = [
    result.before,
    result.selected,
    result.landscape,
    result.after,
  ]
    .filter(Boolean)
    .every((s) => s.page.width <= s.viewport.width);
  result.checks.persistentCanvas =
    result.before.runtime?.rendererCreates ===
      result.after.runtime?.rendererCreates &&
    result.before.runtime?.canvasMounts ===
      result.after.runtime?.canvasMounts &&
    result.after.canvasCount === 1;
  result.checks.rendererHealthy = [
    result.before,
    result.selected,
    result.interior,
    result.landscape,
    result.after,
  ]
    .filter(Boolean)
    .every(
      (s) =>
        s.health?.status === "ready" &&
        s.health?.contextLosses === 0 &&
        s.health?.lastErrorCode === null,
    );
  fs.writeFileSync(
    path.join(OUT, `functional-${mobile ? "mobile" : "desktop"}.json`),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result.checks));
  assert.equal(errors.length, 0, "Browser errors");
  assert.equal(mutations.length, 0, "Unexpected backend mutation attempted");
  for (const [name, passed] of Object.entries(result.checks))
    assert(passed, name);
  await browser.close();
}
main().catch(async (e) => {
  console.error(e);
  if (debugPage) {
    fs.writeFileSync(
      path.join(OUT, "functional-error.txt"),
      await debugPage.locator("body").innerText(),
    );
    await debugPage.screenshot({
      path: path.join(OUT, "functional-error.png"),
    });
  }
  if (debugBrowser) await debugBrowser.close();
  process.exitCode = 1;
});
