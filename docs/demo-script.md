## Demo script (finalist + KeeperHub)

### Goal
Show that Tracer turns onchain agent execution from “it failed, shrug” into a reliable, explainable, auditable workflow—powered by KeeperHub execution plus Tracer postmortems.

### Pinned evidence source
- Use `docs/demo-evidence.md` as the canonical list of the 3 traces to present.
- Do a final pass before recording and replace all `REPLACE_WITH_TRACE_ID` values with real trace IDs.

### 2–4 minute recording outline

#### 0:00–0:20 — Problem
- “Agents can reason, but execution fails: reverts, gas spikes, flaky routing.”
- “Tracer gives full timelines + onchain anchoring + AI diagnosis.”
- “KeeperHub gives reliable execution; Tracer makes it explainable and auditable.”
- **Say this line explicitly:** “Without KeeperHub this is brittle and opaque; with KeeperHub we get reliable execution plus status telemetry in one loop.”

#### 0:20–1:10 — Live trace timeline
- Open a trace with at least one `evm_tx`.
- Show the three-panel layout:
  - Metadata (chain, gas used, cost)
  - Timeline cards
  - Inspector details (hash, revert reason, logs)

#### 1:10–2:10 — Reliability lens
- In Trace Detail, run the in-product **Run via KeeperHub** action.
- In Trace Detail, run **Run workflow webhook** with a real KeeperHub workflow ID.
- Show new KeeperHub events in the timeline with:
  - execution id
  - state transitions
  - error/retry evidence
  - settlement link (tx link)
- Click **Refresh KeeperHub status** and show state updates landing as new trace events.

#### 2:10–3:20 — AI analysis + fix
- Show AI analysis summary and suggested fix.
- “We re-run and see the fix succeed” (either a second trace or improved run).

#### 3:20–3:50 — Verification / anchoring
- Show share link and verify status.
- Click the anchor tx on the correct explorer and explain “Merkle root commit”.

#### 3:50–4:00 — Close
- “Tracer is production-grade observability for TypeScript agents on EVM.”
- “KeeperHub integration isn’t decorative: it is the execution backbone we audit end-to-end.”

