# Commercial Map: progressive boot and rain

## Scope and baseline

This implementation starts at `524f446a` on main, after merged PR #140 (`51eb71cd`). It keeps PR #140's parallel data/module initialization, projected commercial query, lazy panels, renderer/physics chunk separation, stable night/sunrise shaders and bounded diagnostics. Official entity geometry, lot coordinates, commercial records and authored territorial datasets are unchanged.

The remaining measured bottleneck is synchronous scene preparation followed by compilation of the whole world in both direct and compositor output variants. The original initialization also starts the optional amusement physics import while compilation is still on the critical path. Local Chromium observations repeatedly exceed 20 seconds before first presentation; network projection alone cannot resolve that rendering cost.

An immutable baseline checkout at `524f446a` and a production QA build of this branch use the same persisted-stage fixture and the same `instrument-preview.cjs` observer. `VITE_COMMERCIAL_MAP_DIAGNOSTICS=true` enables the dedicated QA route and diagnostics; it does not alter commercial data. The fixture bypasses authentication and commercial network requests. Browser caches, OS/driver shader caches and installed browser software are not controlled, so these runs are **local first-access/reload measurements, not certified production cold starts**.

## Architecture

- A CSS/SVG FENASOJA loader is included in the route shell. A per-visit owner resets readiness before queries on a cached SPA return, without resetting on a refetch or mode toggle. Its weights advance only from completed data, critical scene, draw and interactive milestones. It remains until controls exist and at least three frames have been submitted, with two consecutive event-loop frame intervals below 100 ms. A separate real input-to-next-frame observation measures controls response; neither measurement claims input-to-photon latency.

- The critical scene retains terrain, primary circulation, selectable lots, essential structures, camera, controls and required lighting. Independent local boundaries admit context, parking, regional environment, vegetation, the exact J amusement landmark, and decorative systems one at a time after interaction. Admitting a boundary does not rerender the entire scene. A short shader dither reveal avoids hard opaque popping for private materials; shared resources remain untouched.

- Only the critical direct output compiles before interaction. The initial useful view and navigation share that prepared path. The compositor remains allocated and resumes after the critical post variant is prepared in idle batches against a snapshot of critical objects. Deferred boundaries prepare their own direct/post variants before reveal. Fixed program references are polled because Three r170's `compileAsync` otherwise polls `material.currentProgram`, which live direct frames can overwrite. Fixed-program polling cancels on teardown/context loss, including critical and interior preparation. Restored optional layers recompile before reveal; a failed optional layer stays hidden and releases the queue. Night uses the existing stable shader/light topology and uniforms.

- Hydrology imports lazily, transfers CPU coordinate preparation to a worker and preserves exact Float64 coordinates. It retains GPU objects when hidden. Its picking instances are initialized during inactive preparation and gate visibility/events on activation, preserving their transforms through repeated toggles. Worker owners are released with the Canvas. Optional layer failures are isolated from the usable world.

- Existing shared procedural texture caches, instanced vegetation/infrastructure and adaptive quality remain in place. This change does not replace authored assets or indiscriminately reduce architectural detail.

- B12 geometry construction and BVH contact baking now run in a CPU worker started alongside map module loading. Typed attributes, original index types, groups, bounds, contact attributes and Float64 planting transforms transfer exactly; the main thread reconstructs independently owned geometry. One bounded CPU payload is cached. The major structure must be ready before the critical scene commits. Failed worker preloads defer the identical CPU fallback until a live B12 consumer needs it.

## Rain rendering and budgets

`rainModeActive` is independent of night, selection, filters, navigation and sunrise. The existing environment owns a smoothly interpolated shared blend; its sky, haze, lighting and sun respond without creating another environment implementation. Disabling rain returns to the current day/night state.

