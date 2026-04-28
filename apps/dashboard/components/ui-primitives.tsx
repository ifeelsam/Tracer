import type { ReactNode } from "react"

export function PageSectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="label text-[var(--foreground-muted)]">{eyebrow}</div>
        <h1 className="headline mt-4 text-4xl leading-none md:text-5xl">{title}</h1>
        {description ? (
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function SurfaceNotice({
  title,
  description,
  tone = "muted",
  action,
}: {
  title: string
  description: string
  tone?: "muted" | "danger"
  action?: ReactNode
}) {
  return (
    <div className="frame p-5">
      <div
        className={`label ${tone === "danger" ? "text-[var(--danger)]" : "text-[var(--foreground-muted)]"}`}
      >
        {title}
      </div>
      <p className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="frame p-4">
      <div className="label text-[var(--foreground-muted)]">{label}</div>
      <p className="mt-2 break-words text-sm leading-6">{value}</p>
    </div>
  )
}
