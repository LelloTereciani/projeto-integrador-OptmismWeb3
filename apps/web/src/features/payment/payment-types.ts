import type { PaymentScenario } from "../../../../../packages/shared/src/payment";

export type SupportedChainId = 11155111 | 11155420;

export type PaymentActionType =
  | "none"
  | "approve-commercial"
  | "use-l2-balance"
  | "deposit-l1"
  | "refresh-deposit"
  | "create-payment"
  | "approve-payment"
  | "approve-token"
  | "settle-payment"
  | "refresh-transaction"
  | "refresh-settlement"
  | "simulate-payout";

export interface PendingPaymentAction {
  type: Exclude<PaymentActionType, "none" | "approve-commercial" | "use-l2-balance" | "simulate-payout">;
  address: `0x${string}`;
  chainId: SupportedChainId;
}

export interface WalletState {
  status: "disconnected" | "connecting" | "connected" | "unavailable";
  address?: `0x${string}`;
  chainId?: number;
  pendingAction: PendingPaymentAction | null;
}

export interface PaymentAction {
  type: PaymentActionType;
  label: string;
  enabled: boolean;
  reason: string;
  requiredChainId?: SupportedChainId;
  transactionStage?: import("../../../../../packages/shared/src/payment").TransactionStage;
}

export type WalletActionStatus =
  | "idle"
  | "disconnected"
  | "wrong-network"
  | "ready"
  | "simulating"
  | "signature-pending"
  | "submitted"
  | "confirming"
  | "verifying"
  | "confirmed"
  | "server-pending"
  | "rejected"
  | "reverted"
  | "replaced"
  | "invalidated"
  | "insufficient-funds"
  | "unavailable"
  | "duplicate"
  | "configuration-error";

export interface WalletActionState {
  status: WalletActionStatus;
  hash?: `0x${string}`;
  replacementHash?: `0x${string}`;
  requiredChainId?: SupportedChainId;
  error?: string;
}

export type FictionalPaymentScenario = PaymentScenario;

export interface InvoiceDraft {
  payerAddress: string;
  beneficiaryAddress: string;
  brlAmount: string;
}

export interface SerializedInvoiceDraft {
  payerAddress: string;
  beneficiaryAddress: string;
  brlAmountCents: string;
}
