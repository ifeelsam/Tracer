## KeeperHub integration (why it matters)

### Motivation
Onchain agents routinely fail at the execution boundary:
- reverts due to stale assumptions,
- gas volatility,
- flaky RPCs,
- brittle transaction broadcasting logic.

KeeperHub exists to solve *execution reliability*. Tracer exists to solve *execution explainability*.
This integration makes KeeperHub a first-class execution backend whose lifecycle is visible, auditable,
and debuggable inside Tracer.

### What we integrated

#### 1) Programmatic execution surface
- **File:** `apps/server/lib/keeperhub.ts`
- **What it does:** Calls the KeeperHub API using `KEEPERHUB_API_KEY` and supports both documented auth styles:
  - `Authorization: Bearer kh_...` (org keys)
  - `X-API-Key: keeper_...` (direct execution keys)

#### 2) Direct execution endpoint wiring
- **File:** `apps/server/server/routers/keeperhub.ts`
- **What it does:** Exposes authenticated tRPC procedures:
  - `keeperhub.directContractCall` (contract calls via KeeperHub)
  - `keeperhub.directExecutionStatus` (poll status and settlement evidence)

This gives a clean integration point for dashboard-driven demos *and* for agent frameworks that want
to call Tracer’s API instead of wiring KeeperHub directly.

#### 3) Reliability lens in the dashboard
- **File:** `apps/dashboard/components/trace-detail-view.tsx`
- **What it does:** Adds a dedicated “Execution Reliability (KeeperHub)” panel in trace detail and adds
special-casing for KeeperHub tool call events so judges can quickly see the execution lifecycle.

### How to configure
Set:
- `KEEPERHUB_API_KEY` in `apps/server` environment.

### What judges should look for
- Deep protocol usage (not just “we imported a logo”):
  - direct execution calls,
  - status polling,
  - settlement evidence links,
  - reliability lifecycle surfaced in the trace UI.

