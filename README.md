# Tracer

Production-grade observability and debugging platform for TypeScript AI agents running on EVM chains.

## What you can do
- **Instrument** TypeScript AI agents and capture `llm_call`, `tool_call`, `evm_tx`, and `evm_contract_read` events.
- **Ingest** batched traces with gzip compression, rate limiting, and best-effort delivery (SDK never throws).
- **Inspect** traces in a three-panel dashboard (metadata, timeline, inspector).
- **Verify** trace anchoring via onchain Merkle root commits (anchor worker + verify router).
- **Analyze** traces with an LLM worker that produces structured debugging output.
- **KeeperHub integration (hackathon focus):** trigger KeeperHub direct execution via authenticated API and surface reliability metadata.

## Repo structure
- `packages/shared`: chain registry + shared types/schemas.
- `packages/db`: Prisma schema + client.
- `packages/sdk`: Tracer SDK (buffering, sessions, instrumentation).
- `apps/ingest`: Fastify ingest service.
- `apps/server`: Next.js + tRPC API and analysis worker.
- `apps/dashboard`: Next.js dashboard UI.
- `apps/anchor-worker`: EVM calldata anchoring worker.
- `apps/enrichment-worker`: Alchemy webhook consumer + receipt/log enrichment.

## Quick start (local)

### 1) Install deps
```bash
pnpm install
```

### 2) Configure env
Copy `.env.example` to `.env` in each app as needed.

At minimum, you need:
- Postgres (`DATABASE_URL`)
- Upstash Redis (`REDIS_URL`)
- Privy (dashboard + server)
- A chain RPC for `ACTIVE_CHAIN_ID`

### 3) Run the full stack
```bash
pnpm dev:stack
```

### 4) Smoke test
```bash
pnpm smoke:stack
```

### 5) Runtime config guard
```bash
pnpm validate:runtime
```

### 6) Staging release gates
- CI workflow: `.github/workflows/release-gates.yml`
- Staging smoke script: `pnpm smoke:staging` (uses `STAGING_INGEST_URL`, `STAGING_SERVER_URL`, `STAGING_DASHBOARD_URL`)

## Production hardening features in this repo
- Secret file support (`*_FILE`) for Redis, signer key, and Alchemy webhook credentials.
- Anchor RPC failover via `*_RPC_URL_FALLBACKS` and viem fallback transports.
- Retry + backoff + DLQ queues for:
  - `anchor:pending` -> `anchor:dlq`
  - `analysis:pending` -> `analysis:dlq`
  - enrichment retries -> `enrichment:dlq`
- Metrics endpoints/counters:
  - ingest: `GET /metrics`
  - enrichment-worker: `GET /metrics`
  - worker counters in Redis under `metrics:*`
- Ops alert events published to Redis channel `alerts:ops` on queue lag and DLQ overflow conditions.

## KeeperHub prize track (integration evidence)
See:
- `apps/server/lib/keeperhub.ts` (KeeperHub API client + direct execution)
- `apps/server/server/routers/keeperhub.ts` (tRPC surface)
- `apps/dashboard/components/trace-detail-view.tsx` (“Execution Reliability (KeeperHub)” panel)
- `docs/keeperhub-integration.md` (what we integrated and why it’s essential)
- `examples/langchain-keeperhub-bridge.ts` (framework bridge: LangChain-style flow -> Tracer -> KeeperHub)
- `docs/demo-evidence.md` (pinboard for the 3 judge-facing evidence traces)

### KeeperHub key setup
- `KEEPERHUB_API_KEY`: use a `kh_` org key for direct execution and status endpoints.
- `KEEPERHUB_WEBHOOK_API_KEY`: use a `wfb_` key for workflow webhook triggers.
- Optional: `KEEPERHUB_DIRECT_AUTH_HEADER=x-api-key` only if your org still uses legacy direct keys.
- Security hygiene: never reuse demo-day keys after sharing logs/screenshots. Rotate KeeperHub, Privy,
  RPC, and signer secrets before submission freeze.

## Demo and judging prep
- Demo script: `docs/demo-script.md`
- Judge Q&A: `docs/judge-qa.md`

