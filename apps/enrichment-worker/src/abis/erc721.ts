/**
 * ERC-721 transfers are tracked separately because NFTs share the same Transfer event name as ERC-20.
 * The decoder still provides enough structure for timelines and inspectors to show ownership changes.
 */
export const erc721Abi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: true, name: "tokenId", type: "uint256" },
    ],
  },
] as const
