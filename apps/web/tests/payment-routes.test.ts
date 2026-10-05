import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createScenario: vi.fn(),
  approveCommercial: vi.fn(),
  getScenario: vi.fn(),
  recordTransaction: vi.fn(),
  verifyTransaction: vi.fn(),
  simulatePayout: vi.fn(),
}));

vi.mock("../src/lib/server/runtime", () => ({
  TestnetConfigurationError: class TestnetConfigurationError extends Error {},
  paymentService: {
    createScenario: mocks.createScenario,
    approveCommercial: mocks.approveCommercial,
    getScenario: mocks.getScenario,
  },
  getTransactionService: () => ({
    recordTransaction: mocks.recordTransaction,
    verifyTransaction: mocks.verifyTransaction,
    simulatePayout: mocks.simulatePayout,
  }),
}));

import { POST as createPayment } from "../src/app/api/payments/route";
import { GET as getPayment } from "../src/app/api/payments/[id]/route";
import { POST as approveCommercial } from "../src/app/api/payments/[id]/commercial-approval/route";
import { POST as recordTransaction } from "../src/app/api/payments/[id]/transactions/route";
import { POST as verifyTransaction } from "../src/app/api/payments/[id]/transactions/[stage]/verify/route";
import { POST as simulatePayout } from "../src/app/api/payments/[id]/simulate-payout/route";

const PAYER = "0x1000000000000000000000000000000000000001";
const BENEFICIARY = "0x2000000000000000000000000000000000000002";
const HASH = `0x${"1".repeat(64)}`;
const SCENARIO = {
  id: "demo-id",
  stage: "quoted",
  payer: PAYER,
  beneficiary: BENEFICIARY,
  quote: { mockUsdAmount: 19_800_000n },
  transactions: [],
};
const idContext = { params: Promise.resolve({ id: "demo-id" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createScenario.mockReturnValue(SCENARIO);
  mocks.getScenario.mockReturnValue(SCENARIO);
  mocks.approveCommercial.mockReturnValue({ ...SCENARIO, stage: "commercially-approved" });
  mocks.recordTransaction.mockReturnValue({ ...SCENARIO, stage: "l1-submitted" });
  mocks.verifyTransaction.mockResolvedValue({ ...SCENARIO, stage: "l2-credit-pending" });
  mocks.simulatePayout.mockReturnValue({ ...SCENARIO, stage: "payout-simulated" });
});

describe("payment HTTP routes", () => {
  it("accepts a strict fictional scenario payload and serializes atomic values as strings", async () => {
    const response = await createPayment(new Request("http://localhost/api/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payerAddress: PAYER, beneficiaryAddress: BENEFICIARY, brlAmountCents: "10000" }),
    }));
    expect(response.status).toBe(201);
    expect(mocks.createScenario).toHaveBeenCalledWith({
      payerAddress: PAYER,
      beneficiaryAddress: BENEFICIARY,
      brlAmountCents: 10_000n,
      quotedRateBps: 50_000n,
      feeBps: 100n,
    });
    expect(await response.json()).toMatchObject({ quote: { mockUsdAmount: "19800000" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    { payerAddress: PAYER, beneficiaryAddress: BENEFICIARY, brlAmountCents: "0" },
    { payerAddress: PAYER, beneficiaryAddress: BENEFICIARY, brlAmountCents: "1.25" },
    { payerAddress: PAYER, beneficiaryAddress: BENEFICIARY, brlAmountCents: "10000", bankAccount: "fictional" },
  ])("rejects malformed or forbidden scenario input", async (payload) => {
    const response = await createPayment(new Request("http://localhost/api/payments", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    }));
    expect(response.status).toBe(400);
    expect(mocks.createScenario).not.toHaveBeenCalled();
  });

  it("returns a persisted scenario and a 404 for an unknown ID", async () => {
    expect((await getPayment(new Request("http://localhost"), idContext)).status).toBe(200);
    mocks.getScenario.mockImplementationOnce(() => { throw new Error("Payment scenario not found: missing"); });
    expect((await getPayment(new Request("http://localhost"), idContext)).status).toBe(404);
  });

  it("requires a valid commercial approval transition", async () => {
    const approved = await approveCommercial(new Request("http://localhost", { method: "POST" }), idContext);
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ stage: "commercially-approved" });
    mocks.approveCommercial.mockImplementationOnce(() => { throw new Error("Payment scenario is already commercially approved or beyond: settled"); });
    expect((await approveCommercial(new Request("http://localhost", { method: "POST" }), idContext)).status).toBe(409);
  });

  it("refuses fabricated stage, chain ID and hash before recording a transaction", async () => {
    for (const payload of [
      { stage: "l2-deposit-credit", chainId: 11155420, hash: HASH },
      { stage: "l1-deposit", chainId: 1, hash: HASH },
      { stage: "l1-deposit", chainId: 11155111, hash: "0x1234" },
    ]) {
      const response = await recordTransaction(new Request("http://localhost", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      }), idContext);
      expect(response.status).toBe(400);
    }
    expect(mocks.recordTransaction).not.toHaveBeenCalled();
  });

  it("records and re-verifies submitted evidence independently of the browser claim", async () => {
    const recorded = await recordTransaction(new Request("http://localhost", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "l1-deposit", chainId: 11155111, hash: HASH }),
    }), idContext);
    expect(recorded.status).toBe(201);
    expect(mocks.recordTransaction).toHaveBeenCalledWith("demo-id", { stage: "l1-deposit", chainId: 11155111, hash: HASH });
    const verified = await verifyTransaction(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "demo-id", stage: "l1-deposit" }),
    });
    expect(verified.status).toBe(200);
    expect(await verified.json()).toMatchObject({ stage: "l2-credit-pending" });
  });

  it("does not expose a payout stage without backend confirmation", async () => {
    mocks.simulatePayout.mockImplementationOnce(() => { throw new Error("Only a confirmed settlement can show simulated payout"); });
    expect((await simulatePayout(new Request("http://localhost", { method: "POST" }), idContext)).status).toBe(409);
  });
});