The rain layer has four pooled instanced draws: camera-centered world-space streaks, shallow ground wet areas, impact rings and limited reference-structure drips. World-space recycling uses a fixed cell size and transparent boundaries, preventing zoom from rescaling the random field. It adds no textures, screen-space reflection passes or render targets. Runoff anchors derive from the existing B12/B13 structure transforms; ground anchors stay inside eligible authored surface polygons and avoid holes.

| Tier | Drops | Max splashes | Max runoff | Max wet areas |
| --- | ---: | ---: | ---: | ---: |
| LOW | 900 | 0 | 0 | 24 |
| MEDIUM | 1,800 | 64 | 64 | 40 |
| HIGH | 3,000 | 128 | 128 | 64 |
| ULTRA | 4,000 | 160 | 160 | 80 |

Capacity remains stable; quality changes instance counts. Tier selection combines existing measured adaptive quality with GPU texture capability and device memory when available. Splashes/runoff also fade by distance. Ground effects and material wetness are suppressed in the technical hydrology view and indoor scenes; atmospheric rain remains compatible with day/night hydrology.

Wetness retains material identity and adjusts existing color, roughness and environment intensity, with distinct asphalt/concrete/roof/vegetation/soil responses. A chunked live-material registry handles later hydration and material replacement, preserves subsequent palette changes, and cleans up disposal listeners. Existing environment lighting supplies highlights; shallow puddles use analytic sky/night colors and a bounded snapshot of nearby existing lamps. These are stylized lightweight reflections, not reflected scene geometry or fluid simulation.

## Diagnostics and reproducibility

### Asset and CPU audit

Most map textures are procedural canvas/noise work rather than downloaded image decoding. `openGroundTextures.ts` caches 256² albedo/normal/roughness bundles (786,432 base RGBA bytes per instantiated surface kind). B12 generates a 512² roof pack and three 256² packs (5,505,024 base RGBA bytes), plus three artwork canvases (7,602,176 base RGBA bytes). These byte estimates exclude mipmaps and driver allocation. The official symbol is 244,680 bytes on disk; the current official reference WebP is 313,744 bytes and the reference overlay loads only when requested. Interior GLBs are about 0.96/1.04 MB and are outside the first exterior view.

Trees, night fixtures, rear parking markings and road geometry already use instancing/merging. This work preserves that batching. Before the B12 worker change, its measured geometry merge cost was 569 ms, BVH contact bake 576 ms and material generation 204 ms on the tested Intel machine. The contact bake casts up to eight rays per uncached contact sample. The first two operations now run off-thread; material painting remains measured main-thread work. Pavilion procedural texture preparation also repeats per pavilion and remains a shared-cache candidate.

KTX2 is a possible future GPU-upload/storage optimization after deterministic textures are baked; a transcoder alone would retain today's canvas generation cost. Draco/Meshopt would require baked geometry assets and do not accelerate the existing procedural `ExtrudeGeometry`, reconciliation, merging or BVH baking. They were evaluated rather than added as unrelated first-load dependencies.

User Timing marks cover module request/load, actual commercial request/cache, renderer/context construction, critical scene, entity geometry CPU, procedural texture generation, environment material creation, direct/post shader work, first shadow preparation, compositor preparation, physics, first frame request/draw, first interactive frame, first controls response and secondary completion. Spans overlap and must not be summed. Geometry/texture CPU counters explicitly describe their instrumented subset. Long tasks are observed separately; `gl.info` counters are reported alongside renderer/camera lifecycle and quality.

Use `/__dev/commercial-map-rendering?persistedStage` in a QA build. The visible **Medir 20 ciclos de ambientes** control waits for secondary preparation, warms two cycles, then runs 20 cycles of 12 transitions (240 measured transitions, covering all eight combinations). It records actual frame gaps, input-to-submitted-frame delay, state/camera preservation, context health and same-mode resource plateaus. It requests continuous frames only during measurement and refuses background/unfocused measurements. Resource listener coverage is Three scene objects and OrbitControls; DOM listener accumulation is not certified by that counter.

