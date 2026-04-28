# Tracer Dashboard Design System

## Product Intent
Tracer is an operator console for debugging AI agents with high trust and low ambiguity. The UI should feel technical, calm, and precise, with clear hierarchy and excellent scanability under pressure.

## Visual Direction
- Theme: modern dark console with premium minimalism.
- Character: high-contrast text, restrained glow, soft radii, strong spacing rhythm.
- Avoid: noisy gradients, decorative motion, overly playful color treatment.

## Core Tokens

### Colors
- `--bg-canvas`: `#0b0f19`
- `--bg-subtle`: `#0f1629`
- `--surface`: `#141d33`
- `--surface-elev`: `#1b2744`
- `--line`: `#2a3b63`
- `--line-strong`: `#3b5487`
- `--text`: `#e8eefc`
- `--text-muted`: `#9fb2da`
- `--text-faint`: `#7486b0`
- `--accent`: `#5b8cff`
- `--accent-soft`: `#1f3f86`
- `--danger`: `#ff5f7a`
- `--success`: `#4fd1a5`
- `--warning`: `#f7c66b`

### Typography
- Display: `Instrument Serif` for hero/section headlines.
- Body/UI: `JetBrains Mono` for labels, controls, metadata.
- Size scale:
  - xs: 11/16
  - sm: 13/20
  - md: 15/24
  - lg: 18/28
  - xl: 26/34
  - 2xl: 40/44

### Spacing and Radius
- Spacing base: 4px.
- Common paddings: 12, 16, 20, 24.
- Radius:
  - controls: 10px
  - cards: 14px
  - panels: 16px

### Shadows
- `--shadow-soft`: `0 8px 30px rgba(2, 8, 23, 0.35)`
- `--shadow-focus`: `0 0 0 3px rgba(91, 140, 255, 0.28)`

## Component Standards

### Page Shell
- max width: `1280px`
- vertical rhythm: 24px blocks
- section cards should have clear heading + supportive copy + primary action

### Buttons
- Primary: accent background, high contrast text
- Secondary: surface background with line border
- Danger: danger tint border/text
- Interactive states: hover brighten, focus ring, disabled opacity + pointer lock

### Inputs
- Filled dark surface with subtle border
- 44px min tap target
- Error state line/text in `--danger`

### Badges
- Small uppercase metadata chips
- Status colors:
  - ok/completed: success
  - running/pending: accent
  - error/failed: danger

### Data States
- Loading: skeleton or muted status copy
- Empty: actionable explanation + next step CTA
- Error: explicit message + retry affordance

## Page-Level Structure
- Landing: concise value proposition + 3 capability cards + CTA.
- Login: focused auth call-to-action with clear fallback guidance.
- App home: reliability snapshot + agent table/cards.
- Agent detail/settings/traces: two-column operational layout on desktop, stacked on mobile.
- Trace detail: tri-pane inspection experience with discoverable KeeperHub controls.
- Share page: readable public report with verification and timeline sections.

## Interaction Rules
- Avoid full-page flicker on local refresh actions.
- Preserve user focus (selected event, selected tab) after updates.
- All critical actions should return immediate visual feedback (busy, success, error).

## Responsive Behavior
- Desktop-first 1280.
- Breakpoints:
  - 1024: collapse side panels where needed.
  - 768: single-column cards, keep control bars wrapping gracefully.
  - 390: prioritize readable typography and touch targets.
