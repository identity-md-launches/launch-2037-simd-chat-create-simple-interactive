# Synapse design system

## Overview

Synapse is an interactive neural-network environment for a future simulation game. A quiet, dark interface frames a large field of mint and violet connections. The network itself is the visual centerpiece; the filled mint button identifies the primary action. The desktop composition places the title and environment controls to the left of the scene. On phones, the scene and action precede the collapsed settings.

The implementation is plain semantic HTML, CSS, TypeScript, and Canvas 2D. `src/style.css` is the source of truth for interface styles. `src/renderer.ts` owns the canvas palette and drawing behavior. There is one intentionally dark theme, no theme selector, and no remote assets.

## Colors

Semantic CSS tokens are defined in `src/style.css`:

| Token | Value | Implemented role |
| --- | --- | --- |
| `--bg` | `#0b1113` | Page and native node selector background |
| `--surface` | `#111b1d` | Environment panel, zoom controls, pause button, dialog |
| `--surface-hover` | `#1c2a2c` | Hover state on neutral controls |
| `--text` | `#e9efec` | Main text and headings |
| `--muted` | `#9aa9a5` | Labels, descriptions, icons |
| `--subtle` | `#849590` | Captions and footer |
| `--line` | `#293735` | Structural separators and panel border |
| `--control-border` | `#60756d` | Neutral action boundaries and range tracks |
| `--accent` | `#b4f5ce` | Primary action fill, selected atmosphere outline, range progress |
| `--accent-hover` | `#d0ffe2` | Primary hover fill |
| `--accent-ink` | `#10291e` | Text/icons inside the primary action |
| `--focus` | `#c9a6ff` | Keyboard focus indicator |

The canvas `palettes` object has three atmospheres. Values below are the exact RGB triples used by the renderer:

| Atmosphere | Primary glow | Secondary glow | Signal core |
| --- | --- | --- | --- |
| Aurora | `116,225,170` | `175,143,236` | `224,255,239` |
| Ion | `109,199,248` | `160,153,255` | `229,248,255` |
| Ember | `244,182,119` | `236,131,166` | `255,243,224` |

Atmospheres change only the network artwork. UI emphasis stays mint so primary-action meaning stays consistent. Swatches preview these atmospheres with local CSS gradients; text labels and a checkmark identify the selection independently of color.

Opaque-surface contrast was calculated from browser-resolved tokens: primary text/page 16.33:1; muted/page 7.78:1; subtle/page 6.05:1; muted/panel 7.17:1; subtle/panel 5.58:1; primary-button ink/fill 12.44:1. Focus/panel is 8.66:1 and neutral-control border/panel is 3.56:1. These ratios do not describe every animated pixel; see the contrast limits in the validation record.

## Typography

The interface uses local **Manrope**, followed by `'Segoe UI', sans-serif`. The WOFF2 variable face in `src/assets/manrope-latin-variable.woff2` supports weights 200–800, normal style. The UI uses only **400, 500, and 600**. `font-display: swap` keeps the interface readable during font loading, and synthetic styles are disabled. Font loading was checked in the browser.

| Token | Default pixels | Use |
| --- | --- | --- |
| `--text-xs: .75rem` | 12 | Metadata, field labels, instructions, footer |
| `--text-sm: .875rem` | 14 | UI body, actions, native controls |
| `--text-base: 1rem` | 16 | Desktop introduction; phone node selector |
| `--text-lg: 1.25rem` | 20 | Brand wordmark |
| `--text-title: 2rem` | 32 | Phone page title and help heading |
| `--text-display: 3.5rem` | 56 | Desktop page title |

Body line-height is 1.5; descriptive copy and dialog text use 1.6. The desktop title uses 1.08 line-height and −0.055em tracking; mobile uses 1.15 and −0.045em. The dialog title uses 1.15 and −0.04em. Other content has natural tracking. Headings balance lines and may break a long word to preserve reflow; paragraphs use `text-wrap: pretty`. No essential content is ellipsized.

Counts, zoom, speed, node IDs, and the version label use tabular numerals. Canvas node annotations are separate cartographic artwork drawn in `10px monospace`; selected node IDs and degrees are also exposed in the native inspector, outside the canvas. They do not create another prose font or interface text scale.

## Layout

The spacing is primarily a 4px rhythm: 8/12px within controls, 16/20/24px within groups, and 28/32/40/48px around larger areas. A few compact icon gaps are 6px or 10px. Spacing values live in component rules rather than an additional spacing-token layer.

`.workspace` uses a 272px sidebar, a flexible scene column, a 40px gap, and a 1920px maximum width. Its padding is 48px top, 40px inline, and 32px bottom. The header is at least 84px high and the footer at least 49px. The workspace fills the available viewport but can grow rather than clip content.

