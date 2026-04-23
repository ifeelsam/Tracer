/**
 * The verify router exposes public proof data for shared traces without requiring authentication.
 * It reconstructs the anchored Merkle root from transaction calldata and checks the stored proof.
 */
import { prisma } from "@tracerlabs/db"
import { type MerkleProofStep, getChain, verifyMerkleProof } from "@tracerlabs/shared"
import { decodeAbiParameters } from "viem"
import { z } from "zod"

import { getPublicClient } from "../../lib/chains"
import { publicProcedure, router } from "../trpc"

function getAnchorChainId(): number {
  return Number.parseInt(process.env.ANCHOR_CHAIN_ID ?? "84532", 10)
}

function parseMerkleProof(value: string | null): MerkleProofStep[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as MerkleProofStep[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function getMerkleRoot(anchorTxHash: string | null): Promise<string | null> {
  if (!anchorTxHash) {
    return null
  }

  try {
    const client = getPublicClient(getAnchorChainId())
    const transaction = await client.getTransaction({
      hash: anchorTxHash as `0x${string}`,
    })
    const decoded = decodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint32" }, { type: "string" }],
      transaction.input
    )
    return typeof decoded[0] === "string" ? decoded[0] : null
  } catch {
    return null
  }
}

export const verifyRouter = router({
  byShareToken: publicProcedure.input(z.string()).query(async ({ input }) => {
    const trace = await prisma.trace.findUnique({
      where: {
        shareToken: input,
      },
      include: {
        events: {
          orderBy: {
            sequence: "asc",
          },
        },
        analysis: true,
      },
    })

    if (!trace) {
      return null
    }

    const anchorChain = getChain(getAnchorChainId())
    const merkleRoot = await getMerkleRoot(trace.anchorTxHash)
    const merkleProof = parseMerkleProof(trace.merkleProof)
    const verified =
      !!trace.traceHash &&
      !!merkleRoot &&
      merkleProof.length > 0 &&
      verifyMerkleProof(trace.traceHash, merkleProof, merkleRoot)

    return {
      trace,
      events: trace.events,
      analysis: trace.analysis,
      verification: {
        traceHash: trace.traceHash,
        anchorTxHash: trace.anchorTxHash,
        anchorBlock: trace.anchorBlock,
        chainId: anchorChain.id,
        blockExplorerUrl: anchorChain.blockExplorerUrl,
        merkleRoot,
        merkleProof,
        verified,
      },
    }
  }),
})
