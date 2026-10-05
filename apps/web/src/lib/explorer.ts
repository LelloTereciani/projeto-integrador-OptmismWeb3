import type { Hash } from "viem";

import type { SupportedChainId } from "../features/payment/payment-types";

const EXPLORER_BY_CHAIN: Record<SupportedChainId, string> = {
  11155111: "https://sepolia.etherscan.io",
  11155420: "https://optimism-sepolia.blockscout.com",
};

export function transactionExplorerUrl(chainId: SupportedChainId, hash: Hash): string {
  return `${EXPLORER_BY_CHAIN[chainId]}/tx/${hash}`;
}

export function addressExplorerUrl(chainId: SupportedChainId, address: `0x${string}`): string {
  return `${EXPLORER_BY_CHAIN[chainId]}/address/${address}`;
}
