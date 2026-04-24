## Judge Q&A (finalist + KeeperHub)

### What inspired this?
- “Onchain agents fail at execution: reverts, gas spikes, unpredictable routing. We built the missing observability + reliability layer so teams can actually ship agents to production.”

### What did you build during the hackathon?
- “A full-stack observability platform for TypeScript agents on EVM: SDK instrumentation, ingest + DB persistence, workers (analysis, enrichment, anchoring), and a dashboard for investigation.”
- “A KeeperHub execution integration surface to make execution reliable and auditable.”

### Why KeeperHub?
- “Because most agent failures happen at the execution boundary. KeeperHub gives reliable execution primitives and Tracer makes the lifecycle explainable with trace evidence and postmortems.”

### What’s the technical challenge you solved?
- “Capturing end-to-end causality across LLM calls, tool calls, EVM reads/writes, and background enrichment—without blocking the agent.”
- “Ensuring ingestion and analysis are schema-safe so the UI and postmortems don’t lie.”

### How is this production-grade?
- “SDK never throws on flush; ingest validates critical payload shapes; workers are idempotent/best-effort; verification uses onchain anchoring with Merkle proofs; UI is optimized for real investigation workflows.”

### What’s the ‘WOW’ moment?
- “We show an execution failure, the reliability path via KeeperHub, then Tracer explains the root cause and suggests a fix—then we re-run and see it succeed with a clean audit trail.”

