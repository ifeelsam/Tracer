"use client"

import { usePrivy } from "@privy-io/react-auth"
/**
 * The onboarding wizard guides operators from agent creation into installation without losing context.
 * It keeps the first step transactional and explicit so credentials are only revealed after a successful create.
 */
import type { TracerChain } from "@tracerlabs/shared"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { createBrowserTRPCClient } from "../lib/trpc"
import { ChainBadge } from "./chain-badge"
import { usePrivyEnabled } from "./providers"

interface CreatedAgentState {
  agent: {
    id: string
    displayName: string
    chainId: number
    environment: string
  }
  apiKey: string
  verifyToken: string
}

type IntegrationTab = "openai" | "anthropic" | "vercel-ai" | "langchain"

interface ConnectionState {
  connected: boolean
  verified: boolean
  firstTraceId: string | null
  firstSeenAt: string | null
  timedOut: boolean
}

export function AgentOnboardingWizard({ chains }: { chains: TracerChain[] }) {
  const privyEnabled = usePrivyEnabled()

  if (!privyEnabled) {
    return (
      <main className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <aside className="frame p-6">
          <div className="label text-[var(--foreground-muted)]">Onboarding Flow</div>
          <h1 className="headline mt-6 text-5xl leading-none">Bring a traced agent online.</h1>
          <p className="mt-8 text-sm leading-7 text-[var(--foreground-muted)]">
            Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to enable protected agent creation from the
            dashboard.
          </p>
        </aside>
        <section className="frame p-6">
          <div className="label text-[var(--foreground-muted)]">Step 1</div>
          <p className="mt-6 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
            The chain registry is loaded and ready, but this surface only creates agents once Privy
            is configured.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {chains.map((chain) => (
              <ChainBadge key={chain.id} chain={chain} />
            ))}
          </div>
        </section>
      </main>
    )
  }

  return <PrivyAgentOnboardingWizard chains={chains} />
}

