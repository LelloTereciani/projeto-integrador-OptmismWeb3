import { describe, expect, it } from "vitest";

import {
  SUPPORTED_CHAIN_IDS,
  TRANSACTION_STAGES,
  parseAtomicMockUsd,
  type PaymentScenario,
  type PaymentStage,
  type Quote,
  type TransactionEvidence,
  type TransactionStage,
} from "./payment";

describe("parseAtomicMockUsd", () => {
  it.each([
    ["0", 0n],
    ["1", 1_000_000n],
    ["12.34", 12_340_000n],
    ["0.000001", 1n],
  ])("converts %s MockUSD to six-decimal atomic units", (value, expected) => {
    expect(parseAtomicMockUsd(value)).toBe(expected);
  });

  it.each(["", " ", ".", "1.", ".5", "-1", "+1", "1e3", "1,25", "abc"])(
    "rejects malformed decimal input %j",
    (value) => {
      expect(() => parseAtomicMockUsd(value)).toThrow(/decimal/i);
    },
  );

  it("rejects values with more than six decimal places", () => {
    expect(() => parseAtomicMockUsd("1.0000001")).toThrow(/six decimal places/i);
  });
});

describe("shared payment domain", () => {
  it("allows only Ethereum Sepolia and OP Sepolia", () => {
    expect(SUPPORTED_CHAIN_IDS).toEqual([11155111, 11155420]);
  });

  it("enumerates every persisted transaction stage", () => {
    expect(TRANSACTION_STAGES).toEqual([
      "l1-deposit",
      "l2-deposit-credit",
      "payment-create",
      "payment-approve",
      "token-approve",
      "payment-settle",
    ]);
  });

  it("keeps L1 and L2 transaction evidence on their required networks", () => {
    const l1Evidence: TransactionEvidence = {
      stage: "l1-deposit",
      chainId: 11155111,
      hash: "0x01",
      status: "submitted",
    };
    const l2Evidence: TransactionEvidence = {
      stage: "payment-settle",
      chainId: 11155420,
      hash: "0x02",
      status: "confirmed",
    };

    // @ts-expect-error An L1 deposit cannot be recorded against OP Sepolia.
    const invalidEvidence: TransactionEvidence = {
      stage: "l1-deposit",
      chainId: 11155420,
      hash: "0x03",
      status: "confirmed",
    };

    expect([l1Evidence, l2Evidence]).toHaveLength(2);
    expect(invalidEvidence.stage).toBe("l1-deposit");
  });

  it("exposes composable domain types to workspace consumers", () => {
    const stage: PaymentStage = "draft";
    const transactionStage: TransactionStage = "l1-deposit";
    const quote: Quote = {
      brlAmount: "100.00",
      mockUsdAmount: 19_000_000n,
      exchangeRate: "5.00",
      feeAmount: "1.00",
      simulationLabel: "Simulated testnet quote",
    };
    const scenario: PaymentScenario = {
      id: "scenario-1",
      paymentId: `0x${"1".repeat(64)}`,
      termsHash: `0x${"2".repeat(64)}`,
      stage,
      scenarioType: "fictional-testnet",
      payer: "0x0000000000000000000000000000000000000002",
      beneficiary: "0x0000000000000000000000000000000000000001",
      quote,
      transactions: [],
      createdAt: "2026-10-04T12:00:00.000Z",
      updatedAt: "2026-10-04T12:00:00.000Z",
    };

    expect({ scenario, transactionStage }).toMatchObject({
      scenario: { stage: "draft" },
      transactionStage: "l1-deposit",
    });
  });
});
