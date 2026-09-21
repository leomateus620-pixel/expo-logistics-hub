const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const phase = process.argv[2] || "before";
const out = path.resolve("docs/validation/exporural-landscape", phase);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: "block",
  });
  const fixture = await require("../internal-ground/fixture.cjs").install(
    context,
  );
  const page = await context.newPage();
  const report = {
    phase,
    fixture: true,
    browser: browser.version(),
    errors: [],
    views: {},
  };
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /shader|WebGL|THREE/.test(m.text()))
      report.errors.push(m.text());
  });
  const event = (detail) =>
    page.evaluate(
      (detail) =>
        window.dispatchEvent(new CustomEvent("territory-qa", { detail })),
      detail,
    );
  try {
    await page.goto(
      "http://127.0.0.1:4198/mapa-comercial?groundQa&quality=fixed",
      { timeout: 120000 },
    );
    await page.waitForFunction(
      () => document.querySelector("canvas")?.dataset.territoryQa === "ready",
      null,
      { timeout: 180000 },
    );
    const prompt = page.getByRole("button", { name: "Agora não", exact: true });
    if (await prompt.isVisible()) await prompt.click();
    await page.evaluate(async () => {
      window.qaStore = (
        await import(
          "/src/features/commercial-map/state/useCommercialMapStore.ts"
        )
      ).useCommercialMapStore;
      window.qaStore.getState().setLabelsVisible(false);
    });
    await event({ keepRendering: true });
    await page.waitForFunction(
      () =>
        document.querySelector("canvas")?.dataset.commercialMapHydration ===
        "complete",
      null,
      { timeout: 180000 },
    );
    const inventory = await page.evaluate(async () => {
      const { OFFICIAL_REFERENCE_DATA: data } = await import(
        "/src/features/commercial-map/data/officialReference2026.ts"
      );
      const electrical = await import(
        "/src/features/commercial-map/data/electricalInfrastructure.ts"
      );
      return { data, electrical };
    });
    report.inventorySha256 = crypto
      .createHash("sha256")
      .update(JSON.stringify(inventory.data))
      .digest("hex");
    fs.writeFileSync(
      path.join(out, "inventory.json"),
      JSON.stringify(inventory, null, 2),
    );
    const find = (id) =>
      inventory.data.entities.find((e) => e.publicIdentifier === id);
    const center = (e) => {
      const p = e.geometry.coordinates[0];
      return [
        (Math.min(...p.map((p) => p[0])) + Math.max(...p.map((p) => p[0]))) / 2,
        (Math.min(...p.map((p) => p[1])) + Math.max(...p.map((p) => p[1]))) / 2,
      ];
    };
    const pose = (p, o) => ({
      target: [p[0], 0.18, p[1]],
      position: [p[0] + o[0], 0.18 + o[1], p[1] + o[2]],
    });
    const r2 = center(find("Q-R-02")),
      r14 = center(find("Q-R-14"));
    const poses = {
      medium: pose([40.8, -17.3], [0, 24, 20]),
      top: pose([40.8, -17.3], [0.01, 34, 0]),
      r2: pose(r2, [4, 3, 5]),
      r2reverse: pose(r2, [-4, 2.5, -4]),
      r14: pose(r14, [4, 3, 5]),
      boundary: pose([(r2[0] + r14[0]) / 2, (r2[1] + r14[1]) / 2], [5, 2.5, 4]),
      connectionTop: pose([7.4, -14.5], [0.01, 12, 0]),
      r13Rear: pose([0.5, -17.5], [-1.5, 2.6, -5]),
      p5Top: pose([3.5, -15.5], [0.01, 17, 0]),
      restroomFront: pose([0,.0-9.6],[5,2.4,-3]),
      restroomSide: pose([0,-9.6],[-3,2,4]),
      restroomRear: pose([0,-9.6],[-4,2,-3]),
      restroomTop: pose([0,-9.6],[.01,7,0]),
      restroomContext: pose([2,-9.6],[11,7,-3]),
      alamedaFront: pose(center(find("D1")), [6,2.8,4]),
      alamedaRear: pose(center(find("D1")), [-5,2.5,-4]),
      alamedaTop: pose(center(find("D1")), [.01,10,0]),
      control: pose([-62, 0], [0, 24, 12]),
    };
    report.poses = poses;
    for (const [name, p] of Object.entries(poses)) {
      const only=process.argv.find(v=>v.startsWith('--only='))?.slice(7).split(',');
      if(only && !only.includes(name))continue;
      await event(p);
      await page.waitForTimeout(1400);
      await event({ inspectSpatial: true });
      report.views[name] = await page.locator("canvas").evaluate((c) => ({
        spatial: JSON.parse(c.dataset.spatialInspection || "{}"),
        health: JSON.parse(c.dataset.commercialMapRenderHealth || "{}"),
      }));
      await page.screenshot({ path: path.join(out, name + ".png") });
    }
    if (process.argv.includes("--verify")) {
      report.stress = [];
      for (let cycle = 0; cycle < 5; cycle++)
        for (const mode of ["night", "economy", "day"]) {
          await page.evaluate((mode) => {
            const s = window.qaStore.getState();
            s.setNightModeActive(mode === "night");
            s.setReducedGraphics(mode === "economy");
          }, mode);
          await event({ ...poses.r2, keepRendering: true });
          await page.waitForTimeout(3000);
          await event({ inspectSpatial: true });
          report.stress.push({
            cycle,
            mode,
            ...(await page.locator("canvas").evaluate((c) => ({
              spatial: JSON.parse(c.dataset.spatialInspection || "{}"),
              health: JSON.parse(c.dataset.commercialMapRenderHealth || "{}"),
            }))),
          });
          if (cycle === 4)
            await page.screenshot({ path: path.join(out, mode + ".png") });
        }
      report.plateau = {};
      for (const mode of ["night", "economy", "day"]) {
        const samples = report.stress
          .filter((s) => s.mode === mode)
          .slice(-2)
          .map((s) => s.spatial.renderer);
        report.plateau[mode] = ["geometries", "textures", "programs"].every(
          (k) => samples[1][k] <= samples[0][k],
        );
      }
      if (Object.values(report.plateau).some((v) => !v))
        throw Error("Warmed resource growth");
      await event({ release: true, keepRendering: false });
      report.selections = [];
      for (const id of ["Q-R-02", "Q-R-14", "E-07", "D1"]) {
        const input = page.getByRole("searchbox", {
          name: "Buscar no mapa comercial",
          exact: true,
        });
        if (!(await input.isVisible()))
          await page
            .getByRole("button", {
              name: "Buscar no mapa comercial",
              exact: true,
            })
            .click();
        await input.fill(id);
        await input.press("Enter");
        await page
          .getByRole("option", { name: new RegExp(id) })
          .first()
          .click();
        await page.waitForTimeout(1500);
        const selected = await page.evaluate(
          () => window.qaStore.getState().selectedEntityId,
        );
        if (selected !== find(id).id) throw Error("Incorrect selection " + id);
        report.selections.push({
          id,
          selected,
          panel: (await page.locator("body").innerText()).includes(id),
        });
        await page.screenshot({
          path: path.join(out, "selection-" + id + ".png"),
        });
      }
      await page.evaluate(() =>
        window.qaStore.getState().setSelectedEntityId(null),
      );
      await event(poses.r2);
      await event({ release: true });
      const canvas = await page.locator("canvas").elementHandle();
      const inspectCamera = async () => {
        await event({ inspectSpatial: true });
        return page
          .locator("canvas")
          .evaluate((c) => JSON.parse(c.dataset.spatialInspection).camera);
      };
      report.gestures = [await inspectCamera()];
      await page.mouse.move(800, 580);
      await page.mouse.wheel(0, -130);
      await page.waitForTimeout(600);
      report.gestures.push(await inspectCamera());
      await page.mouse.down();
      await page.mouse.move(900, 600, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(600);
      report.gestures.push(await inspectCamera());
      await page.mouse.down({ button: "right" });
      await page.mouse.move(830, 650, { steps: 12 });
      await page.mouse.up({ button: "right" });
      await page.waitForTimeout(600);
      report.gestures.push(await inspectCamera());
      report.canvasRetained = await canvas.evaluate(
        (c) => c === document.querySelector("canvas"),
      );
      if (
        !report.canvasRetained ||
        report.gestures.some(
          (v, i) =>
            i && JSON.stringify(v) === JSON.stringify(report.gestures[i - 1]),
        )
      )
        throw Error("Gesture failed");
      await page.setViewportSize({ width: 390, height: 844 });
      await event(poses.r2);
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(out, "mobile.png") });
      report.mobileOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      if (report.mobileOverflow) throw Error("Mobile overflow");
    }
    report.mutations = fixture.mutations;
    if (
      report.errors.length ||
      fixture.mutations.length ||
      Object.values(report.views).some(
        (v) =>
          v.health.status !== "ready" ||
          v.health.contextLosses ||
          v.health.lastErrorCode,
      )
    )
      throw Error("Runtime health/mutation failure");
    report.status = "passed";
  } catch (e) {
    report.status = "failed";
    report.error = String(e);
  } finally {
    fs.writeFileSync(
      path.join(out, "runtime.json"),
      JSON.stringify(report, null, 2),
    );
    await browser.close();
  }
  console.log(
    JSON.stringify({
      phase,
      status: report.status,
      error: report.error,
      errors: report.errors,
      plateau: report.plateau,
    }),
  );
  if (report.status !== "passed") process.exitCode = 1;
})();
