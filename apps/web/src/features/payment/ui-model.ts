import type {
  PaymentScenario,
  TransactionEvidence,
  TransactionStatus,
} from "../../../../../packages/shared/src/payment";
import { isAddress } from "viem";

import type { InvoiceDraft, SerializedInvoiceDraft } from "./payment-types";

export const TESTNET_WARNING = "Ambiente de demonstração — sem dinheiro real";

export const INVOICE_FIELDS = [
  { id: "payer-address", name: "payerAddress", label: "Carteira pagadora de teste" },
  {
    id: "beneficiary-address",
    name: "beneficiaryAddress",
    label: "Carteira beneficiária de teste",
  },
  { id: "brl-amount", name: "brlAmount", label: "Valor fictício em BRL" },
] as const;

export interface InvoiceFieldError {
  field: keyof InvoiceDraft;
  message: string;
}

export type InvoicePayloadResult = SerializedInvoiceDraft | InvoiceFieldError;

export interface SummaryItem {
  label: string;
  value: string;
}

export interface ProofCardModel {
  title: string;
  network: "Ethereum Sepolia" | "OP Sepolia";
  chainId: 11155111 | 11155420;
  hash: `0x${string}`;
  status: string;
  blockNumber?: string;
  explorerUrl: string;
}

const TRANSACTION_TITLES: Record<TransactionEvidence["stage"], string> = {
  "l1-deposit": "Depósito enviado na L1",
  "l2-deposit-credit": "Crédito confirmado na L2",
  "payment-create": "Operação criada no PaymentRegistry",
  "payment-approve": "Operação aprovada no PaymentRegistry",
  "token-approve": "Valor exato de MockUSD aprovado",
  "payment-settle": "Liquidação confirmada na L2",
};

const STATUS_LABELS: Record<TransactionStatus, string> = {
  submitted: "Enviada",
  pending: "Confirmando",
  confirmed: "Confirmada",
  reverted: "Revertida",
  unavailable: "RPC indisponível",
};

function parseBrlCents(value: string): bigint | null {
  const normalized = value.trim().replace(",", ".");
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) {
    return null;
  }

  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

export function createInvoicePayload(draft: InvoiceDraft): InvoicePayloadResult {
  if (!isAddress(draft.payerAddress, { strict: true })) {
    return {
      field: "payerAddress",
      message: "Informe um endereço EVM pagador válido.",
    };
  }
  if (!isAddress(draft.beneficiaryAddress, { strict: true })) {
    return {
      field: "beneficiaryAddress",
      message: "Informe um endereço EVM beneficiário válido.",
    };
  }
  if (draft.payerAddress.toLowerCase() === draft.beneficiaryAddress.toLowerCase()) {
    return {
      field: "beneficiaryAddress",
      message: "Use carteiras diferentes para pagador e beneficiário.",
    };
  }

  const brlAmountCents = parseBrlCents(draft.brlAmount);
  if (brlAmountCents === null || brlAmountCents <= 0n) {
    return {
      field: "brlAmount",
      message: "Informe um valor fictício maior que zero.",
    };
  }

  return {
    payerAddress: draft.payerAddress,
    beneficiaryAddress: draft.beneficiaryAddress,
    brlAmountCents: brlAmountCents.toString(),
  };
}

export function formatAtomicMockUsd(value: bigint): string {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${fraction}`;
}

export function buildConfirmationSummary(scenario: PaymentScenario): SummaryItem[] {
  return [
    { label: "Carteira pagadora", value: scenario.payer },
    { label: "Carteira beneficiária", value: scenario.beneficiary },
    {
      label: "Valor",
      value: `${formatAtomicMockUsd(scenario.quote.mockUsdAmount)} MockUSD de teste`,
    },
    { label: "Rede da liquidação", value: "OP Sepolia (chain ID 11155420)" },
    { label: "Autorização", value: "Valor exato para PaymentRegistry" },
  ];
}

export function buildProofCards(scenario: PaymentScenario): ProofCardModel[] {
  return scenario.transactions.map((transaction) => ({
    title: TRANSACTION_TITLES[transaction.stage],
    network: transaction.chainId === 11155111 ? "Ethereum Sepolia" : "OP Sepolia",
    chainId: transaction.chainId,
    hash: transaction.hash,
    status: STATUS_LABELS[transaction.status],
    ...(transaction.blockNumber === undefined ? {} : { blockNumber: transaction.blockNumber }),
    explorerUrl:
      transaction.chainId === 11155111
        ? `https://sepolia.etherscan.io/tx/${transaction.hash}`
        : `https://sepolia-optimism.etherscan.io/tx/${transaction.hash}`,
  }));
}

export function deserializeScenario(value: unknown): PaymentScenario {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("The API response is not a payment scenario");
  }

  const candidate = value as PaymentScenario & {
    quote?: PaymentScenario["quote"] & { mockUsdAmount?: unknown };
  };
  const serializedAmount = candidate.quote?.mockUsdAmount;
  if (
    (typeof serializedAmount !== "string" || !/^\d+$/.test(serializedAmount)) &&
    typeof serializedAmount !== "bigint"
  ) {
    throw new TypeError("The API returned an invalid MockUSD amount");
  }

  return {
    ...candidate,
    quote: {
      ...candidate.quote,
      mockUsdAmount:
        typeof serializedAmount === "bigint" ? serializedAmount : BigInt(serializedAmount),
    },
  } as PaymentScenario;
}
