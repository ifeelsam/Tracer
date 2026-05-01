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
import { PageHeader } from "./ui-primitives"

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
      <div className="page-stack">
        <PageHeader
          title="Register agent"
          description="Add NEXT_PUBLIC_PRIVY_APP_ID to apps/dashboard/.env.local, then restart the dev server."
        />
        <section className="card p-7 md:p-9">
          <div className="label mb-6">Supported chains (registry)</div>
          <div className="flex flex-wrap gap-2">
            {chains.map((chain) => (
              <ChainBadge key={chain.id} chain={chain} />
            ))}
          </div>
        </section>
      </div>
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
  const previewName = displayName.trim().length > 0 ? displayName.trim() : "—"

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
    <main className="page-stack">
      <PageHeader
        title="Register agent"
        description="Pick a name and chain, then install credentials in your runtime."
        actions={
          <Link className="btn btn-secondary" href="/app/agents">
            Back to agents
          </Link>
        }
      />

      <section className="grid gap-8 lg:grid-cols-[1.12fr_0.88fr] lg:gap-10">
        <div className="card p-7 md:p-9">
          <div className="eyebrow mb-5">01 · Agent</div>
          <div className="grid gap-6">
            <label className="grid gap-2.5">
              <span className="label">Display name</span>
              <input
                className="input"
                onChange={(event) => setDisplayName(event.currentTarget.value)}
                placeholder="e.g. quantbot.alpha"
                value={displayName}
              />
              <span className="mono text-[11px] text-[var(--ink-500)]">Unique in the registry</span>
            </label>

            <label className="grid gap-2.5">
              <span className="label">Chain</span>
              <select
                className="input select"
                onChange={(event) => {
                  setSelectedChainId(Number.parseInt(event.currentTarget.value, 10))
                }}
                value={selectedChain?.id ?? ""}
              >
                {chains.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name} {chain.isTestnet ? "· testnet" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="card p-5">
              <div className="label">Registration bond</div>
              <div className="mono mt-3 text-[22px] leading-none text-[var(--ink-900)]">
                1 {selectedChain?.nativeCurrency.symbol ?? "ETH"}
              </div>
              <p className="mt-2 text-[12px] leading-5 text-[var(--ink-500)]">
                Refundable after registration.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                className="btn btn-primary"
                disabled={isSubmitting}
                onClick={() => void handleCreateAgent()}
                type="button"
              >
                {isSubmitting ? "Creating…" : "Create agent"}
              </button>
            </div>
          </div>
        </div>

        <aside className="card flex flex-col p-7 md:p-9">
          <div className="label">Preview</div>
          <div className="mt-6 min-h-[120px] flex flex-col justify-center">
            <div className="text-[22px] font-medium tracking-[-0.02em] text-[var(--ink-900)]">
              {previewName}
            </div>
            {selectedChain ? (
              <p className="mono mt-4 text-[12px] leading-relaxed text-[var(--ink-500)]">
                {selectedChain.name} · chainId {selectedChain.id}
              </p>
            ) : null}
          </div>
        </aside>
      </section>

      {errorMessage ? (
        <section className="card p-6 md:p-7">
          <div className="label" style={{ color: "var(--bear)" }}>
            Error
          </div>
          <p className="mt-3 text-[14px] leading-6 text-[var(--ink-700)]">{errorMessage}</p>
        </section>
      ) : null}

      {createdAgent ? (
        <section className="card p-7 md:p-9">
          <div className="eyebrow mb-5">Credentials</div>
          <div className="grid gap-4 md:gap-5">
            <CredentialRow label="Agent ID" value={createdAgent.agent.id} />
            <CredentialRow label="API key" value={createdAgent.apiKey} />
            <CredentialRow label="Verify token" value={createdAgent.verifyToken} />
          </div>
        </section>
      ) : null}

      {createdAgent ? (
        <section className="card p-7 md:p-9">
          <div className="eyebrow mb-4">02 · Install</div>
          <p className="mb-6 max-w-2xl text-[14px] leading-6 text-[var(--ink-700)]">
            Add the package and environment variables to the process that runs your agent.
          </p>
          <div className="grid gap-5">
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
        <section className="card p-7 md:p-9">
          <div className="eyebrow mb-4">03 · Integrate</div>
          <p className="mb-6 max-w-2xl text-[14px] leading-6 text-[var(--ink-700)]">
            Pick your stack and wrap the model plus viem clients.
          </p>
          <div className="mt-1 flex flex-wrap gap-2.5">
            {[
              ["openai", "OpenAI"],
              ["anthropic", "Anthropic"],
              ["vercel-ai", "Vercel AI SDK"],
              ["langchain", "LangChain"],
            ].map(([tab, label]) => (
              <button
                key={tab}
                className="chip"
                data-active={activeTab === tab ? "true" : undefined}
                onClick={() => setActiveTab(tab as IntegrationTab)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-7 grid gap-5">
            <SnippetCard code={integrationSnippets[activeTab]} label="Model" />
            <SnippetCard code={evmSnippet} label="viem" />
            <SnippetCard code={assistantPrompt} label="System prompt" />
          </div>
        </section>
      ) : null}

      {createdAgent ? (
        <section className="card p-7 md:p-9">
          <div className="eyebrow mb-4">04 · First trace</div>
          {connectionState?.connected ? (
            <div className="mt-2 grid gap-5">
              <p className="text-[14px] leading-6 text-[var(--ink-700)]">First trace received.</p>
              <div className="grid gap-4 md:grid-cols-2">
                <CredentialRow
                  label="Verified"
                  value={connectionState.verified ? "true" : "false"}
                />
                <CredentialRow
                  label="First seen"
                  value={connectionState.firstSeenAt ?? "unknown"}
                />
              </div>
              {connectionState.firstTraceId ? (
                <Link
                  className="btn btn-secondary w-fit"
                  href={`/app/traces/${connectionState.firstTraceId}`}
                >
                  Open trace
                </Link>
              ) : null}
            </div>
          ) : connectionState?.timedOut ? (
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--ink-700)]">
              No trace in four minutes. Check env vars, wrapped clients, and that the agent is
              running.
            </p>
          ) : (
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--ink-700)]">
              Polling every 5s (up to 4 minutes).
            </p>
          )}
        </section>
      ) : null}
    </main>
  )
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--ink-100)] p-4 md:p-5">
      <div className="label">{label}</div>
      <code className="mono mt-3 block break-all text-[13px] leading-6 text-[var(--ink-900)]">
        {value}
      </code>
    </div>
  )
}

function SnippetCard({ code, label }: { code: string; label: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--ink-100)] p-5">
      <div className="label">{label}</div>
      <pre className="mono mt-4 overflow-x-auto whitespace-pre-wrap text-[12px] leading-[1.65] text-[var(--ink-700)]">
        {code}
      </pre>
    </div>
  )
}
