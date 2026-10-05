import { createConfig, http } from "wagmi";
import { optimismSepolia, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

import type { SupportedChainId } from "../features/payment/payment-types";

export const supportedChains = [sepolia, optimismSepolia] as const;

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [injected({ shimDisconnect: true })],
  multiInjectedProviderDiscovery: false,
  ssr: true,
  transports: {
    [sepolia.id]: http(),
    [optimismSepolia.id]: http(),
  },
});

export interface ChainSwitchProvider {
  request(input: {
    method: "wallet_switchEthereumChain";
    params: [{ chainId: `0x${string}` }];
  }): Promise<unknown>;
}

export async function requestWalletChain(
  provider: ChainSwitchProvider,
  chainId: SupportedChainId,
): Promise<void> {
  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: `0x${chainId.toString(16)}` }],
  });
}
