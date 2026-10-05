// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PaymentScenario } from "../../../packages/shared/src/payment";
import { TransactionAction } from "../src/components/transaction-action";
import type { PaymentAction } from "../src/features/payment/payment-types";

const PAYER = "0x1111111111111111111111111111111111111111" as const;
const BENEFICIARY = "0x2222222222222222222222222222222222222222" as const;
const REGISTRY = "0x4444444444444444444444444444444444444444" as const;
const MOCK_USD = "0x5555555555555555555555555555555555555555" as const;
const BRIDGE = "0xFBb0621E0B23b5478B630BD55a5f21f67730B0F1" as const;

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
    transactions: [],
    createdAt: "2026-10-04T12:00:00.000Z",
    updatedAt: "2026-10-04T12:00:00.000Z",
  };
}

const action: PaymentAction = {
  type: "approve-token",
  label: "Aprovar valor exato de MockUSD",
  enabled: true,
  reason: "O PaymentRegistry poderá usar somente o valor desta operação.",
  requiredChainId: 11155420,
};

afterEach(cleanup);

describe("TransactionAction", () => {
  it("shows the full target, exact spender, amount, payer and network before a write", () => {
    render(
      <TransactionAction
        action={action}
        actionState={{ status: "ready" }}
        activeChainId={11155420}
        contracts={{ l1StandardBridge: BRIDGE, paymentRegistry: REGISTRY, mockUsd: MOCK_USD }}
        scenario={scenario()}
        onSubmit={vi.fn()}
        onSwitchChain={vi.fn()}
      />,
    );

    expect(screen.getByText(PAYER)).toBeTruthy();
    expect(screen.getAllByText(REGISTRY).length).toBeGreaterThan(0);
    expect(screen.getByText(MOCK_USD)).toBeTruthy();
    expect(screen.getByText("19.800000 MockUSD de teste")).toBeTruthy();
    expect(screen.getByText(/OP Sepolia.*11155420/i)).toBeTruthy();
  });

  it("requires a separate explicit network switch before submit", () => {
    const submit = vi.fn();
    const switchChain = vi.fn();
    render(
      <TransactionAction
        action={action}
        actionState={{ status: "wrong-network", requiredChainId: 11155420 }}
        activeChainId={11155111}
        contracts={{ l1StandardBridge: BRIDGE, paymentRegistry: REGISTRY, mockUsd: MOCK_USD }}
        scenario={scenario()}
        onSubmit={submit}
        onSwitchChain={switchChain}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /trocar para op sepolia/i }));

    expect(switchChain).toHaveBeenCalledWith(11155420);
    expect(submit).not.toHaveBeenCalled();
  });

  it("disables duplicate submission and announces submitted, reverted and replaced states", () => {
    const { rerender } = render(
      <TransactionAction
        action={action}
        actionState={{ status: "submitted", hash: `0x${"c".repeat(64)}` }}
        activeChainId={11155420}
        contracts={{ l1StandardBridge: BRIDGE, paymentRegistry: REGISTRY, mockUsd: MOCK_USD }}
        scenario={scenario()}
        onSubmit={vi.fn()}
        onSwitchChain={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /enviada/i })).toHaveProperty("disabled", true);
    expect(screen.getByRole("status").textContent).toMatch(/enviada/i);

    rerender(
      <TransactionAction
        action={action}
        actionState={{ status: "reverted", hash: `0x${"c".repeat(64)}` }}
        activeChainId={11155420}
        contracts={{ l1StandardBridge: BRIDGE, paymentRegistry: REGISTRY, mockUsd: MOCK_USD }}
        scenario={scenario()}
        onSubmit={vi.fn()}
        onSwitchChain={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/revertida/i);

    rerender(
      <TransactionAction
        action={action}
        actionState={{
          status: "replaced",
          hash: `0x${"c".repeat(64)}`,
          replacementHash: `0x${"d".repeat(64)}`,
        }}
        activeChainId={11155420}
        contracts={{ l1StandardBridge: BRIDGE, paymentRegistry: REGISTRY, mockUsd: MOCK_USD }}
        scenario={scenario()}
        onSubmit={vi.fn()}
        onSwitchChain={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/substituída/i);
  });

  it("opens the wallet only from the explicit action button", () => {
    const submit = vi.fn();
    render(
      <TransactionAction
        action={action}
        actionState={{ status: "ready" }}
        activeChainId={11155420}
        contracts={{ l1StandardBridge: BRIDGE, paymentRegistry: REGISTRY, mockUsd: MOCK_USD }}
        scenario={scenario()}
        onSubmit={submit}
        onSwitchChain={vi.fn()}
      />,
    );

    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /revisar e abrir a carteira/i }));
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
