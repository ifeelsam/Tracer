# KeeperHub Prize Submission Copy

## One-liner
Tracer is the reliability and observability layer for autonomous EVM agents: we route critical execution through KeeperHub, capture execution lifecycle telemetry as first-class trace events, and anchor trace integrity onchain.

## What is deeply integrated with KeeperHub
- In-product KeeperHub execution trigger from trace detail (`Run via KeeperHub`) that calls `keeperhub.directContractCall`.
- In-product KeeperHub workflow trigger from trace detail (`Run workflow webhook`) that calls `/api/workflows/{workflowId}/webhook`.
- Execution lifecycle tracking via `executionId` and status refresh (`keeperhub.directExecutionStatus`) stored back into trace timeline events.
- Reliability analytics on dashboard: success rate, retries, time-to-finality, and top failure reason derived from KeeperHub execution events.

## User value
- Operators can answer, from one screen: what the agent intended, what KeeperHub executed, what failed/retried, and what settled.
- Debugging goes from “execution failed somewhere” to concrete lifecycle evidence with timestamps and failure reasons.
- Teams can prove reliability trends over time using dashboard metrics, not anecdotal logs.

## Measurable outcomes
- KeeperHub execution IDs are persisted into trace timelines.
- Status transitions are visible as trace events and refreshable during incident response.
- Workflow webhook lifecycle is persisted as trace events (`keeperhub.workflowWebhook.triggered` and `keeperhub.workflowWebhook.status`).
- Reliability KPIs are computed from captured KeeperHub events:
  - success rate
  - retries observed
  - average time-to-finality
  - dominant failure reason

## Pinned demo evidence
- Maintain 3 concrete traces in `docs/demo-evidence.md`:
  - direct-success trace,
  - workflow-webhook trace,
  - failure-and-recovery trace.

## Why this wins
Most demos show only agent intent or final tx hash. Tracer + KeeperHub shows the full reliability loop: intent -> managed execution -> lifecycle telemetry -> analysis -> auditable evidence.
