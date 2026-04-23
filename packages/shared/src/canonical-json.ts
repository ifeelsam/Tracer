/**
 * Canonical JSON ensures hashing is deterministic across runtimes and object key orders.
 * The implementation keeps array ordering intact while sorting object keys recursively.
 */
function normalizeJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item))
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))

  return Object.fromEntries(
    entries.map(([key, entryValue]) => [key, normalizeJsonValue(entryValue)])
  )
}

export function toCanonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value))
}
