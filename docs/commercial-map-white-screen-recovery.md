# Commercial Map: white-screen recovery validation

Date: 2026-09-04. Base: `447bb4d817d56534b84b68c3b2b4ba828b0163ec`
(PR #125 merged). Corrective branch: `codex/commercial-map-white-screen-recovery`.

## Confirmed fault and repair

The installed `postprocessing` composer chooses the last added pass as its
screen output. The balanced profile disabled that final sharpen pass, leaving
no enabled screen output. Rendering directly after post-processing could also
inherit an intermediate framebuffer. Camera callbacks alone did not prove
that an image reached the default framebuffer.

The corrective implementation explicitly assigns the terminal pass to SMAA in
balanced and sharpen in full. One stable frame owner chooses post-processing
or direct ACES rendering and normalizes the framebuffer, viewport and scissor.
Framebuffer status and shader failures are checked; post-processing failure
falls back to direct rendering without resetting application state. Context
loss suspends rendering, and recovery is bounded with a manual retry action.

DPR has one owner. Base resolution is separate from temporary interaction
resolution. Pending scene quality must be applied before another adaptive
decision can assess its workload. Gesture cancellation releases transient
control state without replacing the camera or selection.

The subsequent hydrology review found avoidable mode-boundary reconstruction:
sky/sun materials, reflection textures/PMREM inputs, hidden tree placements and
hidden electrical geometry. Sky/sun now retain identity and change uniforms or
scale. Both authored reflection palettes are retained. Visibility no longer
changes the physical placement inputs of hidden vegetation/electrical layers.
This trades one bounded extra reflection palette for removal of repeated
allocation and PMREM generation; it does not remove an authored visual layer.

The quality-cycle investigation then identified the exact +1 geometry/cycle:
the rear park pole `CylinderGeometry(0.022, 0.03, 0.84, 5)` was orphaned when
Reduced unmounted its `dispose={null}` mesh. Temporary draw-submission tracking
matched the orphan UUIDs to `rear-park-environment`; it was removed after this
attribution. Rear vegetation/poles now keep fixed-capacity meshes, owned tier
geometries and materials, change only geometry references/counts/visibility,
and capture owners for disposal before React clears refs. Both reflection
resolutions also remain resident, avoiding repeated PMREM conversion on warmed
quality transitions. These are bounded caches, not ever-growing pools.

Real context-loss injection exposed two additional recovery defects and both
were corrected: frozen shadow targets need an explicit redraw after restoration
(otherwise a dark rectangle covers the terrain), and the restoration extension
must be acquired while WebGL is healthy (a late lookup after loss can return
null and make the manual retry silently ineffective).

A final review caught a shader-health blind spot: Drei's `Preload` can first
use a broken program in a sibling layout effect, before the frame coordinator
starts. Three reports that first-use error only once. A renderer-lifetime
observer now retains that failure, refuses to count reuse of the broken cache
as a successful frame, and offers the existing bounded manual context reset.

Responsive inspection also reproduced inaccessible navigation at 768 x 1024:
the desktop toolbar was hidden below 950 px, while the compact toolbar only
appeared in a container at most 720 px wide (or short landscape). Both toolbars
and the dock now share those exact complementary conditions. The compact dock
summary no longer inherits horizontal scrolling intended for the floating
summary, and phone landscape gives the dock's space back to the canvas.

## Evidence recorded so far

- Chrome, Windows, Intel Core i5-1035G1, 8 GB RAM; WebGL reports
  `ANGLE (Intel, Intel(R) UHD Graphics (0x00008A56) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
- Authenticated production preview `/mapa-comercial` was exercised after the
  user signed in locally. Production build `CommercialMapPage-DiSe3-vu.js`
  passed Vite build (5,169 modules, 67 seconds). Existing large-chunk and stale
  Browserslist warnings remain.
- At effective CSS viewport 1440 x 900 and browser zoom 100%, the authenticated
  overview was visibly rendered after resize and idle. Screen-target draw
  counter: 102; path: post; context losses: 0. No pale rectangles in this
  captured overview. This is one observation, not approval of the whole matrix.
- The earlier browser zoom of 67% produced tiled automation screenshots. Those
  captures are excluded from visual acceptance; the user reset zoom to 100%.
- The completed Commercial Map suite had 842 passes / 848 tests in 108 files.
  The same six failures were reproduced in the same five files against a
  separate snapshot of base `447bb4d8` (45 passes / 51 tests). These inherited
  failures are not silently waived or claimed fixed. Later focused regressions
  must be recorded separately from this broad snapshot.
- Full-repository execution beyond the Commercial Map suite was interrupted
  to reserve CPU for browser measurement. There is no completed full-repo
  result from this execution.
- Final focused verification after atmosphere/profiling changes: 148 passes /
  149 tests in 14 files; only the inherited electrical-clearance failure.
  ESLint passed on 22 changed TypeScript files, the initial root TypeScript
  command completed (see the explicit application check below), and the
  production build passed (5,170 modules, 37.16 seconds;
  `CommercialMapPage-DPykvRdz.js`). Neither the DEV route nor render-timing
  probe markers occur in `dist`.
- Real accelerated Chrome DEV stress completed 20 normal/hydrological cycles
  (40 transitions) with ready/post output and zero context losses. Warm
  resources stayed at 151 textures / 167 programs; geometry alternated
  between 551 (hydrology) and 552 (normal). The measured viewport at this
  stage was 1366 x 599 CSS pixels, browser zoom/DPR 1, render buffer
  1351 x 418. Transition durations include the explicit idle gate and are
  **not input-latency measurements**.
- The subsequent quality run completed all 20 cycles, for 80 combined
  transitions in 167 seconds, with zero context losses. However, it exposed
  progressive geometry growth: warm reduced snapshots rose from 496 to 512,
  and normal snapshots from 528 to 544, one geometry per cycle. Textures and
  programs stayed at reduced 143/150 and normal 148/156. Therefore the run
  **fails resource-stability acceptance**, despite its successful output
  checks. The diagnostics runner's original `passed` label covered draws
  only and must not be used as approval of this run.
- A subsequent warmed drag measured CPU submission average/P95
  15.972/33.1 ms and GPU elapsed average/P95 16.222/31.256 ms, but active
  frame intervals were 878.2 ms average and approximately 1017 ms P95.
  Browser-reported focus and visibility were true with no blur/hidden events.
  This discrepancy requires investigating scheduling/occlusion separately;
  these data **do not certify fluent interaction or sustained FPS**.
- Latest application verification after the resource fix:
  `tsc -p tsconfig.app.json --noEmit` passed (including tests); ESLint passed
  on all 26 changed/new TypeScript files; 117 focused tests in 13 files passed.
  Production build passed in 37.43 seconds, 5,170 modules,
  `CommercialMapPage-BocNmfWe.js` (1,404.25 kB / 423.29 kB gzip).
  DEV route, timing and temporary geometry-ledger markers are absent from dist.
- Final accelerated Chrome combined stress: **passed**, 40 complete cycles /
  80 transitions in 165.469 seconds, zero context losses, ready/post after rest.
  All four like-for-like warmed resource buckets (cycles 3–20) had zero growth:
  hydrology 551 geometries / 151 textures / 167 programs; normal after hydrology
  552/151/167; reduced 495/147/150; normal after quality 525/152/156.
  This replaces the earlier failed resource run, not the separate performance
  or visual gates. The final overview screenshot after rest remained intact.
- A bounded idle `requestAnimationFrame` control experiment (no map invalidate
  or render request) measured 999.97 and 1016.30 ms callback gaps over 3,023 ms.
  Thus the approximately 1 Hz cadence occurs even without drawing the map and
  cannot be attributed to scene rendering cost. The connected automated Chrome
  environment cannot certify sustained interaction FPS in this run.
- Real `WEBGL_lose_context` injection: first restoration recovered ready/post;
  a second loss recovered degraded/direct as designed; a persistent loss
  reached the 5-second timeout and exposed the manual retry button. After the
  extension-lifetime fix, clicking **Recuperar mapa** returned ready/post without
  navigation/reload. Close-up camera navigation resumed and completed. Visual
  comparison verified that the restored-shadow rectangle was removed.
- Authenticated production build `CommercialMapPage-CxAaQ61M.js` (1,404.49 kB /
  423.38 kB gzip, 5,170 modules, 32.13 seconds) passed explicit application
  TypeScript, scoped ESLint and 118 focused tests in 13 files. The subsequent
  shader-observer and responsive fixes require the final verification below.
- That authenticated build was visually inspected in accelerated Chrome at
  1440 x 900 (overview, isometric, orbit/zoom), 1920 x 1080 (top view),
  768 x 1024 (tablet defect reproduced), 390 x 844 and 844 x 390 (mobile
  portrait/landscape, normal and hydrological). No page horizontal overflow
  or blank canvas was observed; context losses stayed at zero. The tablet
  controls defect is tracked separately from successful WebGL output.
- At 390 x 844, parking overview, block A1 selection and detail approximation
  completed, with visible geometry and post output after rest. Pavilhao 1
  search/selection, interior entry (direct output), and return to the selected
  exterior (post output) also completed. Final screen-target counter 251,
  zero context losses. The counter is not a compositor FPS measurement.

## Final accelerated-browser repeat

The final renderer code, including the Preload shader observer, repeated the
entire combined run: **40/40 cycles, 80/80 transitions, passed in 169.400 s**.
Context losses: 0; final state ready/post, 161 successful screen-target draws.
All four warmed groups again had zero geometry/texture/program growth:
551/151/167 (hydrology), 552/151/167 (normal after hydrology), 495/147/150
(reduced), 525/152/156 (normal after quality). Buffer 1351 x 529, DPR 1,
Intel UHD ANGLE D3D11. The overview remained visible after rest. This run
still does not certify interaction FPS: the independent scheduling limitation
described above remains observable.

After that run, the DEV close-up preset plus all 80 synthetic wheel steps of
the maximum-zoom control completed. Visual inspection after rest showed the
close-up geometry without a blank/blue frame; ready/post, 248 screen-target
draws, zero context losses, navigation idle, and the drawing buffer restored
to 1351 x 529 at DPR 1. This checks the extreme-zoom sequence, not physical
pinch behavior or a separately measured numerical camera-clamp boundary.

The final authenticated production inspection confirmed that the tablet
toolbar is visible at 768 x 1024, isometric navigation completes, and the
keyboard-focus hydrology tooltip appears without a pale rectangular artifact
around it. At 844 x 390, the dock is hidden and the compact controls remain
visible, returning the canvas to 821 CSS pixels wide. No horizontal page
overflow or context loss was observed. The final build was opened again with
entry `index-DCQqSXzD.js`: floating Filters was visible at 844 x 390, opened
the results panel and closed successfully. Final state ready/post, 12
screen-target draws, zero context losses. Chrome viewport overrides were
reset after inspection.

## Measurement rules

Active frame gaps above 250 ms must remain in the statistics. Actual idle,
hidden-tab and context-loss intervals reset sampling; the first resumed delta
is excluded rather than being misreported as an interaction stall.

The DEV diagnostics page offers cancellable 20-cycle quality and hydrology
runs. A cycle includes both directions, so the combined run checks 80
transitions. Each transition waits for a new successful screen-target draw,
the expected render path and 650 ms of camera idle, and records resource
counts. A 15-second timeout is a failure. Losing foreground/visibility also
invalidates the run. Tests do not become successful merely because their
animation callbacks executed.

CPU render timing measures command submission, not the entire browser frame.
Asynchronous GPU queries, when supported and not disjoint, measure GPU work.
Neither JavaScript callbacks nor screen-target draw counters alone prove
browser compositor presentation. Visual screenshots remain a separate gate.

Do not collect final performance numbers during builds, automated CPU test
runs, HMR, or hidden/unfocused browser operation. Cold and warmed behavior
must be distinguished. Emulated viewport dimensions do not emulate mobile
GPU, thermal behavior, memory limits, touch hardware, or Safari.

## Final automated verification

`npx vitest run src/test/commercialMap --maxWorkers=2` completed after the
shader-observer and responsive fixes: **874 passed / 880 tests**, 113 files,
85.61 seconds. The six failed test names exactly match the failures reproduced
on `447bb4d8`; the new regression tests all pass. The inherited failures are:

- Electrical infrastructure minimum clearance (937 existing violations).
- Exporural steakhouse local reference assets absent from this checkout.
- Map independence textual administration-controls contract.
- Presentation label hysteresis (two tests).
- Quadras A/B DEV source-text contract affected by CRLF.

The broad suite is therefore **not green**. No assertions were skipped or
relaxed to hide these failures, and this correction does not change those
commercial geometries/data to make unrelated tests pass.

After the additional compact-Filter visibility regression test, the final
focused run passed **130/130**, 14 files, 12.26 seconds. The broad 874/880
snapshot above predates that one additional test. Explicit application check
`tsc -p tsconfig.app.json --noEmit` and scoped ESLint on 27 changed/new
TypeScript files were repeated and passed with no lint warnings. Production
build passed in 32.42 seconds (5,170 modules):
`CommercialMapPage-d2ueuipL.js`, 1,404.97 kB / 423.46 kB gzip.
DEV diagnostics/timing/temporary geometry-ledger markers are absent from the
production assets. Existing large-chunk and Browserslist warnings remain.

## Acceptance scope and remaining gates

The screen-output regression, bounded recovery and warmed resource-growth
checks have supporting tests and real accelerated Chrome observations. This
document is not certification of sustained smooth FPS or of every angle on
every device. The browser's approximately 1 Hz idle scheduling control prevents
a reliable final interaction-latency/frame-consistency comparison. Maximum
zoom at the exact camera clamp, physical multitouch/pointer cancellation and
return-from-background still need the complete real-device interaction matrix;
the cancellation paths are covered by automated tests, not by physical touch.

Only CSS viewport compression at DPR 1 was available for responsive Chrome
inspection. Safari/WebKit, iPhone/iPad hardware, high-DPR mobile GPU/thermal
behavior and a separate physical tablet/monitor were not tested. A Chrome
viewport is not Safari emulation. These limits must remain visible in the PR;
it must not be merged automatically or represented as full acceptance.

No database, commercial data, public API or unrelated Supabase function changes
are included in this correction.
