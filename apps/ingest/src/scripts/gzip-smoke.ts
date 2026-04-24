/**
 * Smoke check for SDK-compatible gzipped JSON ingestion.
 * Run with: pnpm -C apps/ingest smoke:gzip
 */
import { gzipSync } from "node:zlib"

import { buildApp } from "../app"

async function main() {
  const app = buildApp()

  const payload = {
    agentId: "agent_smoke",
    chainId: 84532,
    environment: "testnet",
    traces: [
      {
        trace: {
          id: "trace_smoke",
          agentId: "agent_smoke",
          chainId: 84532,
          status: "completed",
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: 1,
          inputSummary: "smoke",
          outputSummary: "ok",
          errorMessage: null,
          eventCount: 0,
          totalTokens: 0,
          totalCostUsd: "0",
          totalGasUsed: "0",
          evmTxCount: 0,
          toolsCalled: [],
          anchorTxHash: null,
          anchorBlock: null,
          merkleProof: null,
          traceHash: null,
          shareToken: null,
          tags: [],
        },
        events: [],
        privateMode: false,
        environment: "testnet",
      },
    ],
  }

  const response = await app.inject({
    method: "POST",
    url: "/v1/traces/batch",
    headers: {
      "content-type": "application/json",
      "content-encoding": "gzip",
    },
    payload: gzipSync(JSON.stringify(payload)),
  })

  // We expect a 401 missing_api_key, but NOT a 400 invalid_request due to gzip parsing.
  if (response.statusCode !== 401) {
    throw new Error(
      `Expected 401 invalid_api_key/missing_api_key, got ${response.statusCode}: ${response.body}`
    )
  }

  console.log("ok: gzip parser accepted JSON payload and reached auth checks")
}

void main()
