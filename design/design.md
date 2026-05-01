# Tracer — Design System

**Forensic agent debugging for trading agents.**
Bloomberg-meets-Linear. Dark-first. Violet on ink.

---

## 1. Brand

### Positioning
Tracer is an agentic debugger built for indie algo traders running LLM-driven trading agents. It reconstructs every decision an agent made — the prompts, the tool calls, the orders placed — so a developer can find the exact branch where alpha leaked.

### Personality
- **Forensic** — every artifact reads like an instrument panel. Timestamps, IDs, monospace everywhere data lives.
- **Premium** — restrained, dense, calm. Nothing decorative; nothing extra.

### Voice
Short, declarative, technical. No hype, no exclamation marks, no emoji. Use precise verbs (*trace, inspect, replay, reconstruct*). Write timestamps in 24-hour with milliseconds when accuracy matters. Lowercase command-line phrasing inside code contexts (`agent.decide(ctx)`); title case in UI chrome.

### Taglines
- Trace every decision.
- Why did your agent do that?
- The forensic layer for trading agents.

---

## 2. Logo

### Glyph
A literal trace-through-a-graph: a polyline connecting three nodes, with the middle node — the *focal anomaly* — drawn slightly larger and ringed. The mark is constructed on a strict 24-unit grid; node positions are fixed: `(7,14) → (11,6) → (15,11) → exit`. The focal node sits on the apex.

### Construction rules
- 24×24 grid; minimum padding 2u on every side.
- Stroke 1.6u for the trace, 1.0u for the focal ring.
- Round caps and round joins, always.
- Two non-focal nodes are filled circles, r=2.2u.
- Focal node = r=2.0u solid + r=4.5u outlined ring.

### Variants
| Variant | Use |
|---|---|
| Solid (white/ink-900) | Default UI chrome on dark surfaces |
| Muted (ink-500) | Decorative or in dense composition |
| Inverted (ink-000) | On light surfaces |
| Brand (violet-400 / white) | Marketing, brand moments |

### Wordmark
Inter Tight 500, letter-spacing −0.04em. Always lockup in this order: glyph → 14px gap → wordmark. Wordmark cap-height matches glyph height. Never rotate, recolor partially, outline, or place on busy imagery.

### Clearspace
Minimum clearspace = 1× glyph width on all sides. For lockups, measure from the wordmark's cap-height bounding box.

### Minimum size
- Glyph: 16px (digital), 8mm (print)
- Lockup: 96px wide (digital), 24mm (print)

---

## 3. Color

All hues defined in OKLCH for predictable lightness. Use `color-mix(in oklab, …)` for tints/alphas.

### Brand — Violet
| Token | Value | Role |
|---|---|---|
| `--violet-300` | `oklch(0.78 0.16 295)` | Hover, glow accents |
| `--violet-400` | `oklch(0.70 0.20 295)` | Accent on dark, active text |
| `--violet-500` | `oklch(0.62 0.22 295)` | **Primary** — buttons, focus rings |
| `--violet-600` | `oklch(0.54 0.22 295)` | Pressed state |
| `--violet-700` | `oklch(0.42 0.18 295)` | Tinted surface, gradient start |
| `--violet-900` | `oklch(0.22 0.10 295)` | Deep gradient end |

### Secondary — Iris
| Token | Value | Role |
|---|---|---|
| `--iris-500` | `oklch(0.66 0.18 270)` | Cooler counterpoint, optional |

### Ink Scale (surfaces & text)
| Token | Value | Role |
|---|---|---|
| `--ink-000` | `#0a0a0d` | Page background |
| `--ink-050` | `#0f0f14` | Card |
| `--ink-100` | `#15151c` | Card raised |
| `--ink-150` | `#1c1c25` | Hover |
| `--ink-200` | `#24242f` | Divider, border |
| `--ink-300` | `#34343f` | Strong border |
| `--ink-400` | `#4b4b58` | Disabled text |
| `--ink-500` | `#6a6a78` | Muted text, labels |
| `--ink-600` | `#9999a5` | Tertiary text |
| `--ink-700` | `#c4c4cc` | Body text |
| `--ink-800` | `#e6e6ea` | Strong body |
| `--ink-900` | `#f5f5f7` | Headings, hi-contrast |

### Signal (data only — never on chrome)
| Token | Value | Meaning |
|---|---|---|
| `--bull` | `oklch(0.74 0.16 155)` | Pass, up, fill |
| `--bear` | `oklch(0.66 0.21 25)` | Fail, down, error |
| `--warn` | `oklch(0.78 0.16 75)` | Flagged, anomaly |

### Color rules
1. **Dark-first.** Light mode is a follower, not a peer.
2. **One signal hue at a time** in any composition. Violet is the chrome accent; bull/bear/warn live exclusively on data.
3. **No gradients on chrome.** Gradients are reserved for hero/brand surfaces (violet-700 → violet-900).
4. **Status hues never appear on buttons** except destructive (bear-tinted ghost button).

---

## 4. Typography

