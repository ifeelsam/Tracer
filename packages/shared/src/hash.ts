/**
 * These helpers wrap SHA-256 hashing so callers can work with stable hex or raw byte outputs.
 * Keeping the API tiny makes it easy to reuse from the SDK, workers, and verification flows.
 */
import { createHash } from "node:crypto"

export function sha256Bytes(input: string | Uint8Array): Uint8Array {
  const hash = createHash("sha256")
  hash.update(input)
  return new Uint8Array(hash.digest())
}

export function sha256Hex(input: string | Uint8Array): string {
  return Buffer.from(sha256Bytes(input)).toString("hex")
}
