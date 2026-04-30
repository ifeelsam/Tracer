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
import { Badge, KeyValue, KeyValueGrid, PageHeader, Section } from "./ui-primitives"

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
type WizardStage = "register" | "install" | "wrap" | "trace"

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
      <main className="agent-onboarding-page">
        <PageHeader
          eyebrow="Register agent"
          title="New agent"
          description="Enable Privy to create agents from this console."
        />
        <Section title="Authentication required">
          <p className="text-sm leading-7 text-[var(--fg-muted)]">
            Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> and restart dashboard.
          </p>
        </Section>
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

  const wizardStage: WizardStage = !createdAgent
    ? "register"
    : connectionState?.connected
      ? "trace"
      : activeTab === "openai"
        ? "install"
        : "wrap"

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
    <main className="agent-onboarding-page">
      <PageHeader
        eyebrow="Register agent"
        title="New agent"
        actions={
          <Link className="btn btn-secondary" href="/app">
            Back to console
          </Link>
        }
      />

      <WizardSteps stage={wizardStage} />

      <section className="onboarding-main-grid">
        <Section title="Details" description="One-time setup. Takes about 30 seconds.">
          <div className="onboarding-details-stack">
            <label className="onboarding-field">
              <span className="eyebrow">Agent name</span>
              <input
                className="input"
                onChange={(event) => setDisplayName(event.currentTarget.value)}
                placeholder="e.g. QuantBot Alpha"
                value={displayName}
              />
            </label>

            <label className="onboarding-field">
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

            <div className="card register-bond-card p-5">
              <div className="eyebrow">Registration bond</div>
              <div className="mt-2 text-2xl leading-none">
                1 {selectedChain?.nativeCurrency.symbol ?? "ETH"}
              </div>
              <p className="mt-2 text-xs text-[var(--fg-muted)]">Refundable after registration.</p>
            </div>

            <div className="surface-action-row onboarding-actions">
              <button
                className="btn btn-primary"
                disabled={isSubmitting}
                onClick={() => void handleCreateAgent()}
                type="button"
              >
                {isSubmitting ? "Creating..." : "Create agent"}
              </button>
              <Link className="btn btn-secondary" href="/app">
                Cancel
              </Link>
            </div>
          </div>
        </Section>

        <Section title="Preview">
          <KeyValueGrid>
            <KeyValue label="Name" value={previewName} />
            <KeyValue label="Chain" value={selectedChain?.name ?? "n/a"} />
            <KeyValue
              label="Environment"
              value={selectedChain?.isTestnet ? "testnet" : "mainnet"}
            />
            <KeyValue label="Bond" value={`1 ${selectedChain?.nativeCurrency.symbol ?? "ETH"}`} />
            <KeyValue label="Status" value={createdAgent ? "created" : "draft"} />
          </KeyValueGrid>
        </Section>
      </section>

      {errorMessage ? (
        <Section title="Create error">
          <p className="text-sm leading-6 text-[var(--danger)]">{errorMessage}</p>
        </Section>
      ) : null}

      {createdAgent ? (
        <Section title="Credentials" description="Generated for this agent only.">
          <div className="grid gap-7">
            <KeyValueGrid>
              <KeyValue label="Agent ID" value={createdAgent.agent.id} mono />
              <KeyValue label="API key" value={createdAgent.apiKey} mono />
              <KeyValue label="Verify token" value={createdAgent.verifyToken} mono />
              <KeyValue label="Chain ID" value={`${installChainId}`} mono />
            </KeyValueGrid>
            <SnippetCard
              label="Environment"
              code={[
                `TRACER_API_KEY=${createdAgent.apiKey}`,
                `TRACER_AGENT_ID=${createdAgent.agent.id}`,
                `TRACER_VERIFY_TOKEN=${createdAgent.verifyToken}`,
                `TRACER_CHAIN_ID=${installChainId}`,
              ].join("\n")}
            />
          </div>
        </Section>
      ) : null}

      {createdAgent ? (
        <Section title="Install" description="Add SDK and wrap your existing model/runtime.">
          <div className="grid gap-7">
            <SnippetCard code="npm install @tracerlabs/sdk" label="Package" />

            <div className="tab-strip">
              {[
                ["openai", "OpenAI"],
                ["anthropic", "Anthropic"],
                ["vercel-ai", "Vercel AI"],
                ["langchain", "LangChain"],
              ].map(([tab, label]) => (
                <button
                  key={tab}
                  className={`tab-strip-item ${activeTab === tab ? "is-active" : ""}`}
                  onClick={() => setActiveTab(tab as IntegrationTab)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            <SnippetCard code={integrationSnippets[activeTab]} label="Model integration" />
            <SnippetCard code={evmSnippet} label="EVM clients" />
            <SnippetCard code={assistantPrompt} label="Assistant prompt" />
          </div>
        </Section>
      ) : null}

      {createdAgent ? (
        <Section title="First trace">
          <div className="grid gap-6">
            {connectionState?.connected ? (
              <>
                <Badge tone="success">Connected</Badge>
                <p className="text-sm leading-6 text-[var(--fg-muted)]">
                  First trace ingested. Agent connection is active.
                </p>
              </>
            ) : connectionState?.timedOut ? (
              <>
                <Badge tone="danger">Timed out</Badge>
                <p className="text-sm leading-6 text-[var(--fg-muted)]">
                  No trace arrived in time. Recheck env vars and wrapped clients.
                </p>
              </>
            ) : (
              <>
                <Badge tone="warning">Waiting</Badge>
                <p className="text-sm leading-6 text-[var(--fg-muted)]">
                  Polling every few seconds for the first trace.
                </p>
              </>
            )}

            {connectionState?.firstTraceId ? (
              <Link
                className="btn btn-primary w-fit"
                href={`/app/traces/${connectionState.firstTraceId}`}
              >
                Open first trace
              </Link>
            ) : null}
          </div>
        </Section>
      ) : null}
    </main>
  )
}

function WizardSteps({ stage }: { stage: WizardStage }) {
  const steps: Array<{ id: WizardStage; label: string }> = [
    { id: "register", label: "Register" },
    { id: "install", label: "Install" },
    { id: "wrap", label: "Wrap" },
    { id: "trace", label: "First trace" },
  ]

  return (
    <ol className="wizard-steps">
      {steps.map((step, index) => (
        <li key={step.id} className={`wizard-step ${stage === step.id ? "is-active" : ""}`}>
          <span className="wizard-step-index">{String(index + 1).padStart(2, "0")}</span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  )
}

function SnippetCard({ code, label }: { code: string; label: string }) {
  return (
    <div className="json-viewer">
      <div className="json-viewer-header">
        <span className="eyebrow">{label}</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => void navigator.clipboard?.writeText(code)}
          type="button"
        >
          Copy
        </button>
      </div>
      <pre className="json-viewer-body whitespace-pre-wrap">{code}</pre>
    </div>
  )
}

function usePrivyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID !== undefined
}
