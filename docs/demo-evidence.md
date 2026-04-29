## Demo Evidence Traces (Pinboard)

Use this file as the single source of truth for judge-facing KeeperHub evidence.

### Pinned traces

- `direct_success_trace_id`: `manual_1777365736227_direct_809287`
  - path: direct contract call via KeeperHub (`keeperhub.directContractCall`)
  - expected: `executionId` present, terminal status `completed`, tx link visible
- `workflow_webhook_trace_id`: `manual_1777365736227_workflow_809287`
  - path: workflow webhook trigger (`keeperhub.workflowWebhook.triggered`)
  - expected: webhook trigger attempts and error reason visible in timeline
- `failure_recovery_trace_id`: `manual_1777365736227_recovery_809288`
  - path: intentionally failing run then retried/successful follow-up
  - expected: failure reason captured, status transitions visible, reliability metrics updated

### Share URLs

- `direct_success_share_url`: `http://localhost:3000/share/s1aujuhcZ8WaH5kdNCPbnErS`
- `workflow_webhook_share_url`: `http://localhost:3000/share/ZH6xooE4A9Krr0D9_SLowi5i`
- `failure_recovery_share_url`: `http://localhost:3000/share/qr4bfgsiyCbLXu-BhzgHnbT3`

### Evidence checklist per trace

- share URL works (`/share/{token}`)
- trace timeline includes KeeperHub events
- at least one `executionId` visible in metadata/timeline
- status refresh appends new events
- final tx/explorer proof available where applicable

### Recording order

1. Show `direct_success_trace_id`.
2. Show `workflow_webhook_trace_id`.
3. Show `failure_recovery_trace_id`.
4. Open dashboard reliability panel and call out deltas (success rate, retries, time-to-finality, top failed reason).
