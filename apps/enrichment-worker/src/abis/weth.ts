/**
 * WETH-specific deposit and withdrawal events make ETH wrapping flows understandable in traces.
 * They complement generic transfer decoding with the ETH-native semantics users expect.
 */
export const wethAbi = [
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { indexed: true, name: "dst", type: "address" },
      { indexed: false, name: "wad", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Withdrawal",
    inputs: [
      { indexed: true, name: "src", type: "address" },
      { indexed: false, name: "wad", type: "uint256" },
    ],
  },
] as const
