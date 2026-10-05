"use client";

import React from "react";
import type { PaymentScenario } from "../../../../packages/shared/src/payment";
import {
  L1_DEPOSIT_AMOUNT_WEI,
  type PaymentContracts,
} from "../lib/contracts";
import { transactionExplorerUrl } from "../lib/explorer";
import type {
  PaymentAction,
  SupportedChainId,
  WalletActionState,
} from "../features/payment/payment-types";
import { formatAtomicMockUsd } from "../features/payment/ui-model";

interface TransactionActionProps {
  action: PaymentAction;
  actionState: WalletActionState;
  activeChainId?: number;
  contracts: PaymentContracts | null;
  scenario: PaymentScenario;
  onSubmit(): void;
  onSwitchChain(chainId: SupportedChainId): void;
}

const BUSY_STATES = new Set<WalletActionState["status"]>([
  "simulating",
  "signature-pending",
  "submitted",
  "confirming",
  "verifying",
]);

function chainName(chainId: SupportedChainId): string {
  return chainId === 11155111 ? "Ethereum Sepolia" : "OP Sepolia";
}

function exactEthAmount(): string {
  const integer = L1_DEPOSIT_AMOUNT_WEI / 1_000_000_000_000_000_000n;
  const fraction = (L1_DEPOSIT_AMOUNT_WEI % 1_000_000_000_000_000_000n)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");
  return `${integer}.${fraction || "0"} ETH de teste`;
}

function reviewRows(
  action: PaymentAction,
  scenario: PaymentScenario,
  contracts: PaymentContracts,
): Array<{ label: string; value: string }> {
  const network = action.requiredChainId
    ? `${chainName(action.requiredChainId)} (chain ID ${action.requiredChainId})`
    : "Aplicação local";

  switch (action.type) {
    case "deposit-l1":
      return [
        { label: "Rede", value: network },
        { label: "Bridge", value: contracts.l1StandardBridge },
        { label: "Carteira de destino", value: scenario.payer },
        { label: "Valor exato", value: exactEthAmount() },
      ];
    case "create-payment":
      return [
        { label: "Rede", value: network },
        { label: "Contrato", value: contracts.paymentRegistry },
        { label: "Pagador", value: scenario.payer },
        { label: "Beneficiário", value: scenario.beneficiary },
        { label: "Valor exato", value: `${formatAtomicMockUsd(scenario.quote.mockUsdAmount)} MockUSD de teste` },
      ];
    case "approve-payment":
      return [
        { label: "Rede", value: network },
        { label: "Contrato", value: contracts.paymentRegistry },
        { label: "Pagador", value: scenario.payer },
        { label: "Operação", value: scenario.paymentId },
      ];
    case "approve-token":
      return [
        { label: "Rede", value: network },
        { label: "Token", value: contracts.mockUsd },
        { label: "Pagador", value: scenario.payer },
        { label: "Spender PaymentRegistry", value: contracts.paymentRegistry },
        { label: "Valor exato", value: `${formatAtomicMockUsd(scenario.quote.mockUsdAmount)} MockUSD de teste` },
      ];
    case "settle-payment":
      return [
        { label: "Rede", value: network },
        { label: "Contrato", value: contracts.paymentRegistry },
        { label: "Pagador", value: scenario.payer },
        { label: "Beneficiário", value: scenario.beneficiary },
        { label: "Valor exato", value: `${formatAtomicMockUsd(scenario.quote.mockUsdAmount)} MockUSD de teste` },
      ];
    default:
      return [{ label: "Verificação", value: action.reason }];
  }
}

function statusMessage(state: WalletActionState): string | null {
  switch (state.status) {
    case "simulating": return "Simulando a solicitação exata antes de abrir a carteira.";
    case "signature-pending": return "Revise e confirme a solicitação na carteira.";
    case "submitted": return "Transação enviada. O hash ainda não representa sucesso.";
    case "confirming": return "Aguardando o recibo da rede.";
    case "verifying": return "O servidor está validando recibo, contrato, evento e valores.";
    case "confirmed": return "Confirmação verificada pelo recibo e pelo servidor.";
    case "server-pending": return "O recibo ainda está pendente na verificação do servidor.";
    case "rejected": return state.error ?? "A solicitação foi rejeitada na carteira.";
    case "reverted": return state.error ?? "A transação foi revertida.";
    case "replaced": return state.error ?? "A transação foi substituída.";
    case "invalidated": return state.error ?? "Conta, rede ou dados mudaram. Revise novamente.";
    case "insufficient-funds": return state.error ?? "Saldo insuficiente de ETH de teste.";
    case "unavailable": return state.error ?? "Carteira ou RPC indisponível.";
    case "configuration-error": return state.error ?? "Contratos testnet não configurados.";
    case "duplicate": return state.error ?? "Esta ação já está em andamento.";
    default: return null;
  }
}

export function TransactionAction({
  action,
  actionState,
  activeChainId,
  contracts,
  scenario,
  onSubmit,
  onSwitchChain,
}: TransactionActionProps) {
  const requiredChainId = action.requiredChainId;
  const readOnlyAction = ["refresh-deposit", "refresh-transaction", "refresh-settlement", "simulate-payout"].includes(action.type);
  const wrongNetwork = !readOnlyAction && requiredChainId !== undefined && activeChainId !== requiredChainId;
  const busy = BUSY_STATES.has(actionState.status);
  const message = statusMessage(actionState);
  const isError = [
    "rejected",
    "reverted",
    "replaced",
    "invalidated",
    "insufficient-funds",
    "unavailable",
    "configuration-error",
    "duplicate",
  ].includes(actionState.status);

  return (
    <section className="action-preview" aria-labelledby="wallet-action-heading">
      <div>
        <span className="eyebrow">Próxima ação explícita</span>
        <h2 id="wallet-action-heading">{action.label}</h2>
        <p>{action.reason}</p>
      </div>

      {contracts ? (
        <dl className="confirmation-summary transaction-review">
          {reviewRows(action, scenario, contracts).map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p role="alert">Os endereços de MockUSD e PaymentRegistry ainda não estão configurados.</p>
      )}

      {wrongNetwork && requiredChainId ? (
        <button
          className="button button-secondary"
          type="button"
          onClick={() => onSwitchChain(requiredChainId)}
        >
          Trocar para {chainName(requiredChainId)}
        </button>
      ) : (
        <button
          className="button button-secondary"
          type="button"
          disabled={!action.enabled || !contracts || busy}
          onClick={onSubmit}
        >
          {actionState.status === "submitted"
            ? "Transação enviada"
            : busy
              ? "Ação em andamento"
              : action.type === "refresh-deposit"
                ? "Verificar crédito sem abrir a carteira"
                : action.type === "refresh-transaction" || action.type === "refresh-settlement"
                  ? "Atualizar confirmação sem abrir a carteira"
                  : action.type === "simulate-payout"
                    ? "Exibir resultado simulado"
                    : "Revisar e abrir a carteira"}
        </button>
      )}

      {message ? <p role={isError ? "alert" : "status"}>{message}</p> : null}
      {actionState.hash && requiredChainId ? (
        <p>
          Hash original: <a href={transactionExplorerUrl(requiredChainId, actionState.hash)} target="_blank" rel="noreferrer">{actionState.hash}</a>
        </p>
      ) : null}
      {actionState.replacementHash && requiredChainId ? (
        <p>
          Hash substituto: <a href={transactionExplorerUrl(requiredChainId, actionState.replacementHash)} target="_blank" rel="noreferrer">{actionState.replacementHash}</a>
        </p>
      ) : null}
    </section>
  );
}
