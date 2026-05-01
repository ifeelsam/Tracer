/**
 * Tracer mark — a literal trace through three nodes on a 24-unit grid.
 * The middle node is the focal anomaly: a filled core inside an outlined ring.
 * Construction matches /design/design.md §2.
 */

interface TracerGlyphProps {
  size?: number
  className?: string
  title?: string
}

export function TracerGlyph({ size = 22, className, title }: TracerGlyphProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title ? <title>{title}</title> : null}
      <path d="M2 17 L7 14 L11 6 L15 11 L22 7" strokeWidth="1.6" />
      <circle cx="7" cy="14" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="6" r="4.5" strokeWidth="1" />
      <circle cx="11" cy="6" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}
