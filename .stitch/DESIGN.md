# Tracer Neon Command Design System

## Product Intent
Tracer is a reliability and observability console for autonomous EVM agents. The interface must feel trustworthy, technical, and instantly scannable during live demos and production incidents.

## Visual Direction
- Theme: dark premium command center.
- Character: high-contrast telemetry surfaces, subtle cobalt/teal glows, soft glass depth.
- Avoid: flat gray cards, hard divider lines, decorative noise.

## Core Tokens

### Colors
- `--bg-canvas`: `#090f1f`
- `--bg-deep`: `#0f172d`
- `--surface`: `#151f36`
- `--surface-elev`: `#202b46`
- `--line`: `#2d3b60`
- `--line-strong`: `#435989`
- `--text`: `#e6ecfb`
- `--text-muted`: `#a7b5d8`
- `--text-faint`: `#7f90b7`
- `--accent`: `#5b8cff`
- `--accent-soft`: `#234696`
- `--success`: `#4fd1a5`
- `--warning`: `#f2c879`
- `--danger`: `#ff6e8c`

### Typography
- Display: `Space Grotesk` for major headings.
- Body/UI: `Inter` for readable data-dense copy.
- Technical values: `IBM Plex Mono` for ids, hashes, and payload snippets.

### Spacing and Radius
- Spacing base: 4px.
- Common paddings: 12, 16, 20, 24.
- Radius:
  - controls: 12px
  - cards: 16px
  - chips: full

### Shadows
- `--shadow-soft`: `0 16px 44px rgba(2, 8, 23, 0.38)`
- `--shadow-focus`: `0 0 0 3px rgba(91, 140, 255, 0.34)`

## Component Standards

### Surfaces
- Use tonal separation and glow, not hard separators.
- Main cards should feel layered with subtle blur.
- Active/focused cards can get accent border tint.

### Buttons
- Primary: accent-toned fill with strong contrast text.
- Secondary: surface fill with line border.
- Hover: slight lift and brighter border.

### Inputs
- Dark translucent fill, soft border, clear focus halo.
- Ensure minimum comfortable hit area for rapid ops input.

### Badges
- Compact uppercase metadata chips.
- Status mapping:
  - success/completed -> success
  - running/pending -> accent
  - failed/error -> danger

### Data States
- Loading: concise status text or skeleton.
- Empty: explain next action.
- Error: explicit error copy + retry action.

## Page-Level Structure
- Landing: value prop + capability stack + strong CTA.
- Login: focused auth entry with clear session state.
- Console home: reliability scorecard + active agents.
- Agent routes: operational context + clear actions.
- Trace detail: tri-panel inspection with KeeperHub controls.
- Share page: verification-first public report.

## Interaction Rules
- Keep refresh operations local (avoid full-page flicker).
- Preserve focused event/tab selections after updates.
- Always surface action feedback: loading, success, error.

## Responsive Behavior
- Desktop-first around 1280.
- 1024: collapse side rails where needed.
- 768: single-column modules with wrapped controls.
- 390: prioritize readability and tap targets.