function PrivyAgentOnboardingWizard({ chains }: { chains: TracerChain[] }) {
  const { authenticated, getAccessToken, login } = usePrivy()
  const [displayName, setDisplayName] = useState("")
  const [selectedChainId, setSelectedChainId] = useState<number>(chains[0]?.id ?? 84532)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [createdAgent, setCreatedAgent] = useState<CreatedAgentState | null>(null)
  const [activeTab, setActiveTab] = useState<IntegrationTab>("openai")
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null)

  const selectedChain = useMemo(
    () => chains.find((chain) => chain.id === selectedChainId) ?? chains[0] ?? null,
    [chains, selectedChainId]
  )
  const installChainId = createdAgent?.agent.chainId ?? selectedChain?.id ?? chains[0]?.id ?? 84532
  const integrationSnippets: Record<IntegrationTab, string> = {
    openai: [
      'import OpenAI from "openai"',
      "",
      "const tracer = new Tracer({",
      "  apiKey: process.env.TRACER_API_KEY!,",
      "  agentId: process.env.TRACER_AGENT_ID!,",
      "  chainId: parseInt(process.env.TRACER_CHAIN_ID!, 10),",
      "  verifyToken: process.env.TRACER_VERIFY_TOKEN,",
      "})",
      "",
      "const openai = tracer.wrapOpenAI(",
      "  new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })",
      ")",
    ].join("\n"),
    anthropic: [
      'import Anthropic from "@anthropic-ai/sdk"',
      "",
      "const tracer = new Tracer({",
      "  apiKey: process.env.TRACER_API_KEY!,",
      "  agentId: process.env.TRACER_AGENT_ID!,",
      "  chainId: parseInt(process.env.TRACER_CHAIN_ID!, 10),",
      "  verifyToken: process.env.TRACER_VERIFY_TOKEN,",
      "})",
      "",
      "const anthropic = tracer.wrapAnthropic(",
      "  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })",
      ")",
    ].join("\n"),
    "vercel-ai": [
      'import { openai } from "@ai-sdk/openai"',
      "",
      "const tracer = new Tracer({",
      "  apiKey: process.env.TRACER_API_KEY!,",
      "  agentId: process.env.TRACER_AGENT_ID!,",
      "  chainId: parseInt(process.env.TRACER_CHAIN_ID!, 10),",
      "  verifyToken: process.env.TRACER_VERIFY_TOKEN,",
      "})",
      "",
      'const model = tracer.wrapLanguageModel(openai("gpt-4.1"))',
    ].join("\n"),
    langchain: [
      'import { ChatOpenAI } from "@langchain/openai"',
      "",
      "const tracer = new Tracer({",
      "  apiKey: process.env.TRACER_API_KEY!,",
      "  agentId: process.env.TRACER_AGENT_ID!,",
      "  chainId: parseInt(process.env.TRACER_CHAIN_ID!, 10),",
      "  verifyToken: process.env.TRACER_VERIFY_TOKEN,",
      "})",
      "",
      "const llm = new ChatOpenAI({",
      '  model: "gpt-4.1",',
      "  callbacks: [tracer.langchainHandler()],",
      "})",
    ].join("\n"),
  }
  const evmSnippet = [
    "const walletClient = tracer.wrapWalletClient(",
    "  createWalletClient({ ... })",
    ")",
    "",
    "const publicClient = tracer.wrapPublicClient(",
    "  createPublicClient({ ... })",
    ")",
  ].join("\n")
  const assistantPrompt = [
    "You are a TypeScript AI agent operating on an EVM chain.",
    "Use the wrapped walletClient for transactions and the wrapped publicClient for reads so every onchain action is traced.",
    "Before sending a transaction, reason about the target, calldata, value, and expected side effects.",
  ].join("\n")

  useEffect(() => {
    if (!createdAgent || !authenticated) {
      return
    }

    const client = createBrowserTRPCClient(() => getAccessToken())
    const agentId = createdAgent.agent.id
    const startedAt = Date.now()
    let cancelled = false
    let timeoutId: number | null = null

    setConnectionState({
      connected: false,
      verified: false,
      firstTraceId: null,
      firstSeenAt: null,
      timedOut: false,
    })

    async function pollConnection() {
      try {
        const result = (await client.query("agents.checkConnection", agentId)) as Omit<
          ConnectionState,
          "timedOut"
        > & {
          firstSeenAt: Date | string | null
        }

        if (cancelled) {
          return
        }

        if (result.connected) {
          setConnectionState({
            connected: true,
            verified: result.verified,
            firstTraceId: result.firstTraceId,
            firstSeenAt: result.firstSeenAt ? new Date(result.firstSeenAt).toISOString() : null,
            timedOut: false,
          })
          return
        }

        if (Date.now() - startedAt >= 4 * 60 * 1000) {
          setConnectionState({
            connected: false,
            verified: result.verified,
            firstTraceId: null,
            firstSeenAt: null,
            timedOut: true,
          })
          return
        }

        timeoutId = window.setTimeout(() => {
          void pollConnection()
        }, 5000)
      } catch {
        if (cancelled) {
          return
        }

        timeoutId = window.setTimeout(() => {
          void pollConnection()
        }, 5000)
      }
    }

    void pollConnection()

    return () => {
      cancelled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [authenticated, createdAgent, getAccessToken])

  async function handleCreateAgent() {
    if (!selectedChain || displayName.trim().length === 0) {
      setErrorMessage("Choose a chain and give the agent a display name before continuing.")
      return
    }

    if (!authenticated) {
      setErrorMessage("Authenticate with Privy before creating an agent.")
      await login()
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const client = createBrowserTRPCClient(() => getAccessToken())
      const result = (await client.mutation("agents.create", {
        displayName: displayName.trim(),
        chainId: selectedChain.id,
        environment: selectedChain.isTestnet ? "testnet" : "mainnet",
      })) as CreatedAgentState

      setCreatedAgent(result)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create agent.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
      <aside className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Onboarding Flow</div>
        <h1 className="headline mt-6 text-5xl leading-none">Bring a traced agent online.</h1>
        <div className="mt-8 grid gap-3">
          {[
            "1. Name + chain selection",
            "2. Install SDK",
            "3. Wrap your agent",
            "4. Waiting for first trace",
          ].map((step, index) => (
            <div
              key={step}
              className="frame flex items-center justify-between gap-3 p-4"
              data-active={index === 0}
            >
              <span className="label text-[var(--foreground-muted)]">{step}</span>
              <span
                className="chain-badge"
                style={{
                  color:
                    index === 0
                      ? createdAgent
                        ? "var(--foreground)"
                        : "var(--accent)"
                      : index === 3 && connectionState?.connected
                        ? "var(--foreground)"
                        : (index === 1 || index === 2 || index === 3) && createdAgent
                          ? "var(--accent)"
                          : "var(--surface-line)",
                }}
              >
                {index === 0
                  ? createdAgent
                    ? "Done"
                    : "Active"
                  : index === 3
                    ? connectionState?.connected
                      ? "Done"
                      : createdAgent
                        ? "Waiting"
                        : "Queued"
                    : (index === 1 || index === 2) && createdAgent
                      ? "Active"
                      : createdAgent
                        ? "Ready"
                        : "Queued"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm leading-7 text-[var(--foreground-muted)]">
          Choose the chain your agent runs on. This dashboard filter is separate from the backend
          instance chain, so onboarding stays chain agnostic from day one.
        </p>
      </aside>

      <section className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Step 1</div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="grid gap-5">
            <label className="grid gap-2">
              <span className="label text-[var(--foreground-muted)]">Agent Display Name</span>
              <input
                className="input-brutal"
                onChange={(event) => setDisplayName(event.currentTarget.value)}
                placeholder="Settlement Copilot"
                value={displayName}
              />
            </label>

            <label className="grid gap-2">
              <span className="label text-[var(--foreground-muted)]">
                Which chain is this agent on?
              </span>
              <select
                className="input-brutal"
                onChange={(event) => {
                  setSelectedChainId(Number.parseInt(event.currentTarget.value, 10))
                }}
                value={selectedChain?.id ?? ""}
              >
                {chains.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name} {chain.isTestnet ? "• testnet" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="nav-chip"
                disabled={isSubmitting}
                onClick={() => void handleCreateAgent()}
                type="button"
              >
                {isSubmitting ? "Creating..." : "Create Agent"}
              </button>
              <Link className="nav-chip" href="/app">
                Back to Console
              </Link>
            </div>

            {errorMessage ? (
              <div className="frame border-[var(--accent)] p-4">
                <div className="label text-[var(--accent)]">Create Error</div>
                <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
                  {errorMessage}
                </p>
              </div>
            ) : null}

            {createdAgent ? (
              <div className="frame border-[var(--accent)] p-5">
                <div className="label text-[var(--accent)]">Agent Created</div>
                <p className="mt-3 text-sm leading-6">
                  {createdAgent.agent.displayName} is ready for installation on{" "}
                  {selectedChain?.name ?? "the selected chain"}.
                </p>
                <div className="mt-5 grid gap-3">
                  <CredentialRow label="Agent ID" value={createdAgent.agent.id} />
                  <CredentialRow label="API Key" value={createdAgent.apiKey} />
                  <CredentialRow label="Verify Token" value={createdAgent.verifyToken} />
                </div>
              </div>
            ) : null}

            {createdAgent ? (
              <div className="frame p-5">
                <div className="label text-[var(--foreground-muted)]">Step 2</div>
                <h2 className="headline mt-4 text-3xl leading-none">Install the SDK.</h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
                  These values are generated for this agent only. Add them to the runtime where the
                  traced agent boots.
                </p>
                <div className="mt-6 grid gap-4">
                  <SnippetCard code="npm install @tracerlabs/sdk" label="Package" />
                  <SnippetCard
                    code={[
                      `TRACER_API_KEY=${createdAgent.apiKey}`,
                      `TRACER_AGENT_ID=${createdAgent.agent.id}`,
                      `TRACER_VERIFY_TOKEN=${createdAgent.verifyToken}`,
                      `TRACER_CHAIN_ID=${installChainId}`,
                    ].join("\n")}
                    label="Environment"
                  />
                </div>
              </div>
            ) : null}

            {createdAgent ? (
              <div className="frame p-5">
                <div className="label text-[var(--foreground-muted)]">Step 3</div>
                <h2 className="headline mt-4 text-3xl leading-none">Wrap your agent.</h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
                  Choose the integration surface your agent already uses, then wrap its model client
                  and viem clients with Tracer.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {[
                    ["openai", "OpenAI"],
                    ["anthropic", "Anthropic"],
                    ["vercel-ai", "Vercel AI SDK"],
                    ["langchain", "LangChain"],
                  ].map(([tab, label]) => (
                    <button
                      key={tab}
                      className="nav-chip"
                      data-active={activeTab === tab}
                      onClick={() => setActiveTab(tab as IntegrationTab)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-6 grid gap-4">
                  <SnippetCard code={integrationSnippets[activeTab]} label="Model Integration" />
                  <SnippetCard code={evmSnippet} label="viem Wallet + Public Client" />
                  <SnippetCard code={assistantPrompt} label="AI Assistant Copy Prompt" />
                </div>
              </div>
            ) : null}

            {createdAgent ? (
              <div className="frame p-5">
                <div className="label text-[var(--foreground-muted)]">Step 4</div>
                <h2 className="headline mt-4 text-3xl leading-none">Waiting for first trace.</h2>
                {connectionState?.connected ? (
                  <div className="mt-4 grid gap-4">
                    <p className="text-sm leading-7 text-[var(--foreground-muted)]">
                      The SDK connected successfully and the first trace has been ingested.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <CredentialRow
                        label="Verified"
                        value={connectionState.verified ? "true" : "false"}
                      />
                      <CredentialRow
                        label="First Seen"
                        value={connectionState.firstSeenAt ?? "unknown"}
                      />
                    </div>
                    {connectionState.firstTraceId ? (
                      <Link
                        className="nav-chip w-fit"
                        href={`/app/traces/${connectionState.firstTraceId}`}
                      >
                        Open First Trace
                      </Link>
                    ) : null}
                  </div>
                ) : connectionState?.timedOut ? (
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
                    No trace arrived within four minutes. Double-check the SDK install, env vars,
                    and wrapped clients, then keep the agent running while Tracer waits for the
                    first batch.
                  </p>
                ) : (
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
                    Polling for the first verified trace now. This screen checks connection status
                    every five seconds for up to four minutes.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="frame p-5">
            <div className="label text-[var(--foreground-muted)]">Chain Profile</div>
            {selectedChain ? (
              <div className="mt-4 grid gap-4">
                <ChainBadge chain={selectedChain} />
                <dl className="grid gap-3 text-sm leading-6">
                  <div>
                    <dt className="label text-[var(--foreground-muted)]">Environment</dt>
                    <dd>{selectedChain.isTestnet ? "Testnet" : "Mainnet"}</dd>
                  </div>
                  <div>
                    <dt className="label text-[var(--foreground-muted)]">Native Asset</dt>
                    <dd>{selectedChain.nativeCurrency.symbol}</dd>
                  </div>
                  <div>
                    <dt className="label text-[var(--foreground-muted)]">Explorer</dt>
                    <dd className="break-all text-[var(--foreground-muted)]">
                      {selectedChain.blockExplorerUrl}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-[var(--foreground-muted)]">
                No chain registry entries are available.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="frame bg-[var(--background-deep)] p-3">
      <div className="label text-[var(--foreground-muted)]">{label}</div>
      <code className="mt-2 block break-all text-sm leading-6">{value}</code>
    </div>
  )
}

function SnippetCard({ code, label }: { code: string; label: string }) {
  return (
    <div className="frame bg-[var(--background-deep)] p-4">
      <div className="label text-[var(--foreground-muted)]">{label}</div>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm leading-7">{code}</pre>
    </div>
  )
}
