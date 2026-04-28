/**
 * Minimal bridge example for KeeperHub Focus Area 2:
 * LangChain-style agent decision -> Tracer trace -> Tracer server -> KeeperHub execution.
 */
import { httpBatchLink } from "@trpc/client"
import { createTRPCProxyClient } from "@trpc/client"
import type { AppRouter } from "../apps/server/server/routers/_app"
import { Tracer } from "../packages/sdk/src/client"

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required.`)
  }
  return value.trim()
}

async function main() {
  const tracer = new Tracer({
    apiKey: required("TRACER_API_KEY"),
    agentId: required("TRACER_AGENT_ID"),
    chainId: Number.parseInt(process.env.TRACER_CHAIN_ID ?? "84532", 10),
    environment: (process.env.TRACER_ENVIRONMENT as "testnet" | "mainnet") ?? "testnet",
    endpoint: process.env.TRACER_INGEST_URL ?? "http://localhost:4001",
    verifyToken: process.env.TRACER_VERIFY_TOKEN,
  })

  const trpc = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${process.env.TRACER_SERVER_URL ?? "http://localhost:3001"}/api/trpc`,
        headers: () => ({
          authorization: `Bearer ${required("TRACER_OPERATOR_BEARER")}`,
        }),
      }),
    ],
  })

  const session = await tracer.startSession({
    inputSummary: "LangChain strategy decided to execute a KeeperHub-backed contract call.",
    tags: ["langchain", "keeperhub", "bridge-example"],
  })

  await session.run(async () => {
    const planner = session.beginEvent("tool_call", {
      name: "langchain.plan",
      inputs: { objective: "run KeeperHub-backed write on Base Sepolia" },
    })
    planner.complete({
      decision: "execute keeperhub direct contract call",
      confidence: 0.82,
    })

    const runResult = await trpc.keeperhub.runForTrace.mutate({
      traceId: session.id,
      request: {
        network: process.env.KEEPERHUB_NETWORK ?? "base-sepolia",
        contractAddress: required("KEEPERHUB_CONTRACT_ADDRESS"),
        functionName: required("KEEPERHUB_FUNCTION_NAME"),
        functionArgs: JSON.parse(process.env.KEEPERHUB_FUNCTION_ARGS_JSON ?? "[]") as unknown[],
        abi: JSON.parse(process.env.KEEPERHUB_ABI_JSON ?? "[]") as unknown[],
      },
    })

    if (runResult.executionId) {
      await trpc.keeperhub.refreshExecutionForTrace.mutate({
        traceId: session.id,
        executionId: runResult.executionId,
      })
    }

    session.setOutputSummary(
      `Bridge complete: queued=${String(runResult.queued)} status=${runResult.status}`
    )
  })

  session.complete("LangChain-to-KeeperHub bridge path executed.")
  console.log(`Created trace: ${session.id}`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
