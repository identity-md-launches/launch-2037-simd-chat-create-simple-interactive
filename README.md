# Synapse · Neural playground

A responsive HTML5 canvas environment for a simulation game. Glowing, curved connections carry moving signals between nodes; visitors can explore and change the field. This is a visual simulation foundation, not a trained neural network or a complete game.

The complete static site is in **`dist/`**, including HTML, CSS, JavaScript, the local font, favicon, and share image. It needs no backend, wallet, account, API key, or external runtime service.

## Install and develop

Use **Node.js 22.18+** (Node 24 recommended) and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Development dependencies are locked in `package-lock.json`. There are no production npm dependencies.

## Preview the delivered export

```sh
npm run preview
```

This serves the existing `dist/`. Alternatively, serve `dist/` with any ordinary static HTTP server. Use HTTP rather than opening the HTML through `file://`, because the export uses JavaScript modules.

## Rebuild

```sh
npm run typecheck
npm run build
```

Vite writes the complete production export to `dist/`. Its `base` is `./`; runtime asset URLs are relative and work under a hosting subpath. There is one page and no server routing requirement. Keep the finished `dist/` alongside the source when submitting. Do not submit installed dependencies, browser downloads, or package caches.

## Explore

- Select a node in the field or with **Inspect node**, then **Send a pulse**. The pulse propagates along the generated graph, and the counter records your activations for this page session.
- Pause/resume with the adjacent button. With motion paused, sending a pulse provides an immediate, stationary highlight.
- Drag to pan; use the wheel or +/− controls to zoom from 60% to 240%. **Reset view** recenters the map. On touch devices, horizontal dragging pans; vertical swipes remain page scrolling.
- Focus the canvas and use arrow keys to pan. Outside native controls, **Enter** sends a pulse and **Space** pauses/resumes. Native controls keep their normal keyboard behavior.
- Open **Environment** to select Aurora, Ion, or Ember; change density to 40, 72, or 108 nodes; and adjust speed from 0.25× to 2×.
- **Regenerate network** changes the graph and resets selection/view while retaining atmosphere, speed, pause state, and the session pulse count.
- **How to explore** opens a keyboard-accessible help dialog. Escape dismisses it and returns focus.

Preferences and the graph are held in memory and reset on reload. The initial graph is deterministic so the scene and checks are reproducible; regeneration advances its seed. Node and connection counts are calculated, not simulated telemetry. Reduced motion starts paused; Resume explicitly opts into animation.

## Source map

| Path | Purpose |
| --- | --- |
| `index.html` | Semantic page, native controls, metadata, help dialog |
| `src/style.css` | Design tokens, layout, components, responsive and motion rules |
| `src/network.ts` | Seeded graph generation, spanning tree, shortest-path signal distances |
| `src/renderer.ts` | Canvas rendering, cached wires/glows, animation, zoom and pan |
| `src/main.ts` | UI state, labels, keyboard input, dialog and error handling |
| `src/assets/` | Self-hosted Manrope variable font and its license |
| `public/` | Favicon and generated 1200 × 630 share card |
| `scripts/` | Reproducible interaction checks and share-card generation |
| `DESIGN.md` | Implemented design system and responsive behavior |
| `artifacts/validation.md` | Six-domain review, findings, actual verification, and limitations |

The editable JavaScript logic is written in TypeScript for checking. `dist/assets/*.js` is the complete compiled JavaScript. Canvas drawing uses browser APIs directly, with no UI framework or rendering dependency. Wires and glow sprites are cached; device pixel ratio is capped at 2; active pulse animations are capped at 8; the animation loop stops when paused or the document is hidden.

## Validation

To run the included checks after a build:

```sh
npx playwright install --with-deps chromium webkit
npm test
```

The test script starts and closes its own local static server at `/preview/`, validates graph invariants and primary interactions, runs axe accessibility scans, and writes results and screenshots under `artifacts/`. It attempts WebKit and records a limitation if that browser cannot launch. Browser/system dependency installation may require platform permissions; those dependencies are not part of the website export.

Actual worker results:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed, no TypeScript errors |
| `npm run build` | Passed, static export produced |
| `npm test` | 16 check groups passed, including Chromium 156 and WebKit 27.2 |
| Pinned `taste@1` design probe | 16/16 passed at 320, 390, and 1440px, including offline mode |
| axe, WCAG A/AA rule sets | Zero violations in four inspected states |
| Responsive interaction checks | Passed at 320, 390, 760, 1024, and 1440px |
| First screen at 390 × 844 | Canvas and primary action visible; action bottom at 705px |
| 200% text enlargement | Passed reflow and pulse activation at 390px |
| Resources and console | No failed local resources or browser errors in the tested flows |

The pinned probe was run with `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline`. Its input script is supplied by the assignment and is not redistributed. The durable check summary is in `artifacts/taste-results.json`. Frontend tools, browser binaries, and supplemental WebKit software-rendering libraries were installed outside the repository. Only source, lockfile, export, documentation, and small evidence files are delivered.

Physical iPhones, assistive screen readers, native browser zoom, and long-duration/low-power-device performance were not tested. Text enlargement is not a substitute for native zoom. Canvas art and translucent backgrounds do not have an exhaustive contrast proof. The worker's checks are not an independent certification; see the full review for precise coverage.

## Regenerate the share card

After a production build and Playwright Chromium installation:

```sh
npm run share
npm run build
```

The card is rendered from the actual canvas scene and local font, with a dedicated composition. The final build copies `public/social.png` into `dist/`. Its metadata uses a relative URL because no production hostname is assigned here; a host that requires absolute Open Graph URLs can resolve it after deployment.

## Attribution

Manrope is bundled under the SIL Open Font License; see `src/assets/Manrope-LICENSE.txt`. The neural renderer, page, icons, and share composition were implemented for this assignment.

The design review uses the supplied adaptation of Jakub Krehel's **Better Interface** (MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`). Design documentation follows the supplied adaptation of Paul Bakaus's **Impeccable** documentation method (Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). Both license texts are retained in `artifacts/design-guidance-LICENSE.txt`.
