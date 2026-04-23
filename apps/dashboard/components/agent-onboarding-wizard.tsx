"use client"

import { usePrivy } from "@privy-io/react-auth"
/**
 * The onboarding wizard guides operators from agent creation into installation without losing context.
 * It keeps the first step transactional and explicit so credentials are only revealed after a successful create.
 */
import type { TracerChain } from "@tracerlabs/shared"
import Link from "next/link"
import { useMemo, useState } from "react"

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

  const selectedChain = useMemo(
    () => chains.find((chain) => chain.id === selectedChainId) ?? chains[0] ?? null,
    [chains, selectedChainId]
  )

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
                  color: index === 0 ? "var(--accent)" : "var(--surface-line)",
                }}
              >
                {index === 0 ? "Active" : createdAgent ? "Ready" : "Queued"}
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
