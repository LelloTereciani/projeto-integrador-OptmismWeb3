import { describe, expect, it } from "vitest";

import type { PaymentScenario } from "../../../packages/shared/src/payment";
import {
  buildConfirmationSummary,
  buildProofCards,
  createInvoicePayload,
  deserializeScenario,
  INVOICE_FIELDS,
  TESTNET_WARNING,
} from "../src/features/payment/ui-model";

const PAYER = "0x1111111111111111111111111111111111111111" as const;
const BENEFICIARY = "0x2222222222222222222222222222222222222222" as const;

function scenario(): PaymentScenario {
  return {
    id: "scenario-1",
    paymentId: `0x${"a".repeat(64)}`,
    termsHash: `0x${"b".repeat(64)}`,
    stage: "approved",
    scenarioType: "fictional-testnet",
    payer: PAYER,
    beneficiary: BENEFICIARY,
    quote: {
      brlAmount: "100.00",
      mockUsdAmount: 19_800_000n,
      exchangeRate: "5.0000 BRL per MockUSD",
      feeAmount: "1.00",
      simulationLabel: "Simulated fixed quote for a testnet demonstration; no real money",
    },
    transactions: [
      {
        stage: "l1-deposit",
        chainId: 11155111,
        hash: `0x${"c".repeat(64)}`,
        status: "confirmed",
        blockNumber: "123",
      },
    ],
    createdAt: "2026-10-04T12:00:00.000Z",
    updatedAt: "2026-10-04T12:00:00.000Z",
  };
}

describe("fictional payment page model", () => {
  it("keeps the permanent testnet warning explicit", () => {
    expect(TESTNET_WARNING).toBe("Ambiente de demonstração — sem dinheiro real");
  });

  it("provides a unique associated label for every draft field", () => {
    expect(INVOICE_FIELDS.map(({ id }) => id)).toEqual([
      "payer-address",
      "beneficiary-address",
      "brl-amount",
    ]);
    expect(INVOICE_FIELDS.every(({ id, label }) => id.length > 0 && label.length > 0)).toBe(true);
    expect(new Set(INVOICE_FIELDS.map(({ id }) => id)).size).toBe(INVOICE_FIELDS.length);
  });

  it("serializes a valid draft to exact integer cents for the API", () => {
    expect(
      createInvoicePayload({
        payerAddress: PAYER,
        beneficiaryAddress: BENEFICIARY,
        brlAmount: "100,01",
      }),
    ).toEqual({
      payerAddress: PAYER,
      beneficiaryAddress: BENEFICIARY,
      brlAmountCents: "10001",
    });
  });

  it.each([
    ["payerAddress", { payerAddress: "0x1234" }, "Informe um endereço EVM pagador válido."],
    [
      "beneficiaryAddress",
      { beneficiaryAddress: PAYER },
      "Use carteiras diferentes para pagador e beneficiário.",
    ],
    ["brlAmount", { brlAmount: "0,00" }, "Informe um valor fictício maior que zero."],
  ] as const)("returns a field-specific message for invalid %s", (field, override, message) => {
    const result = createInvoicePayload({
      payerAddress: PAYER,
      beneficiaryAddress: BENEFICIARY,
      brlAmount: "100,00",
      ...override,
    });

    expect(result).toEqual({ field, message });
  });

  it("shows full addresses and the exact MockUSD amount in the confirmation summary", () => {
    expect(buildConfirmationSummary(scenario())).toEqual([
      { label: "Carteira pagadora", value: PAYER },
      { label: "Carteira beneficiária", value: BENEFICIARY },
      { label: "Valor", value: "19.800000 MockUSD de teste" },
      { label: "Rede da liquidação", value: "OP Sepolia (chain ID 11155420)" },
      { label: "Autorização", value: "Valor exato para PaymentRegistry" },
    ]);
  });

  it("creates explorer links only from transaction evidence already present in the scenario", () => {
    expect(buildProofCards(scenario())).toEqual([
      {
        title: "Depósito enviado na L1",
        network: "Ethereum Sepolia",
        chainId: 11155111,
        hash: `0x${"c".repeat(64)}`,
        status: "Confirmada",
        blockNumber: "123",
        explorerUrl: `https://sepolia.etherscan.io/tx/0x${"c".repeat(64)}`,
      },
    ]);
    expect(buildProofCards({ ...scenario(), transactions: [] })).toEqual([]);
  });

  it("hydrates the API decimal string as bigint before the UI uses it", () => {
    expect(
      deserializeScenario({
        ...scenario(),
        quote: { ...scenario().quote, mockUsdAmount: "19800000" },
      }).quote.mockUsdAmount,
    ).toBe(19_800_000n);
    expect(() =>
      deserializeScenario({
        ...scenario(),
        quote: { ...scenario().quote, mockUsdAmount: "19.8" },
      }),
    ).toThrow(/mockusd/i);
  });
});
