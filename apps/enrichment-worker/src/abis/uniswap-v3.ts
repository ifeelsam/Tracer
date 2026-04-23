/**
 * Uniswap v3 pool events help explain swaps and liquidity changes that an agent triggered.
 * The registry is intentionally narrow to the events most useful for debugging route behavior.
 */
export const uniswapV3Abi = [
  {
    type: "event",
    name: "Swap",
    inputs: [
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "recipient", type: "address" },
      { indexed: false, name: "amount0", type: "int256" },
      { indexed: false, name: "amount1", type: "int256" },
      { indexed: false, name: "sqrtPriceX96", type: "uint160" },
      { indexed: false, name: "liquidity", type: "uint128" },
      { indexed: false, name: "tick", type: "int24" },
    ],
  },
  {
    type: "event",
    name: "Mint",
    inputs: [
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "tickLower", type: "int24" },
      { indexed: false, name: "tickUpper", type: "int24" },
      { indexed: false, name: "amount", type: "uint128" },
      { indexed: false, name: "amount0", type: "uint256" },
      { indexed: false, name: "amount1", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Burn",
    inputs: [
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "tickLower", type: "int24" },
      { indexed: false, name: "tickUpper", type: "int24" },
      { indexed: false, name: "amount", type: "uint128" },
      { indexed: false, name: "amount0", type: "uint256" },
      { indexed: false, name: "amount1", type: "uint256" },
    ],
  },
] as const
