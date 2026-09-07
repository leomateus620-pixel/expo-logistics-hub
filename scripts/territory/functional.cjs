/* Browser-only, synthetic auth/organization fixture. No production backend writes. */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "docs/screenshots/territory");
const args = process.argv.slice(2);
const url = args[1] || "http://127.0.0.1:4174/mapa-comercial";
const mobile = args.includes("--mobile");
let debugPage;
let debugBrowser;
const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
const projectUrl = env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^"'\r\n]+)/m)[1];
const projectHost = new URL(projectUrl).hostname;
const authKey = `sb-${projectHost.split(".")[0]}-auth-token`;
const user = {
  id: "00000000-0000-4000-8000-000000000101",
  aud: "authenticated",
  role: "authenticated",
  email: "synthetic-history-qa@example.invalid",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const org = "00000000-0000-4000-8000-000000000102";
const session = {
  access_token: `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", exp: 4102444800, role: "authenticated" })).toString("base64url")}.synthetic-browser-fixture`,
  refresh_token: "synthetic-browser-fixture",
  token_type: "bearer",
  expires_in: 315360000,
  expires_at: 4102444800,
  user,
};

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
  const mocked = [];
  const mutations = [];
  await context.route(`https://${projectHost}/**`, async (route) => {
    const req = route.request();
    const target = new URL(req.url());
    mocked.push({ method: req.method(), path: target.pathname });
    let response = [];
    if (target.pathname.endsWith("/auth/v1/user")) response = user;
    else if (target.pathname.endsWith("/auth/v1/token")) response = session;
    else if (target.pathname.endsWith("/rest/v1/org_members"))
      response = [
        {
          id: "qa-member",
          org_id: org,
          role: "admin",
          nome_exibicao: "Validação local",
          cargo: "QA",
          organizations: { id: org, nome: "Fenasoja — fixture local" },
        },
      ];
    else if (target.pathname.endsWith("/rest/v1/user_roles"))
      response = [{ role: "admin" }];
    else if (target.pathname.endsWith("/rest/v1/map_projects")) response = null;
    else if (
      target.pathname.endsWith("/rest/v1/rpc/expire_commercial_reservations")
    )
      response = 0;
    else if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
      mutations.push({ method: req.method(), path: target.pathname });
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          message: "QA fixture forbids backend mutation",
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  await context.addInitScript(
    ({ authKey, session, org, userId }) => {
      localStorage.setItem(authKey, JSON.stringify(session));
      localStorage.setItem("fenasoja_org_id", org);
      localStorage.setItem("fenasoja-last-user-id", userId);
    },
    { authKey, session, org, userId: user.id },
  );
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
    { timeout: 90000 },
  );
  await page.waitForTimeout(5000);

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
  fs.writeFileSync(
    path.join(OUT, `functional-${mobile ? "mobile" : "desktop"}.json`),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result.checks));
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
