/**
 * Centralized UI primitives used across dashboard surfaces.
 * Tokens follow the Vercel/Linear-inspired Tracer system in globals.css.
 */
import type { ReactNode } from "react"

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-2">{eyebrow}</div> : null}
        <h1 className="h1">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--fg-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card mb-6">
      {title || description || actions ? (
        <div className="card-header flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <div className="h2">{title}</div> : null}
            {description ? (
              <p className="mt-1 text-[13px] leading-5 text-[var(--fg-muted)]">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  )
}

export function Stat({
  label,
  value,
  meta,
  tone,
}: {
  label: string
  value: string
  meta?: string
  tone?: "default" | "success" | "warning" | "danger"
}) {
  const toneColor =
    tone === "success"
      ? "var(--success)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "danger"
          ? "var(--danger)"
          : "var(--fg)"

  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: toneColor }}>
        {value}
      </div>
      {meta ? <div className="stat-meta">{meta}</div> : null}
    </div>
  )
}

export function Empty({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2 7h12" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </div>
      <div className="font-medium text-[var(--fg)]">{title}</div>
      {description ? (
        <div className="text-[13px] leading-5 text-[var(--fg-muted)] max-w-md">{description}</div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode
  tone?: "default" | "success" | "warning" | "danger" | "info"
}) {
  const cls =
    tone === "success"
      ? "badge badge-success"
      : tone === "warning"
        ? "badge badge-warning"
        : tone === "danger"
          ? "badge badge-danger"
          : tone === "info"
            ? "badge badge-info"
            : "badge"
  return <span className={cls}>{children}</span>
}

/* Backward-compat alias used by existing components until they're refactored individually. */
export function PageSectionHeader(props: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return <PageHeader {...props} />
}

export function SurfaceNotice({
  title,
  description,
  action,
}: {
  title: string
  description: string
  tone?: "muted" | "danger"
  action?: ReactNode
}) {
  return <Empty title={title} description={description} action={action} />
}

export function MetricTile({ label, value }: { label: string; value: string }) {
  return <Stat label={label} value={value} />
}
