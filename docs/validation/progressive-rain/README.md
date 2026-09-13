# Progressive boot and rain validation

Production Vite build with `VITE_COMMERCIAL_MAP_DIAGNOSTICS=true`, built in 33.09 s. Baseline main `524f446a` includes merged PR #140 (`51eb71cd`). The QA fixture uses authored reference/persisted-stage geometry, bypasses authentication and makes no commercial requests or writes.

The final shipping production build, with the QA flag unset and the SPA timing correction included, passed in 43.70 s. Application TypeScript passed again immediately before that build. `bundle-report-production.txt` independently passes the renderer/physics/PDF separation assertion for this shipping build; runtime screenshots and cycle reports use the explicitly enabled QA build above.

## Timing evidence

All times are local single runs. HTTP and driver shader caches and browser extension activity were not controlled. **First access means first access to that build in the stated session, not certified cold start.** Null data timings mean unavailable. Presentation is a submitted draw plus an animation-frame opportunity, not input-to-photon latency. Qualified interaction additionally requires installed controls and three successful frames with two consecutive intervals below 100 ms.

| Browser / viewport | Build and condition | Presentation | Qualified interaction |
| --- | --- | ---: | ---: |
| Chrome, 1366 × 768 | Baseline first access, uncontrolled caches | 25.287 s | unavailable |
| Embedded Chromium, 1366 × 768 | Baseline reload | 8.397 s | unavailable |
| Embedded Chromium, 1366 × 768 | Candidate first access | 9.715 s | 9.740 s |
| Embedded Chromium, 1366 × 768 | Candidate reload | 4.564 s | 4.588 s |
| Embedded Chromium, 390 × 844 | Baseline, warm asset session | 25.494 s | unavailable |
| Embedded Chromium, 390 × 844 | Candidate, warm asset session | 4.199 s | 4.216 s |
| Embedded Chromium, 1366 × 768 | Final build, warm session | 4.125 s | 4.148 s |

These rows are not a controlled causal benchmark. The mobile baseline spent 14.024 s before Canvas creation, versus 0.904 s in the candidate run, so cache/network/browser scheduling differences are included. Desktop diagnostic toolbars yield buffers of 1351 × 695 before and 1351 × 670 after. No row certifies production cold-start performance. The measured candidate first access remains above the 7–8 s target.

Candidate first-access scene preparation took 2.139 s; the B12 worker took 1.702 s overlapping module/scene work; direct shader preparation took 3.366 s. Frame request to draw took 4.960 s, including shader work. Do not sum overlapping spans. Desktop reload direct compilation took 245 ms. Geometry/contact baking moved off the main thread; procedural texture painting and material creation still cost hundreds of milliseconds.

## Automated checks

`final-tests.json`: **140 passed, 0 failed**. `final-timing-tests.json`: **7 passed, 0 failed**, including six cases from that suite and one added SPA-relative timing case (**141 unique cases**). The last arithmetic-only telemetry correction was tested after the browser stress run; it does not change renderer behavior. Coverage includes boot ownership/progress, queue/error/restore lifecycle, exact worker geometry transfer, hydrology worker/renderer/picking, rain state/wetness/placement, renderer health, direct/post/interior shaders, postprocessing, environment, night/sunrise and official geometry. Tests ran sequentially with one Vitest worker. The latest run includes discarded-Suspense visit ownership and the independent compact rain button. The amusement model is deferred; the lunar memorial stays critical to preserve its zero-intensity point-light shader topology.

Application and Node TypeScript checks passed. Scoped ESLint: 0 errors, 3 warnings: the exported loader progress helper and intentional latest-generation refs in visit cleanup. `bundle-report.txt` passes renderer/physics/PDF independence: 1,720,309 static bytes and 494,455 summed gzip bytes before the commercial query. These are build-graph values, not downloaded bytes or latency.

## Repeated transitions

`environment-desktop-20-cycles.json`: 20 measured cycles × 12 transitions, plus two warmup cycles = 264 transitions covering all eight combinations. Passed without renderer/Canvas/camera/controls replacement, context loss, unexpected camera/state changes or growth in warmed geometry/texture/program/material/Three-listener counts. Day/rain retain 597 geometries, 147 textures, 264 programs and 689 scene materials; hydrology uses 596/147/264/688. Compare counts within the same mode.

That desktop run preceded final context-recovery hardening, near-camera fade/lamp-visibility adjustment and J/G admission. The mobile viewport run tests the candidate after those changes. It passed but exposed a larger initial warmed program set (444), caused by late insertion of the lunar point light; the final build keeps that topology critical and is tested separately. Median active frame intervals were approximately 28.4 ms in dry day and 28.5 ms with day rain on Intel UHD; isolated transition gaps reached 260.6 ms. No stable 60 FPS claim is made.

`environment-final-desktop-20-cycles.json` validates the final rendering composition: **20 measured cycles, 264 transitions including warmup, passed**, zero context losses or unexpected lifecycle/state changes. Warmed counts remain 597 geometries / 147 textures / 264 programs / 689 scene materials / 429 Three-and-controls listeners outside hydrology and 596 / 147 / 264 / 688 / 428 in hydrology. There is no same-mode count growth. Keeping the lunar light critical removes the candidate mobile program inflation.

`final-frame-summary.json` records the final active-frame samples. Dry day and day rain medians were 29.6 and 29.2 ms; night and night rain 29.3 and 29.6 ms. The small differences are within sampling noise, not evidence that rain improves performance. Day rain added four draw calls (888 to 892) and 6,640 triangles (832,944 to 839,584). The largest isolated transition gap was **341.7 ms** in day/rain/hydrology. This remains a navigation/transition limitation even though the repeated-state/resource checks pass.

Existing hydrology presentation still changes 6–7 scene material identities while counts and programs plateau. Rain itself retains its pooled resources across toggles. Listener coverage includes Three scene objects and OrbitControls, not all DOM listeners. WebGL resource counts do not reveal exact GPU byte allocations.

## Files and limitations

- `baseline-*.json`: baseline timing/counters with browser metadata.
- `release-*.json`: candidate first-access and warmed observations; `final-desktop-warm-session.json`: final rendering composition.
- `environment-*-20-cycles.json`: complete repeated-mode reports, warmup rows and limitations.
- `final-tests.json`, `bundle-report.txt`: automated checks and bundle graph.
- Screenshots: actual loading screen and day/night rain views.

Viewport sizing uses the desktop GPU; it does not emulate phone CPU, thermal behavior, Safari drivers or physical multi-touch. Authenticated deployed cold starts and physical iPhone/Android remain unverified. Reflections use existing PBR lighting and analytic puddle highlights, without SSR or reflected scene geometry. Official geometry, coordinates and commercial records were not edited. See [architecture and remaining work](../../commercial-map-progressive-rain.md).


## Interface verification

The same read-only production interface was exercised at 390 × 844, 320 × 700 and 844 × 390: no horizontal overflow; dedicated rain icon available; hidden top/focus controls reachable through More at 320 px. Searching exact B12 returned one result and selected the headquarters. Clearing and applying Blocked returned 1,577 of 1,690 fixture entities. Exact Q-D-01 returned one lot; its selection remained while switching rain/night. Mouse drag and wheel zoom changed the camera and retained ready/direct renderer health with zero context losses. These inputs are not physical multi-touch. `interface-navigation.json`, `interface-mobile-layout.json` and the landscape screenshot retain evidence.

Published cycle reports replace repeated sorted material UUID arrays with SHA-256 identities, preserving every per-transition count/state/frame metric and the browser-computed resource analysis. Full arrays are unnecessary for reviewing plateaus; the original local reports remain outside the PR.