Hydrology's pre-existing product action changes camera preset and selection. The harness reports that intentional navigation separately. Rain/night-only transitions must preserve camera, target, selection and filters. The implementation does not silently rewrite the hydrology navigation contract.

## Validation results

Final runtime measurements and validation results are recorded in `validation/progressive-rain/`. Physical iPhone/Safari, Android, thermal behavior, mobile touch hardware and authenticated production cold load require separate hardware/deployment validation. Local fixture timings must not be used to assert the 7–8 second production target.

### Current measurement limits

The measured candidate first-access run was **9.740 s to qualified interaction**, above the 7–8 s goal. That candidate reloaded in **4.588 s** and a 390 × 844 viewport with warmed resources took **4.216 s**. After final visit-ownership, light-topology and compact-control fixes, the final desktop warm-session observation was **4.148 s**. These are individual observations with uncontrolled HTTP/driver caches, not production percentiles. The baseline embedded Chromium reload presented at 8.397 s; its old instrumentation did not have the new three-frame interactivity gate. External Chrome first-access baseline observations around 24–26 s must not be mixed with the embedded-browser reload as one before/after series.

The candidate first-access critical scene span was 2.139 s, B12 worker 1.702 s (overlapping module/scene work), direct shader preparation 3.366 s, and first-frame-request to draw 4.960 s (including that shader span). The 3 ms B12 unpack preserves exact buffers. Main-thread measured texture painting remained 291 ms and B12 materials 202 ms. The first GPU submission/upload remains a material cost. Shader/driver caches reduced direct preparation to 245 ms on the desktop reload. Full optional hydration takes substantially longer than interaction (19.684 s after readiness in the warmed mobile viewport); it is deliberately outside the loader.

There is no claim of stable 60 FPS on the tested Intel UHD GPU. The final desktop stress run recorded 29.6 ms median frame intervals in dry day and 29.2 ms with day rain; this small difference is within run-to-run noise. Isolated transition frame gaps reached 341.7 ms. Rain added four calls and 6,640 triangles in the measured day view (888 to 892 calls). Resource counts plateaued through all 20 measured cycles, but existing scene material identities still change across hydrology toggles; plateau is evidence against observed growth, not a proof that every material is immutable or every DOM listener is covered.

### Remaining work for production certification

- Measure authenticated cold navigation/data latency on the deployed build, with repeatable HTTP and shader-cache conditions, multiple samples and network/device profiles. The fixture deliberately omits commercial requests; null data timings are not zero latency.

- Validate physical iPhone/Safari, mid-range Android, multi-touch, thermal behavior and sustained navigation. Viewport sizing uses the same desktop GPU and does not emulate phone CPU/driver behavior.

- Continue reducing first shader/upload cost, procedurally painted pavilion texture repetition and optional hydration long tasks. Consider exact baked assets/texture compression only with geometry and pixel comparisons. The target is still unmet for the measured first access.

- Inspect remaining existing material churn across hydrology and isolated transition spikes. Rain itself uses four pooled resources and stable material identity, with no extra textures or render targets.

The lunar memorial remains critical because it contains a zero-intensity rocket point light. Inserting that light late changed the global light count and increased warmed programs during the candidate mobile run. Keeping its light topology in the initial scene avoids that new full-world variant. The amusement model remains deferred. Boot ownership uses a route identity that survives discarded pre-commit Suspense renders; ordinary refetches/toggles keep the session, and actual unmount releases it. Both desktop and compact mobile toolbars expose rain; narrow layouts keep full touch targets and move focus/top-view actions into the existing menu.

The final rendering composition passed 20 measured cycles (264 transitions including warmup), retaining 264 programs in every mode. Exterior counts stabilized at 597 geometries, 147 textures and 689 scene materials; hydrology at 596/147/688. The final source also corrects navigation-to-module timing relative to the current SPA visit; its seven focused tests pass, including one additional case beyond the 140-test renderer suite. This arithmetic-only telemetry correction followed the browser stress run and does not change rendering.
