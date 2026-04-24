/**
 * The KeeperHub router exposes authenticated endpoints for triggering KeeperHub execution
 * and retrieving status so the dashboard and demos can show reliable execution lifecycles.
 */
import { z } from "zod"

import {
  type KeeperHubDirectContractCallRequest,
  keeperHubDirectContractCall,
  keeperHubGetDirectExecutionStatus,
} from "../../lib/keeperhub"
import { protectedProcedure, router } from "../trpc"

const networkSchema = z.string().min(1)

export const keeperHubRouter = router({
  directContractCall: protectedProcedure
    .input(
      z.object({
        network: networkSchema,
        contractAddress: z.string().min(1),
        functionName: z.string().min(1),
        functionArgs: z.array(z.unknown()).optional(),
        abi: z.array(z.unknown()).optional(),
        valueWei: z.string().optional(),
        gasLimitMultiplier: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const body: KeeperHubDirectContractCallRequest = {
        network: input.network,
        contractAddress: input.contractAddress,
        functionName: input.functionName,
      }

      if (input.functionArgs) {
        body.functionArgs = JSON.stringify(input.functionArgs)
      }
      if (input.abi) {
        body.abi = JSON.stringify(input.abi)
      }
      if (input.valueWei) {
        body.value = input.valueWei
      }
      if (input.gasLimitMultiplier) {
        body.gasLimitMultiplier = input.gasLimitMultiplier
      }

      return keeperHubDirectContractCall(body)
    }),

  directExecutionStatus: protectedProcedure
    .input(z.object({ executionId: z.string().min(1) }))
    .query(async ({ input }) => {
      return keeperHubGetDirectExecutionStatus(input.executionId)
    }),
})
