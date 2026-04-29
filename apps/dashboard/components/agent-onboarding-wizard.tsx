"use client"

import { usePrivy } from "@privy-io/react-auth"
/**
 * The onboarding wizard guides operators from agent creation into installation without losing context.
 * It keeps the first step transactional and explicit so credentials are only revealed after a successful create.
 */
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import type { SupportedChain } from "../lib/trpc"
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

export function AgentOnboardingWizard({ chains }: { chains: SupportedChain[] }) {
  const privyEnabled = usePrivyEnabled()

  if (!privyEnabled) {
    return (
      <main className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <aside className="card p-6">
          <div className="eyebrow">Onboarding Flow</div>
          <h1 className="h1 mt-4">Bring a traced agent online.</h1>
          <p className="mt-6 text-sm leading-7 text-[var(--fg-muted)]">
            Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to enable protected agent creation from the
            dashboard.
          </p>
        </aside>
        <section className="card p-6">
          <div className="eyebrow">Step 1</div>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--fg-muted)]">
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

function PrivyAgentOnboardingWizard({ chains }: { chains: SupportedChain[] }) {
  const { authenticated, getAccessToken, login, ready } = usePrivy()
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
  const previewName = displayName.trim().length > 0 ? displayName.trim() : "Agent Name"
  const previewSummary =
    displayName.trim().length > 0
      ? `${displayName.trim()} monitors live market and execution signals for autonomous runs.`
      : "No description yet. Add an agent name to preview this profile."

  useEffect(() => {
    if (!createdAgent || !authenticated || !ready) {
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
  }, [authenticated, createdAgent, getAccessToken, ready])

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

    if (!ready) {
      setErrorMessage("Session is still loading. Wait a second and try again.")
      return
    }

    const accessToken = await getAccessToken()
    if (!accessToken) {
      setErrorMessage("Could not read your Privy access token. Try signing out and back in.")
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const client = createBrowserTRPCClient(() => Promise.resolve(accessToken))
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
    <main className="grid gap-6">
      <section className="card p-6 md:p-8">
        <div className="eyebrow">Developer Console</div>
        <h1 className="mt-3 text-[42px] font-semibold leading-[0.98] tracking-[-0.03em] uppercase">
          Launch Intelligence Agent
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--fg-muted)]">
          Register once on-chain and enter live prediction rounds immediately.
        </p>
      </section>

      <section className="card keeperhub-onboarding-pitch p-6 md:p-8">
        <div className="landing-chip">
          <span className="badge-dot" />
          Step 1 · KeeperHub execution layer
        </div>
        <h2 className="mt-4 h2">Ship agents that execute onchain—with receipts, not hope.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--fg-muted)]">
          Tracer is observability for AI agents;{" "}
          <strong className="text-[var(--fg)]">KeeperHub is the reliability layer</strong> for the
          transactions those agents drive. Wire contract calls and workflow webhooks through
          KeeperHub so every run produces an{" "}
          <code className="mono text-[12px] text-[var(--accent)]">executionId</code>, live status,
          and settlement metadata inside the same trace you use to debug LLM and tool calls.
        </p>
        <div className="keeperhub-onboarding-steps">
          <div className="keeperhub-onboarding-step">
            <div className="keeperhub-onboarding-step-title">Direct contract call</div>
            <p className="keeperhub-onboarding-step-copy">
              From trace detail, trigger{" "}
              <span className="text-[var(--fg)]">Execute reliably via KeeperHub</span> and watch{" "}
              <code className="mono text-[11px]">directContractCall</code> flow into your timeline.
            </p>
          </div>
          <div className="keeperhub-onboarding-step">
            <div className="keeperhub-onboarding-step-title">Workflow webhooks</div>
            <p className="keeperhub-onboarding-step-copy">
              Chain automations with webhook-triggered workflows; failures and retries show up next
              to model steps for a single post-mortem.
            </p>
          </div>
          <div className="keeperhub-onboarding-step">
            <div className="keeperhub-onboarding-step-title">Console scorecard</div>
            <p className="keeperhub-onboarding-step-copy">
              After your first executions, Overview surfaces success rate, retries,
              time-to-finality, and top failure reasons—built from real KeeperHub telemetry.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card p-6">
          <div className="eyebrow mb-1">Step 2 · Register agent</div>
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="eyebrow">Agent Name</span>
              <input
                className="input"
                onChange={(event) => setDisplayName(event.currentTarget.value)}
                placeholder="e.g. QuantBot Alpha"
                value={displayName}
              />
              <span className="text-[11px] text-[var(--fg-faint)] uppercase tracking-[0.08em]">
                Must be unique on-chain
              </span>
            </label>

            <label className="grid gap-2">
              <span className="eyebrow">Chain</span>
              <select
                className="input select"
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

            <div className="card p-4">
              <div className="eyebrow">Registration Bond</div>
              <div className="mt-2 text-[28px] leading-none">
                1 {selectedChain?.nativeCurrency.symbol ?? "ETH"}
              </div>
              <p className="mt-2 text-xs text-[var(--fg-muted)]">Refundable after registration.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn btn-primary"
                disabled={isSubmitting}
                onClick={() => void handleCreateAgent()}
                type="button"
              >
                {isSubmitting ? "Creating..." : "Create Agent"}
              </button>
              <Link className="btn btn-secondary" href="/app">
                Back to Console
              </Link>
            </div>
          </div>
        </div>

        <aside className="card p-6">
          <div className="eyebrow">Preview</div>
          <div className="mt-4">
            <div className="text-[12px] uppercase tracking-[0.1em] text-[var(--fg-faint)]">
              Agent Profile
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{previewName}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
              Custom Strategy
            </div>
          </div>

          <div className="mt-5 card p-4">
            <div className="eyebrow">Model Summary</div>
            <p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">{previewSummary}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="card p-4">
              <div className="eyebrow">Start CredScore</div>
              <div className="mt-2 text-2xl leading-none">0</div>
            </div>
            <div className="card p-4">
              <div className="eyebrow">Total Staked</div>
              <div className="mt-2 text-2xl leading-none">
                0 {selectedChain?.nativeCurrency.symbol ?? "ETH"}
              </div>
            </div>
          </div>

          <div className="mt-4 card p-4">
            <div className="eyebrow">Post-registration routing</div>
            <p className="mt-2 text-xs leading-5 text-[var(--fg-faint)] uppercase tracking-[0.08em]">
              Agent is immediately visible in on-chain registry and eligible for rounds.
            </p>
          </div>
        </aside>
      </section>

      {errorMessage ? (
        <section className="card p-4">
          <div className="eyebrow" style={{ color: "var(--danger)" }}>
            Create Error
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--fg-muted)]">{errorMessage}</p>
        </section>
      ) : null}

      {createdAgent ? (
        <section className="card p-5">
          <div className="eyebrow" style={{ color: "var(--accent)" }}>
            Agent Created
          </div>
          <p className="mt-3 text-sm leading-6">
            {createdAgent.agent.displayName} is ready for installation on{" "}
            {selectedChain?.name ?? "the selected chain"}.
          </p>
          <div className="mt-5 grid gap-3">
            <CredentialRow label="Agent ID" value={createdAgent.agent.id} />
            <CredentialRow label="API Key" value={createdAgent.apiKey} />
            <CredentialRow label="Verify Token" value={createdAgent.verifyToken} />
          </div>
        </section>
      ) : null}

      {createdAgent ? (
        <section className="card p-5">
          <div className="eyebrow">Step 3</div>
          <h2 className="h2 mt-3">Install the SDK.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--fg-muted)]">
            These values are generated for this agent only. Add them to the runtime where the traced
            agent boots. Once traces are ingesting, open any trace and use{" "}
            <span className="text-[var(--fg)]">Execute reliably via KeeperHub</span> to drive the
            execution path judges expect to see end-to-end.
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
        </section>
      ) : null}

      {createdAgent ? (
        <section className="card p-5">
          <div className="eyebrow">Step 4</div>
          <h2 className="h2 mt-3">Wrap your agent.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--fg-muted)]">
            Choose the integration surface your agent already uses, then wrap its model client and
            viem clients with Tracer.
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
                className="btn btn-secondary btn-sm"
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
        </section>
      ) : null}

      {createdAgent ? (
        <section className="card p-5">
          <div className="eyebrow">Step 5</div>
          <h2 className="h2 mt-3">Waiting for first trace.</h2>
          {connectionState?.connected ? (
            <div className="mt-4 grid gap-4">
              <p className="text-sm leading-7 text-[var(--fg-muted)]">
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
                  className="btn btn-secondary w-fit"
                  href={`/app/traces/${connectionState.firstTraceId}`}
                >
                  Open First Trace
                </Link>
              ) : null}
            </div>
          ) : connectionState?.timedOut ? (
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--fg-muted)]">
              No trace arrived within four minutes. Double-check the SDK install, env vars, and
              wrapped clients, then keep the agent running while Tracer waits for the first batch.
            </p>
          ) : (
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--fg-muted)]">
              Polling for the first verified trace now. This screen checks connection status every
              five seconds for up to four minutes.
            </p>
          )}
        </section>
      ) : null}
    </main>
  )
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="eyebrow">{label}</div>
      <code className="mt-2 block break-all text-sm leading-6">{value}</code>
    </div>
  )
}

function SnippetCard({ code, label }: { code: string; label: string }) {
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm leading-7">{code}</pre>
    </div>
  )
}
