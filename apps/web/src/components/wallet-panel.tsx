"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useState, type ReactNode } from "react";
import {
  WagmiProvider,
  useAccount,
  useConnect,
  useConnectors,
  useDisconnect,
} from "wagmi";

import { wagmiConfig } from "../lib/wagmi";

export function Web3Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

function shortAddress(address: `0x${string}`): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function chainLabel(chainId: number | undefined): string {
  if (chainId === 11155111) return "Ethereum Sepolia";
  if (chainId === 11155420) return "OP Sepolia";
  return chainId ? `Rede não suportada (${chainId})` : "Rede não detectada";
}

export function WalletPanel() {
  const account = useAccount();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const connector = connectors[0];

  if (!account.isConnected || !account.address) {
    return (
      <div className="network-summary" aria-label="Estado da carteira">
        <span className="network-dot" aria-hidden="true" />
        <span>
          <small>Carteira</small>
          {connect.isPending ? "Conectando…" : "Não conectada"}
        </span>
        <button
          type="button"
          disabled={!connector || connect.isPending}
          onClick={() => connector && connect.mutate({ connector })}
        >
          Conectar carteira
        </button>
        {connect.error ? <span role="alert">{connect.error.message}</span> : null}
      </div>
    );
  }

  return (
    <div className="network-summary" aria-label="Estado da carteira">
      <span className="network-dot" aria-hidden="true" />
      <span title={account.address}>
        <small>{chainLabel(account.chainId)}</small>
        {shortAddress(account.address)}
      </span>
      <button type="button" onClick={() => disconnect.mutate()}>
        Desconectar
      </button>
    </div>
  );
}