| Breakpoint | Behavior |
| --- | --- |
| Above 1800px | Workspace column gap grows to 64px |
| At/below 1100px | Sidebar becomes 248px; margins and column gap become 28px; secondary map caption/footer copy disappear |
| At/below 760px | Single column; 20px inline margins; 32px title; 72px header; scene precedes settings; settings start collapsed; touch-friendly 16px node input |
| At/below 360px | Inline margins become 16px; help type/icon and compact counter details adapt |

On mobile, canvas height is `clamp(18rem, 41svh, 24rem)`. The native settings disclosure remains in the document flow. `main.ts` synchronizes its initial/open state when crossing 760px. The scene header, inspector row, node details, footer, and overall header can wrap as text grows. The primary action is not fixed over content. At 390 × 844, its bottom is approximately 705px and the scene is already visible above it.

Rendered checks covered 320, 390, 760, 1024, and 1440px. At 390px with a 200% root text size, content reflows vertically and the primary interaction still works. This was text enlargement, not native browser zoom. English is the implemented language; translations and a full RTL mirror were not tested.

## Elevation & Depth

Panels use a single structural border and an opaque tonal surface, with no card shadows. Zoom controls use a tonal surface without a border. The help dialog uses its native top layer and a dark `#020809bd` backdrop with a 6px blur. Its scroll region is contained.

Glow belongs to the artwork: cached quadratic wires, radial node sprites, moving signal cores, and a subtle dot field. The status dot has a restrained shadow that disappears when paused. No content text uses a gradient fill. Decorative canvas layers never cover interactive HTML controls.

## Shapes

The environment radius is `--radius: 12px`; the dialog is 16px; primary/pause actions are 10px; secondary buttons 7px; zoom tray 8px; icon buttons and swatches 6px. Borders are 1px. Focus rings are 2px with a 5px offset, except the canvas ring is inset by 4px to stay in its viewport. Forced-colors mode uses `Highlight` for focus and selection.

## Components

| Pattern | Source | Behavior and reuse |
| --- | --- | --- |
| Brand/header | `index.html`, `.site-header`, `.brand` | Left-aligned home link, right-aligned help. Wraps instead of clipping enlarged text. |
| Neural field | `NeuralRenderer` in `src/renderer.ts` | Canvas 2D with live selection, hover, drag, zoom and keyboard pan. Cached wire layer and glow sprites; ResizeObserver adapts geometry, DPR capped at 2. |
| Pulse dock | `index.html`, `.action-dock`, `main.ts` | One mint primary button plus neutral pause/resume. Both at least 52px high. Running and paused pulses have corresponding visual and live-region feedback. |
| Node inspector | `#node-select`, `updateSelected` | Native select contains every generated node. Degree and canvas accessible name update together. Off-screen keyboard selections are brought into view. |
| Zoom tray | `.view-controls` | 44px controls, numeric zoom output, native disabled states at 60%/240%, reset to 100%. |
| Environment disclosure | `<details>`, `.environment` | Desktop open/mobile closed by default; reversible summary action. Native radio group for atmospheres, labeled ranges with `aria-valuetext`, neutral regenerate action. |
| Help dialog | `<dialog>`, `main.ts` dialog handlers | Native modal inertness, explicit forward/backward focus wrap, Escape/backdrop/close action, focus returned to help trigger. |
| Canvas recovery | `#canvas-error`, initialization catch | Visible browser-support guidance and disabled simulation controls if a 2D context cannot be obtained. Help remains available. |

The inline SVG icon set is defined in `src/main.ts`. Icons use `currentColor`, 24px viewboxes and 1.5px strokes; the pause bars are a deliberate 2.5px exception. Decorative SVGs are hidden from assistive technology. Icon-only actions have accessible names.

Buttons distinguish rest, hover, pressed, focus, and disabled states. Hover styling is gated by `(hover: hover)`. Motion-safe press feedback scales to 0.96; transitions name background/color/transform explicitly, use 150ms, and use `cubic-bezier(0.2, 0, 0, 1)`. There are no entrance animations or CSS animation loops.

The renderer animates via requestAnimationFrame, pauses on document visibility changes, and clamps long frame deltas to 50ms. At most eight pulse waves are active. Reduced motion starts the scene paused and shows stationary pulse highlights; the visitor can explicitly Resume. Changes to the OS preference back to reduced motion pause it again. There is no loading screen or asynchronous backend state to simulate.

## Do's and don'ts

- Use the existing semantic colors and six text tokens for new interface elements. Keep one filled primary action per view.
- Keep the scene and primary action ahead of expanded configuration at phone widths. Let text grow and rows wrap.
- Keep canvas-only data available through semantic HTML controls. Status must have text as well as color.
- Extend the network through its graph and renderer APIs; do not create fake telemetry or imply a server-backed AI model.
- Reuse `.secondary-button`, `.icon-button`, native fields, and the dialog focus behavior for related controls. Do not add a nested card system or a second icon library.
- A related page should start with the same header/footer and `.workspace` spacing, reuse the local font and tokens, and provide its own single main landmark. Add routing only when the static export can resolve it.
