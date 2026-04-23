/**
 * These Merkle helpers build deterministic trees from precomputed SHA-256 leaf hashes.
 * Proofs preserve sibling position so any anchored trace can be verified independently.
 */
import { sha256Bytes, sha256Hex } from "./hash"

export interface MerkleProofStep {
  position: "left" | "right"
  hash: string
}

export interface MerkleTree {
  root: string
  layers: string[][]
  proofs: Record<number, MerkleProofStep[]>
}

function normalizeHash(hash: string): string {
  const normalized = hash.startsWith("0x") ? hash.slice(2) : hash
  if (normalized.length !== 64) {
    throw new Error(`Invalid SHA-256 hash length: ${hash}`)
  }

  return normalized.toLowerCase()
}

function combineHashes(left: string, right: string): string {
  const leftBytes = Buffer.from(normalizeHash(left), "hex")
  const rightBytes = Buffer.from(normalizeHash(right), "hex")
  return sha256Hex(Buffer.concat([leftBytes, rightBytes]))
}

export function buildMerkleTree(leaves: string[]): MerkleTree {
  if (leaves.length === 0) {
    throw new Error("Cannot build a Merkle tree without leaves")
  }

  const normalizedLeaves = leaves.map((leaf) => normalizeHash(leaf))
  const layers: string[][] = [normalizedLeaves]
  let currentLayer = normalizedLeaves

  while (currentLayer.length > 1) {
    const nextLayer: string[] = []
    for (let index = 0; index < currentLayer.length; index += 2) {
      const left = currentLayer[index]
      if (!left) {
        throw new Error("Missing left Merkle node")
      }

      const right = currentLayer[index + 1] ?? left
      nextLayer.push(combineHashes(left, right))
    }

    layers.push(nextLayer)
    currentLayer = nextLayer
  }

  const proofs = Object.fromEntries(
    normalizedLeaves.map((_, leafIndex) => [leafIndex, getMerkleProof(layers, leafIndex)])
  )
  const root = currentLayer[0] ?? normalizedLeaves[0]
  if (!root) {
    throw new Error("Missing Merkle root")
  }

  return {
    root,
    layers,
    proofs,
  }
}

export function getMerkleProof(layers: string[][], leafIndex: number): MerkleProofStep[] {
  const proof: MerkleProofStep[] = []
  let index = leafIndex

  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
    const layer = layers[layerIndex]
    if (!layer) {
      throw new Error("Missing Merkle layer")
    }

    const isRightNode = index % 2 === 1
    const siblingIndex = isRightNode ? index - 1 : index + 1
    const currentHash = layer[index]
    if (!currentHash) {
      throw new Error("Missing Merkle leaf for proof")
    }

    const siblingHash = layer[siblingIndex] ?? currentHash

    proof.push({
      position: isRightNode ? "left" : "right",
      hash: siblingHash,
    })

    index = Math.floor(index / 2)
  }

  return proof
}

export function verifyMerkleProof(
  leafHash: string,
  proof: MerkleProofStep[],
  rootHash: string
): boolean {
  let computedHash = normalizeHash(leafHash)

  for (const step of proof) {
    computedHash =
      step.position === "left"
        ? combineHashes(step.hash, computedHash)
        : combineHashes(computedHash, step.hash)
  }

  return computedHash === normalizeHash(rootHash)
}

export function hashMerkleLeaf(value: string): string {
  return sha256Hex(value)
}

export function hashMerkleLeafBytes(value: Uint8Array): string {
  return Buffer.from(sha256Bytes(value)).toString("hex")
}
