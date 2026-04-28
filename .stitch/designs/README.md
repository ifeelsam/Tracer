# Stitch Screen Export Index

This directory tracks the screen references used for frontend implementation.

## Route-to-Screen Mapping
- `/` -> `landing-v2`
- `/login` -> `login-v2`
- `/app` -> `console-home-v2`
- `/app/agents/new` -> `agent-onboarding-v2`
- `/app/agents/[id]` -> `agent-detail-v2`
- `/app/agents/[id]/settings` -> `agent-settings-v2`
- `/app/agents/[id]/traces` -> `agent-traces-v2`
- `/app/traces/[id]` -> `trace-detail-v2`
- `/share/[token]` -> `share-report-v2`

## Notes
- Keep visual language consistent with `.stitch/DESIGN.md`.
- Prefer incremental edits over full rewrites when behavior is already correct.
- Preserve existing dynamic data contracts and tRPC query/mutation flow.
