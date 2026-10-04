export const SUPPORTED_CHAIN_IDS = [11155111, 11155420] as const;
export const MOCK_USD_DECIMALS = 6;

export const TRANSACTION_STAGES = [
  "l1-deposit",
  "l2-deposit-credit",
  "payment-create",
  "payment-approve",
  "token-approve",
  "payment-settle",
] as const;

export type TransactionStage = (typeof TRANSACTION_STAGES)[number];

export type PaymentStage =
  | "draft"
  | "quoted"
  | "commercially-approved"
  | "l1-submitted"
  | "l2-credit-pending"
  | "l2-credited"
  | "created"
  | "approved"
  | "token-approved"
  | "settlement-submitted"
  | "settled"
  | "payout-simulated";

export type TransactionStatus = "submitted" | "pending" | "confirmed" | "reverted" | "unavailable";

type TransactionNetwork =
  | { stage: "l1-deposit"; chainId: 11155111 }
  | { stage: Exclude<TransactionStage, "l1-deposit">; chainId: 11155420 };

export type TransactionEvidence = TransactionNetwork & {
  hash: `0x${string}`;
  status: TransactionStatus;
  blockNumber?: string;
};

export interface Quote {
  brlAmount: string;
  mockUsdAmount: bigint;
  exchangeRate: string;
  feeAmount: string;
}

export interface PaymentScenario {
  id: string;
  stage: PaymentStage;
  beneficiary: `0x${string}`;
  quote: Quote;
  transactions: TransactionEvidence[];
}

export function parseAtomicMockUsd(value: string): bigint {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) {
    if (/^\d+\.\d{7,}$/.test(value)) {
      throw new Error("MockUSD supports at most six decimal places");
    }
    throw new Error("Expected a non-negative decimal MockUSD amount");
  }
  return BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
}
