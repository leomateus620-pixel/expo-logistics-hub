const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.QA_URL || "http://127.0.0.1:4196") +
      "/__dev/commercial-map-rendering",
  );
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.territoryQa === "ready",
    null,
    { timeout: 90000 },
  );
  await page.getByRole("button", { name: "Tela limpa", exact: true }).click();
  await page
    .getByRole("button", { name: "20 + 20 ciclos", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-stress-status]")
        ?.getAttribute("data-stress-status")
        ?.match(/^(passed|failed|inconclusive|cancelled)$/),
    null,
    { timeout: 300000 },
  );
  const report = JSON.parse(
    await page.getByTestId("commercial-map-stress-json").textContent(),
  );
  fs.writeFileSync(
    "docs/screenshots/vegetation-pilot/stress.json",
    JSON.stringify({ errors, ...report }, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      cycles: report.completedCycles,
      transitions: report.completedTransitions,
      resources: report.resources,
    }),
  );
  await browser.close();
  if (report.status !== "passed" || errors.length) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
