"use client"

/**
 * Agent settings exposes safe, explicit actions like rotating API keys and deleting agents.
 * Destructive operations require deliberate user clicks and surface warnings in-line.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { createBrowserTRPCClient } from "../lib/trpc"
import { usePrivyEnabled } from "./providers"
import { Badge, Empty, PageHeader, Section, SurfaceNotice } from "./ui-primitives"

interface AgentSettings {
  id: string
  displayName: string
  agentWallet: string | null
  chainId: number
  environment: "testnet" | "mainnet"
  privateMode: boolean
  retentionDays: number
  actorRole: "owner" | "collaborator"
  canRotateApiKey: boolean
  canDelete: boolean
}

export function AgentSettingsView({ agentId }: { agentId: string }) {
  const privyEnabled = usePrivyEnabled()
  const { authenticated, getAccessToken, login, ready } = usePrivy()
  const [agent, setAgent] = useState<AgentSettings | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [rotatedApiKey, setRotatedApiKey] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [displayNameInput, setDisplayNameInput] = useState("")
  const [retentionDaysInput, setRetentionDaysInput] = useState(30)
  const [privateModeInput, setPrivateModeInput] = useState(false)
  const [chainIdInput, setChainIdInput] = useState(84532)
  const [environmentInput, setEnvironmentInput] = useState<"testnet" | "mainnet">("testnet")
  const [walletInput, setWalletInput] = useState("")

  const client = useMemo(() => createBrowserTRPCClient(() => getAccessToken()), [getAccessToken])

  useEffect(() => {
    if (!privyEnabled || !authenticated || !ready) {
      return
    }
    let cancelled = false

    async function loadAgent() {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const result = (await client.query("agents.get", agentId)) as AgentSettings | null
        if (!cancelled) {
          setAgent(result)
          if (result) {
            setDisplayNameInput(result.displayName)
            setRetentionDaysInput(result.retentionDays)
            setPrivateModeInput(result.privateMode)
            setChainIdInput(result.chainId)
            setEnvironmentInput(result.environment)
            setWalletInput(result.agentWallet ?? "")
          }
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load agent.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadAgent()
    return () => {
      cancelled = true
    }
  }, [agentId, authenticated, client, privyEnabled, ready])

  if (!privyEnabled) {
    return (
      <SurfaceNotice
        description="Set NEXT_PUBLIC_PRIVY_APP_ID to enable this surface."
        title="Settings"
      />
    )
  }

  if (!ready) {
    return <SurfaceNotice description="Preparing your session…" title="Settings" />
  }

  if (!authenticated) {
    return (
      <SurfaceNotice
        action={
          <button className="nav-chip" onClick={() => login()} type="button">
            Login with Privy
          </button>
        }
        description="Authenticate to manage this agent."
        title="Settings"
      />
    )
  }

  if (isLoading) {
    return <SurfaceNotice description="Loading settings..." title="Settings" />
  }

  if (!agent) {
    return (
      <Section title="Settings">
        <Empty
          title={errorMessage ?? "Agent not found"}
          action={
            <Link className="btn btn-secondary" href="/app/agents">
              Back to agents
            </Link>
          }
        />
      </Section>
    )
  }

  if (deleted) {
    return (
      <Section title="Agent deleted">
        <Empty
          title="The agent and its traces were removed."
          action={
            <Link className="btn btn-secondary" href="/app/agents">
              Back to agents
            </Link>
          }
        />
      </Section>
    )
  }

  return (
    <main className="agent-settings-page">
      <PageHeader
        eyebrow="Settings"
        title={agent.displayName}
        description="Configure behavior, security, and lifecycle controls."
        actions={
          <div className="settings-header-actions">
            <span className="app-user-chip">{`Chain ${agent.chainId} · ${agent.environment}`}</span>
            <Badge tone={agent.actorRole === "owner" ? "info" : "default"}>
              {agent.actorRole === "owner" ? "Owner" : "Collaborator"}
            </Badge>
            <Link className="btn btn-secondary" href={`/app/agents/${agent.id}`}>
              Agent detail
            </Link>
            <Link className="btn btn-secondary" href={`/app/agents/${agent.id}/traces`}>
              View traces
            </Link>
          </div>
        }
      />
      <div className="settings-layout">
        <Section title="Update settings" description="These changes apply immediately after save.">
          <div className="settings-form">
            <label className="settings-field">
              <span className="eyebrow">Display name</span>
              <input
                className="input"
                onChange={(event) => setDisplayNameInput(event.target.value)}
                type="text"
                value={displayNameInput}
              />
            </label>
            <label className="settings-field">
              <span className="eyebrow">Retention days</span>
              <input
                className="input"
                min={1}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10)
                  setRetentionDaysInput(Number.isNaN(parsed) ? retentionDaysInput : parsed)
                }}
                type="number"
                value={retentionDaysInput}
              />
            </label>
            <label className="settings-toggle">
              <input
                checked={privateModeInput}
                onChange={(event) => setPrivateModeInput(event.target.checked)}
                type="checkbox"
              />
              <span>Private mode</span>
            </label>
            {agent.actorRole === "owner" ? (
              <>
                <label className="settings-field">
                  <span className="eyebrow">Chain ID</span>
                  <input
                    className="input"
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10)
                      setChainIdInput(Number.isNaN(parsed) ? chainIdInput : parsed)
                    }}
                    type="number"
                    value={chainIdInput}
                  />
                </label>
                <label className="settings-field">
                  <span className="eyebrow">Environment</span>
                  <select
                    className="input select"
                    onChange={(event) =>
                      setEnvironmentInput(event.target.value as "testnet" | "mainnet")
                    }
                    value={environmentInput}
                  >
                    <option value="testnet">testnet</option>
                    <option value="mainnet">mainnet</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span className="eyebrow">Agent wallet</span>
                  <input
                    className="input"
                    onChange={(event) => setWalletInput(event.target.value)}
                    placeholder="0x..."
                    type="text"
                    value={walletInput}
                  />
                </label>
              </>
            ) : (
              <p className="text-sm leading-7 text-[var(--fg-muted)]">
                Collaborators can update display, retention, and private mode only.
              </p>
            )}
            <div className="surface-action-row">
              <button
                className="btn btn-primary"
                disabled={isSaving}
                onClick={async () => {
                  setErrorMessage(null)
                  setSaveMessage(null)
                  setIsSaving(true)
                  try {
                    const updated = (await client.mutation("agents.update", {
                      id: agent.id,
                      displayName: displayNameInput,
                      retentionDays: retentionDaysInput,
                      privateMode: privateModeInput,
                      ...(agent.actorRole === "owner"
                        ? {
                            chainId: chainIdInput,
                            environment: environmentInput,
                            agentWallet: walletInput.trim().length > 0 ? walletInput.trim() : null,
                          }
                        : {}),
                    })) as AgentSettings | null
                    if (!updated) {
                      setErrorMessage("Failed to update agent settings.")
                      return
                    }
                    setAgent(updated)
                    setSaveMessage("Saved.")
                  } catch (error) {
                    setErrorMessage(
                      error instanceof Error ? error.message : "Failed to save settings."
                    )
                  } finally {
                    setIsSaving(false)
                  }
                }}
                type="button"
              >
                {isSaving ? "Saving…" : "Save settings"}
              </button>
            </div>
            {saveMessage ? (
              <p className="text-sm leading-6 text-[var(--success)]">{saveMessage}</p>
            ) : null}
            {errorMessage ? (
              <p className="text-sm leading-6 text-[var(--danger)]">{errorMessage}</p>
            ) : null}
          </div>
        </Section>

        <aside className="settings-side">
          <Section title="Rotate API key">
            <div className="settings-panel-stack">
              <p className="text-sm leading-7 text-[var(--fg-muted)]">
                Rotating immediately invalidates the previous key. Update your agent secrets right
                away.
              </p>
              <button
                className="btn btn-secondary"
                disabled={!agent.canRotateApiKey}
                onClick={async () => {
                  if (!agent.canRotateApiKey) {
                    return
                  }
                  setErrorMessage(null)
                  setRotatedApiKey(null)
                  try {
                    const result = (await client.mutation("agents.rotateKey", agent.id)) as {
                      apiKey: string
                    }
                    setRotatedApiKey(result.apiKey)
                  } catch (error) {
                    setErrorMessage(
                      error instanceof Error ? error.message : "Failed to rotate key."
                    )
                  }
                }}
                type="button"
              >
                Rotate key
              </button>
            </div>
            {!agent.canRotateApiKey ? (
              <p className="mt-3 text-sm leading-7 text-[var(--fg-muted)]">
                Only owners can rotate API keys.
              </p>
            ) : null}
            {rotatedApiKey ? (
              <div className="json-viewer mt-5">
                <div className="json-viewer-header">
                  <span className="eyebrow">New API key</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => void navigator.clipboard?.writeText(rotatedApiKey)}
                    type="button"
                  >
                    Copy
                  </button>
                </div>
                <pre className="json-viewer-body mono whitespace-pre-wrap">{rotatedApiKey}</pre>
              </div>
            ) : null}
          </Section>

          <Section title="Danger zone">
            <p className="text-sm leading-7 text-[var(--fg-muted)]">
              Deleting an agent also deletes its traces, events, and analysis records.
            </p>
            <button
              className="btn btn-danger mt-5"
              disabled={!agent.canDelete}
              onClick={async () => {
                if (!agent.canDelete) {
                  return
                }
                const confirmed = window.confirm("Delete this agent and all traces?")
                if (!confirmed) {
                  return
                }

                setErrorMessage(null)
                try {
                  const result = (await client.mutation("agents.delete", agent.id)) as {
                    deleted: boolean
                  }
                  setDeleted(result.deleted)
                } catch (error) {
                  setErrorMessage(
                    error instanceof Error ? error.message : "Failed to delete agent."
                  )
                }
              }}
              type="button"
            >
              Delete agent
            </button>
            {!agent.canDelete ? (
              <p className="mt-3 text-sm leading-7 text-[var(--fg-muted)]">
                Only owners can delete this agent.
              </p>
            ) : null}
            {errorMessage ? (
              <p className="mt-4 text-sm leading-6 text-[var(--danger)]">{errorMessage}</p>
            ) : null}
          </Section>
        </aside>
      </div>
    </main>
  )
}