### Stack
```css
--font-display: "Inter Tight", -apple-system, system-ui, sans-serif;
--font-mono:    "JetBrains Mono", ui-monospace, Menlo, monospace;
```

Inter Tight features `ss01` and `cv11` enabled by default for tighter, more geometric letterforms.

### Scale
| Role | Family | Size / Line | Tracking | Weight |
|---|---|---|---|---|
| Display | Inter Tight | 96 / 92 | −4.5% | 500 |
| H1 | Inter Tight | 44 / 48 | −3% | 500 |
| H2 | Inter Tight | 24 / 30 | −2% | 500 |
| Body | Inter Tight | 16 / 24 | −0.5% | 400 |
| Small | Inter Tight | 13 / 20 | −0.5% | 400 |
| Mono · Data | JetBrains Mono | 13 / 20 | 0 | 400 |
| Mono · Code | JetBrains Mono | 12 / 18 | 0 | 400 |
| Micro · Label | JetBrains Mono | 11 / — | +14% | 500, UPPERCASE |

### Type rules
- **Mono = data.** IDs, timestamps, numerics, code, paths, labels. Never display.
- **Sans = expression.** Headings, body, button labels. Never code.
- **Numerals always tabular** in tables and metrics — `font-variant-numeric: tabular-nums`.
- Headings ≤ 64ch wide; body ≤ 64ch wide. Long lines kill scannability.
- `text-wrap: pretty` on body and headlines.

---

## 5. Iconography

- **24×24 grid**, 1.5px stroke, `stroke-linecap: round`, `stroke-linejoin: round`.
- Outline-only — no filled glyphs except the brand mark's focal node.
- Icons ride at body baseline, never visually outsize their label.
- Color = `currentColor`. Default `--ink-700`; hover lifts to `--violet-400`.
- Never decorative. Every icon must name an action or object in the system: *trace, inspect, step, filter, replay, expand, graph, pnl, latency, verify, node, branch, target, signal, prompt, order*.

---

## 6. Spacing & Layout

### Scale (8px base)
`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 96 · 120`

### Radii
| Token | Value | Use |
|---|---|---|
| `--r-sm` | 4px | Inline pills, kbd |
| `--r-md` | 8px | Buttons, inputs |
| `--r-lg` | 14px | Cards, panels |

### Density
Tracer is **dense**. Default touch targets are 32–36px (desktop dev tool). Never pad to fill space — use hairline dividers (`1px solid var(--ink-200)`) to compose dense regions.

### Grid
Page max-width 1280px, gutters 48px. Section header is a 200/1fr grid (label / title+lede).

---

## 7. Components

### Buttons
| Variant | Background | Border | Use |
|---|---|---|---|
| Primary | `--violet-500` | inset 1px `--violet-600` | Single most important action per view |
| Secondary | `--ink-150` | 1px `--ink-300` | All other affirmative actions |
| Ghost | transparent | none | Tertiary, cancel |
| Danger | transparent | 1px `bear @ 40%` | Halt, destroy, irreversible |

Padding `9px 14px`, radius `--r-md`, font-size 13. Primary carries a soft glow shadow `0 8px 24px -8px var(--violet-glow)`.

### Badges
Pill, 11px JetBrains Mono, 3×8 padding. 6 variants: `violet`, `bull`, `bear`, `warn`, `neutral`, plus a metadata pip variant (no colored background).

### Inputs
Mono input — code is a first-class citizen. Background `--ink-100`, border `--ink-300`, focus ring `0 0 0 3px violet-500 @ 25%`.

### Cards
- **Surface card** — `--ink-050`, 1px `--ink-200`, `--r-lg`, 24–32px padding.
- **Trace card** — same surface but zero padding; rows are full-bleed lines with mono content and a hairline-active row indicator (`border-left: 2px solid violet-500`).
- **Spec card** — definition list with hairline rows, mono values right-aligned.

### Topbar
Sticky, 18px vertical padding, 1px ink-200 bottom border, 88% page-bg with 12px backdrop blur. Mono labels, uppercase, +0.08em tracking.

---

## 8. Motion

- **Default duration** 150ms, ease `cubic-bezier(0.2, 0, 0, 1)`.
- **Pulse** (live trace indicator) 1.6s ease-in-out, opacity 0.5 → 1 + scale 0.85 → 1.
- **Glow** — focus rings fade in over 80ms; never animate hue.
- **No bounce, no spring.** Tracer is forensic, not playful.

---

## 9. Sound principles

(For later — UI alerts, fills, errors)
- Tonal, not musical. Sub-200ms.
- Three sounds total: *step* (subtle tick), *fill* (rising blip), *flag* (descending warn).

---

## 10. Don'ts

- ❌ Don't use violet on data values (only chrome).
- ❌ Don't combine bull + bear in one component beyond a tiny delta indicator.
- ❌ Don't add gradients to buttons, badges, or cards.
- ❌ Don't introduce a new accent hue. The system has one. Resist.
- ❌ Don't draw illustrations. If imagery is needed, use the trace mark or generate a real graph from real data.
- ❌ Don't use emoji anywhere. Ever.

---

*v0.1 · 2026.05.01*
