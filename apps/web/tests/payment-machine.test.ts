import { describe, expect, it } from "vitest";

import type { PaymentScenario } from "../../../packages/shared/src/payment";
import {
  getAllowedAction,
  shouldInvalidatePendingAction,
} from "../src/features/payment/payment-machine";
import type { WalletState } from "../src/features/payment/payment-types";

const PAYER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_ACCOUNT = "0x3333333333333333333333333333333333333333" as const;

function scenario(stage: PaymentScenario["stage"]): PaymentScenario {
  return {
    id: "scenario-1",
    paymentId: `0x${"a".repeat(64)}`,
    termsHash: `0x${"b".repeat(64)}`,
    stage,
    scenarioType: "fictional-testnet",
    payer: PAYER,
    beneficiary: "0x2222222222222222222222222222222222222222",
    quote: {
      brlAmount: "100.00",
      mockUsdAmount: 19_800_000n,
      exchangeRate: "5.0000 BRL per MockUSD",
      feeAmount: "1.00",
      simulationLabel: "Simulated fixed quote for a testnet demonstration; no real money",
    },
    transactions: [],
    createdAt: "2026-10-04T12:00:00.000Z",
    updatedAt: "2026-10-04T12:00:00.000Z",
  };
}

function wallet(override: Partial<WalletState> = {}): WalletState {
  return {
    status: "connected",
    address: PAYER,
    chainId: 11155111,
    pendingAction: null,
    ...override,
  };
}

describe("getAllowedAction", () => {
  it("allows commercial approval only after the server has produced a quote", () => {
    expect(getAllowedAction(scenario("draft"), wallet())).toMatchObject({
      type: "none",
      enabled: false,
    });
    expect(getAllowedAction(scenario("quoted"), wallet())).toMatchObject({
      type: "approve-commercial",
      enabled: true,
    });
  });

  it.each(["l1-submitted", "l2-credit-pending"] as const)(
    "keeps L2 actions disabled while the confirmed server stage is %s",
    (stage) => {
      expect(getAllowedAction(scenario(stage), wallet({ chainId: 11155420 }))).toEqual({
        type: "refresh-deposit",
        enabled: true,
        requiredChainId: 11155420,
        label: "Verificar crédito na OP Sepolia",
        reason: "O crédito do depósito ainda precisa de confirmação na OP Sepolia.",
      });
    },
  );

  it("enables the first L2 write only after deposit credit is server-confirmed", () => {
    expect(getAllowedAction(scenario("l2-credited"), wallet({ chainId: 11155420 }))).toMatchObject({
      type: "create-payment",
      enabled: true,
      requiredChainId: 11155420,
    });
  });

  it.each([
    ["l2-credited", "payment-create"],
    ["created", "payment-approve"],
    ["approved", "token-approve"],
  ] as const)(
    "offers only verification when %s already has active %s evidence",
    (stage, transactionStage) => {
      const current = scenario(stage);
      current.transactions = [
        {
          stage: transactionStage,
          chainId: 11155420,
          hash: `0x${"c".repeat(64)}`,
          status: "submitted",
        },
      ];

      expect(getAllowedAction(current, wallet({ chainId: 11155420 }))).toMatchObject({
        type: "refresh-transaction",
        enabled: true,
        requiredChainId: 11155420,
        transactionStage,
        reason: expect.stringMatching(/não envie novamente/i),
      });
    },
  );

  it.each(["pending", "unavailable"] as const)(
    "keeps server verification available for %s evidence without resubmitting",
    (status) => {
      const current = scenario("approved");
      current.transactions = [
        {
          stage: "token-approve",
          chainId: 11155420,
          hash: `0x${"d".repeat(64)}`,
          status,
        },
      ];

      expect(getAllowedAction(current, wallet({ chainId: 11155420 }))).toMatchObject({
        type: "refresh-transaction",
        transactionStage: "token-approve",
      });
    },
  );

  it("allows payout simulation only after settlement is server-confirmed", () => {
    expect(getAllowedAction(scenario("settlement-submitted"), wallet())).toMatchObject({
      type: "refresh-settlement",
      enabled: true,
    });
    expect(getAllowedAction(scenario("settled"), wallet())).toMatchObject({
      type: "simulate-payout",
      enabled: true,
    });
  });

  it("blocks a duplicate while the same payment intent is pending", () => {
    const result = getAllowedAction(
      scenario("commercially-approved"),
      wallet({
        pendingAction: {
          type: "deposit-l1",
          address: PAYER,
          chainId: 11155111,
        },
      }),
    );

    expect(result).toMatchObject({
      type: "deposit-l1",
      enabled: false,
      reason: "A ação já está aguardando confirmação. Não envie novamente.",
    });
  });

  it("requires the payer account and expected network before an on-chain write", () => {
    expect(
      getAllowedAction(scenario("commercially-approved"), wallet({ address: OTHER_ACCOUNT })),
    ).toMatchObject({ enabled: false, reason: expect.stringMatching(/pagadora/i) });
    expect(
      getAllowedAction(scenario("commercially-approved"), wallet({ chainId: 11155420 })),
    ).toMatchObject({ enabled: false, reason: expect.stringMatching(/ethereum sepolia/i) });
  });
});

describe("shouldInvalidatePendingAction", () => {
  it("invalidates a pending action after an account or network change", () => {
    const pending = {
      type: "deposit-l1" as const,
      address: PAYER,
      chainId: 11155111 as const,
    };

    expect(shouldInvalidatePendingAction(pending, wallet())).toBe(false);
    expect(shouldInvalidatePendingAction(pending, wallet({ address: OTHER_ACCOUNT }))).toBe(true);
    expect(shouldInvalidatePendingAction(pending, wallet({ chainId: 11155420 }))).toBe(true);
    expect(shouldInvalidatePendingAction(pending, wallet({ status: "disconnected" }))).toBe(true);
  });
});
