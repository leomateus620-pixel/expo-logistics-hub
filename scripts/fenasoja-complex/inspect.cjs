const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(
      (process.env.QA_URL || "http://127.0.0.1:4194") +
        "/__dev/commercial-map-rendering",
      { waitUntil: "domcontentloaded", timeout: 120000 },
    );
    await page.waitForFunction(
      () => document.querySelector("canvas")?.dataset.territoryQa === "ready",
      null,
      { timeout: 120000 },
    );
    const report = await page.evaluate(async () => {
      const { OFFICIAL_REFERENCE_DATA: data } = await import(
        "/src/features/commercial-map/data/officialReference2026.ts"
      );
      const e = await import(
        "/src/features/commercial-map/utils/electricalInfrastructure.ts"
      );
      const s = await import(
        "/src/features/commercial-map/data/fenasojaComplexReconstruction.ts"
      );
      const { pointInPolygon } = await import(
        "/src/features/commercial-map/utils/spatialSurface.ts"
      );
      const selection = e.selectCommercialElectricalInfrastructureForScene(
        data.entities,
        data.lots,
      );
      const roof = s.complexWorldPolygon("headquarters", "roofProjection");
      const stageRoof = s.complexWorldPolygon("stage", "roofProjection");
      const origin = s.FENASOJA_COMPLEX.headquarters.origin;
      const poles = e
        .resolveElectricalNodePlacements(selection.nodes, data.entities, true)
        .filter(
          (p) =>
            Math.hypot(
              p.renderPosition[0] - origin[0],
              p.renderPosition[1] - origin[1],
            ) < 2.5,
        )
        .map((p) => ({
          marker: p.node.sourceMarkerId,
          source: p.node.position,
          position: p.renderPosition,
          radius: p.node.radius,
          insideRoof: pointInPolygon(p.renderPosition, roof),
          insideStageRoof: pointInPolygon(p.renderPosition, stageRoof),
          status: p.placementStatus,
        }));
      window.dispatchEvent(
        new CustomEvent("territory-qa", { detail: { inspectComplex: true } }),
      );
      return {
        poles,
        complex: JSON.parse(
          document.querySelector("canvas").dataset.fenasojaComplexInspection,
        ),
      };
    });
    fs.writeFileSync(
      (process.env.QA_OUTPUT || "docs/screenshots/fenasoja-hero") +
        "/inspection.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report.poles));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
