# Design System: Tracer Dashboard Revamp
**Project ID:** `14582459868387399796`  
**Source:** Stitch project theme + implemented Tracer console screens

## 1. Visual Theme & Atmosphere
Tracer uses a premium monochrome dark command-center aesthetic tuned for operational trust: dense data, high legibility, restrained sheen, and clear status semantics. The visual language should feel "live console" rather than marketing UI.

Atmosphere keywords:
- Dark technical cockpit
- Graphite layered surfaces
- Silver-edge accenting (subtle, never noisy)
- Reliability-first information hierarchy

## 2. Color Palette & Roles
Use role-based naming and preserve these core mappings.

### Foundation
- Background canvas: `#040506` (`background`, `surface_dim`)
- Base surface: `#0f1114` (`surface`)
- Surface low: `#090b0d` (`surface_container_low`)
- Surface default: `#15191d` (`surface_container`)
- Surface raised: `#1d2228` (`surface_container_high`)
- Surface highest: `#2e353e` (`surface_container_highest`)

### Text
- Primary text: `#f2f4f7` (`on_surface`)
- Secondary text: `#a8afb9` (`on_surface_variant`)
- Muted outline text/meta: `#717986` (`outline`)

### Brand and semantic accents
- Primary action: `#e8ebf0` (`primary_container`)
- Primary readable tint: `#07090c` (`primary`)
- Secondary support: `#2e353e` (`secondary_container`)
- Success / completed: `#53cb92` (UI semantic mapping, green family)
- Warning / caution: `#f1b261` (`tertiary`)
- Error / danger: `#f26d7d` (UI semantic mapping, red family)

### Border and separation
- Soft dividers: `#191d22` (`outline_variant`)
- Strong dividers: `#2e353e` (`outline`)

## 3. Typography Rules
- Headline font: `Space Grotesk`
- Body font: `Inter`
- Label/meta font: `Inter`
- Monospace for technical values (hashes, ids, payload JSON): `IBM Plex Mono`

Type usage:
- Hero and major metric: `Space Grotesk`, medium/bold, tight leading
- Section heading: `Inter` or `Space Grotesk` semibold
- Dense table/body content: `Inter` regular/medium
- Inline technical snippets: mono + slightly reduced size

## 4. Component Stylings
### Buttons
- Primary button: primary-filled (`#e8ebf0`) with high contrast text
- Secondary button: dark surface + subtle outline
- Hover/focus: slight lift and brighter edge tint, not dramatic animation
- Radius: medium-rounded (`~8-12px`)

### Containers and cards
- Prefer tonal layering over hard boxed borders
- Elevated cards use `surface_container_high` or `surface_container_highest`
- Keep shadows soft and diffused; avoid heavy black drop shadows
- Card radius: `~12-16px`

### Badges and chips
- Pill shape for status/context chips
- Verified/completed -> success tone
- Pending/running -> primary tone
- Failed/error -> danger tone

### Tables and dense data
- High contrast header labels + muted metadata rows
- Preserve scanability with spacing, not thick dividers
- Action cells should remain compact and aligned

### Inputs
- Dark filled controls with soft border
- Clear focus ring using primary-tinted outline
- Support JSON/technical entry without clipping

## 5. Layout Principles
- Desktop-first operational layout, optimized around 1200-1400 widths
- Top-level framing: global shell -> page header -> primary data modules
- Use grouped sections (scorecard, agents table, trace timeline) with explicit visual rhythm
- Prefer local refresh states and inline retries over full-page blocking
- Treat empty/error/loading states as first-class UI (actionable copy + retry path)

## 6. Interaction & Motion Guidelines
- Motion is functional and minimal (100-200ms transitions)
- Preserve context during updates (selected tabs, active trace event)
- Show feedback for all async actions: idle, loading, success, failure
- Keep KeeperHub execution affordances immediately discoverable in trace views

## 7. Implementation Guardrails
- Do not introduce light surfaces in console routes
- Do not use saturated glow backgrounds behind large text blocks
- Avoid hard 1px bright borders around every container; reserve stronger lines for hierarchy breaks
- Prioritize readability and telemetry comprehension over decorative visuals
