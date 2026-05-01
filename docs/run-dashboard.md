# Run the Tracer dashboard (quick path)

Use this to verify UI after CSS or layout changes.

## Prerequisites

- Node 20+ (repo uses pnpm).
- From repo root: `pnpm install`.

## Environment

Create `apps/dashboard/.env.local` (copy from repo env templates if your fork provides them). Typical keys:

- `NEXT_PUBLIC_PRIVY_APP_ID` — required for full auth flows; without it the app may run in read-only / degraded mode depending on code paths.
- Point `NEXT_PUBLIC_TRACER_API_URL` (or equivalent used in your fork) at a running `apps/server` if you need live data.

## Start API (optional, for live traces)

If you only need static pages (e.g. `/login`), you can try the dashboard alone first.

Full stack from root (when configured):

```bash
pnpm dev:stack
```

## Dashboard only

```bash
pnpm -C apps/dashboard dev
```

Open [http://localhost:3000](http://localhost:3000) (or the port Next prints).

## What to check for theme/token fixes

- **`/login`** — body copy and inset callout use `--ink-*` aliases; text should not be invisible on the card.
- **`/app`** (after sign-in) — sidebar footer identity chip should show a **tinted background** and readable initial (uses `--violet-*` + `--font-mono`).
- **Typography** — `body` should prefer **Inter Tight** and monospace regions **JetBrains Mono** when `app/layout.tsx` loads `next/font`.

## Typecheck

```bash
pnpm -C apps/dashboard typecheck
```
