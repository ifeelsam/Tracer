#!/usr/bin/env node
/**
 * Smoke test for the local Tracer stack.
 * Assumes services are running with default dev ports.
 */

async function check(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json().catch(() => ({}));
}

async function main() {
  const ingest = process.env.TRACER_SMOKE_INGEST_URL ?? "http://localhost:4001";
  const dashboard = process.env.TRACER_SMOKE_DASHBOARD_URL ?? "http://localhost:3000";
  const server = process.env.TRACER_SMOKE_SERVER_URL ?? "http://localhost:3001";

  console.log("[smoke] checking ingest /healthz");
  await check(`${ingest}/healthz`);

  console.log("[smoke] checking server /api/trpc/chains.getActive");
  const trpc = await fetch(`${server}/api/trpc/chains.getActive`, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(3000),
  });
  if (!trpc.ok) {
    throw new Error(`server trpc returned ${trpc.status}`);
  }

  console.log("[smoke] checking dashboard loads");
  const page = await fetch(`${dashboard}/`, { signal: AbortSignal.timeout(3000) });
  if (!page.ok) {
    throw new Error(`dashboard returned ${page.status}`);
  }

  console.log("[smoke] ok");
}

main().catch((error) => {
  console.error("[smoke] failed:", error);
  process.exit(1);
});

