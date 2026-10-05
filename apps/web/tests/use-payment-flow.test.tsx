import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, type Address, type Hash, type Hex } from "viem";

import type { PaymentScenario } from "../../../packages/shared/src/payment";
import {
  bufferedL1DepositGas,
  createPaymentFlowController,
  type PaymentFlowDependencies,
  type ReceiptResult,
  type TransactionIntent,
} from "../src/features/payment/use-payment-flow";
import {
  mockUsdAbi,
  paymentRegistryAbi,
  standardBridgeAbi,
  type PaymentContracts,
} from "../src/lib/contracts";
import { requestWalletChain } from "../src/lib/wagmi";

const PAYER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_ACCOUNT = "0x3333333333333333333333333333333333333333" as const;
const BENEFICIARY = "0x2222222222222222222222222222222222222222" as const;
const REGISTRY = "0x4444444444444444444444444444444444444444" as const;
const MOCK_USD = "0x5555555555555555555555555555555555555555" as const;
const BRIDGE = "0xFBb0621E0B23b5478B630BD55a5f21f67730B0F1" as const;
const HASH = `0x${"6".repeat(64)}` as Hash;
const REPLACEMENT_HASH = `0x${"7".repeat(64)}` as Hash;

const contracts: PaymentContracts = {
  l1StandardBridge: BRIDGE,
  paymentRegistry: REGISTRY,
  mockUsd: MOCK_USD,
};

function scenario(stage: PaymentScenario["stage"]): PaymentScenario {
  return {
    id: "scenario-1",
    paymentId: `0x${"a".repeat(64)}`,
    termsHash: `0x${"b".repeat(64)}`,
    stage,
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

type MutableDependencies = PaymentFlowDependencies & {
  setWallet(next: { address: Address; chainId: number }): void;
};

function dependencies(overrides: Partial<PaymentFlowDependencies> = {}): MutableDependencies {
  let wallet = { address: PAYER as Address, chainId: 11155420 };
  return {
    getWallet: vi.fn(async () => wallet),
    getBalance: vi.fn(async () => 1_000_000_000_000_000_000n),
    simulate: vi.fn(async (intent) => ({ fingerprint: intent.fingerprint })),
    send: vi.fn(async () => HASH),
    waitForReceipt: vi.fn(async (): Promise<ReceiptResult> => ({ status: "success", hash: HASH, blockNumber: 123n })),
    recordTransaction: vi.fn(async () =>
      scenario("settlement-submitted"),
    ),
    verifyTransaction: vi.fn(async () => scenario("settled")),
    setWallet(next) {
      wallet = next;
    },
    ...overrides,
  };
}

describe("payment wallet controller", () => {
  it("adds a gas margin to L1 deposits after a bridge estimate fell short", () => {
    expect(bufferedL1DepositGas(626_821n)).toBe(850_000n);
    expect(bufferedL1DepositGas(659_794n)).toBe(857_733n);
    expect(bufferedL1DepositGas(1_000_000n)).toBe(1_300_000n);
  });

  it("blocks a write while the injected wallet is disconnected", async () => {
    const deps = dependencies({ getWallet: vi.fn(async () => null) });
    const controller = createPaymentFlowController(deps, contracts);

    const result = await controller.submit("create-payment", scenario("l2-credited"));

    expect(result.state).toMatchObject({ status: "disconnected" });
    expect(deps.simulate).not.toHaveBeenCalled();
  });

  it("blocks an unsupported or incorrect chain before simulation", async () => {
    const deps = dependencies({
      getWallet: vi.fn(async () => ({ address: PAYER, chainId: 1 })),
    });
    const controller = createPaymentFlowController(deps, contracts);

    const result = await controller.submit("create-payment", scenario("l2-credited"));

    expect(result.state).toMatchObject({ status: "wrong-network", requiredChainId: 11155420 });
    expect(deps.simulate).not.toHaveBeenCalled();
  });

  it.each([11155111, 11155420] as const)(
    "requests an allowlisted chain %s only after the caller invokes it",
    async (chainId) => {
      const requests: Array<{ method: string; params?: unknown }> = [];
      const provider = {
        request: vi.fn(async (request: { method: string; params?: unknown }) => {
          requests.push(request);
          return null;
        }),
      };

      expect(requests).toEqual([]);
      await requestWalletChain(provider, chainId);

      expect(requests).toEqual([
        { method: "wallet_switchEthereumChain", params: [{ chainId: `0x${chainId.toString(16)}` }] },
      ]);
    },
  );

  it("maps an EIP-1193 user rejection without retrying the signature", async () => {
    const rejection = Object.assign(new Error("User rejected the request"), { code: 4001 });
    const deps = dependencies({ send: vi.fn(async () => Promise.reject(rejection)) });
    const controller = createPaymentFlowController(deps, contracts);

    const result = await controller.submit("create-payment", scenario("l2-credited"));

    expect(result.state).toMatchObject({ status: "rejected" });
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(deps.recordTransaction).not.toHaveBeenCalled();
  });

  it("encodes the exact MockUSD approval amount and PaymentRegistry spender", async () => {
    const observed: TransactionIntent[] = [];
    const deps = dependencies({
      simulate: vi.fn(async (intent) => {
        observed.push(intent);
        return { fingerprint: intent.fingerprint };
      }),
    });
    const controller = createPaymentFlowController(deps, contracts);

    await controller.submit("approve-token", scenario("approved"));

    const decoded = decodeFunctionData({ abi: mockUsdAbi, data: observed[0].data });
    expect(decoded).toEqual({ functionName: "approve", args: [REGISTRY, 19_800_000n] });
    expect(observed[0]).toMatchObject({ to: MOCK_USD, value: 0n });
  });

  it("rejects a simulation whose target, calldata or value differs from the reviewed intent", async () => {
    const deps = dependencies({
      simulate: vi.fn(async (intent) => ({
        fingerprint: `${intent.fingerprint.slice(0, -1)}0` as Hex,
      })),
    });
    const controller = createPaymentFlowController(deps, contracts);

    const result = await controller.submit("approve-token", scenario("approved"));

    expect(result.state).toMatchObject({ status: "invalidated", error: expect.stringMatching(/spender|dados|alvo/i) });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("checks the exact L1 deposit balance before simulation", async () => {
    const deps = dependencies({
      getWallet: vi.fn(async () => ({ address: PAYER, chainId: 11155111 })),
      getBalance: vi.fn(async () => 1n),
    });
    const controller = createPaymentFlowController(deps, contracts);

    const result = await controller.submit("deposit-l1", scenario("commercially-approved"));

    expect(result.state).toMatchObject({ status: "insufficient-funds" });
    expect(deps.simulate).not.toHaveBeenCalled();
  });

  it.each([
    ["account", { address: OTHER_ACCOUNT, chainId: 11155420 }],
    ["chain", { address: PAYER, chainId: 11155111 }],
  ] as const)("invalidates when the %s changes after simulation", async (_label, changedWallet) => {
    let reads = 0;
    const deps = dependencies({
      getWallet: vi.fn(async () => (reads++ === 0 ? { address: PAYER, chainId: 11155420 } : changedWallet)),
    });
    const controller = createPaymentFlowController(deps, contracts);

    const result = await controller.submit("create-payment", scenario("l2-credited"));

    expect(result.state).toMatchObject({ status: "invalidated" });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("reports submitted and confirming before server-verified confirmation", async () => {
    const statuses: string[] = [];
    const deps = dependencies();
    const controller = createPaymentFlowController(deps, contracts);

    const result = await controller.submit("settle-payment", scenario("token-approved"), (state) => {
      statuses.push(state.status);
    });

    expect(statuses).toEqual([
      "simulating",
      "signature-pending",
      "submitted",
      "confirming",
      "verifying",
      "confirmed",
    ]);
    expect(deps.recordTransaction).toHaveBeenCalledWith(
      "scenario-1",
      "payment-settle",
      11155420,
      HASH,
    );
    expect(result).toMatchObject({ state: { status: "confirmed", hash: HASH }, scenario: { stage: "settled" } });
  });

  it("does not report confirmation when server verification has not advanced the scenario", async () => {
    const deps = dependencies({
      recordTransaction: vi.fn(async () => scenario("settlement-submitted")),
      verifyTransaction: vi.fn(async () => scenario("settlement-submitted")),
    });
    const controller = createPaymentFlowController(deps, contracts);

    const result = await controller.submit("settle-payment", scenario("token-approved"));

    expect(result).toMatchObject({
      state: { status: "server-pending", hash: HASH },
      scenario: { stage: "settlement-submitted" },
    });
  });

  it("keeps an L1 deposit pending until the server observes L2 relay evidence", async () => {
    const deps = dependencies({
      getWallet: vi.fn(async () => ({ address: PAYER, chainId: 11155111 })),
      recordTransaction: vi.fn(async () => scenario("l1-submitted")),
      verifyTransaction: vi.fn(async () => scenario("l1-submitted")),
    });
    const controller = createPaymentFlowController(deps, contracts);

    const result = await controller.submit("deposit-l1", scenario("commercially-approved"));

    expect(result.state).toMatchObject({ status: "server-pending", hash: HASH });
  });

  it("keeps the submitted hash visible when server verification is unavailable", async () => {
    const deps = dependencies({
      verifyTransaction: vi.fn(async () => Promise.reject(new Error("RPC unavailable"))),
    });
    const controller = createPaymentFlowController(deps, contracts);

    const result = await controller.submit("settle-payment", scenario("token-approved"));

    expect(result.state).toMatchObject({
      status: "unavailable",
      hash: HASH,
      error: expect.stringMatching(/rpc unavailable/i),
    });
    expect(result.scenario).toMatchObject({ stage: "settlement-submitted" });
  });

  it("never reports success for a reverted receipt", async () => {
    const deps = dependencies({
      waitForReceipt: vi.fn(async (): Promise<ReceiptResult> => ({ status: "reverted", hash: HASH, blockNumber: 123n })),
      verifyTransaction: vi.fn(async () => scenario("token-approved")),
    });
    const controller = createPaymentFlowController(deps, contracts);

    const result = await controller.submit("settle-payment", scenario("token-approved"));

    expect(result.state).toMatchObject({ status: "reverted", hash: HASH });
    expect(deps.verifyTransaction).toHaveBeenCalledWith("scenario-1", "payment-settle");
    expect(result.scenario).toMatchObject({ stage: "token-approved" });
  });

  it("retains both hashes and stops verification when the transaction is replaced", async () => {
    const deps = dependencies({
      waitForReceipt: vi.fn(async (): Promise<ReceiptResult> => ({
        status: "replaced",
        hash: HASH,
        replacementHash: REPLACEMENT_HASH,
        reason: "repriced",
      })),
    });
    const controller = createPaymentFlowController(deps, contracts);

    const result = await controller.submit("settle-payment", scenario("token-approved"));

    expect(result.state).toMatchObject({
      status: "replaced",
      hash: HASH,
      replacementHash: REPLACEMENT_HASH,
    });
    expect(deps.verifyTransaction).not.toHaveBeenCalled();
    expect(result.scenario).toMatchObject({ stage: "settlement-submitted" });
  });

  it("prevents a duplicate click while the same intent is in flight", async () => {
    let releaseReceipt!: () => void;
    const waiting = new Promise<void>((resolve) => {
      releaseReceipt = resolve;
    });
    const deps = dependencies({
      waitForReceipt: vi.fn(async (): Promise<ReceiptResult> => {
        await waiting;
        return { status: "success", hash: HASH, blockNumber: 123n };
      }),
    });
    const controller = createPaymentFlowController(deps, contracts);
    const first = controller.submit("create-payment", scenario("l2-credited"));
    await vi.waitFor(() => expect(deps.send).toHaveBeenCalledTimes(1));

    const duplicate = await controller.submit("create-payment", scenario("l2-credited"));
    releaseReceipt();
    await first;

    expect(duplicate.state).toMatchObject({ status: "duplicate" });
    expect(deps.send).toHaveBeenCalledTimes(1);
  });

  it("builds reviewed calldata for the bridge and registry actions", async () => {
    const intents: TransactionIntent[] = [];
    const deps = dependencies({
      simulate: vi.fn(async (intent) => {
        intents.push(intent);
        return { fingerprint: intent.fingerprint };
      }),
    });
    const controller = createPaymentFlowController(deps, contracts);

    deps.setWallet({ address: PAYER, chainId: 11155111 });
    await controller.submit("deposit-l1", scenario("commercially-approved"));
    deps.setWallet({ address: PAYER, chainId: 11155420 });
    await controller.submit("create-payment", scenario("l2-credited"));
    await controller.submit("approve-payment", scenario("created"));

    expect(decodeFunctionData({ abi: standardBridgeAbi, data: intents[0].data })).toMatchObject({
      functionName: "depositETHTo",
      args: [PAYER, 200_000, "0x"],
    });
    expect(decodeFunctionData({ abi: paymentRegistryAbi, data: intents[1].data })).toEqual({
      functionName: "createPayment",
      args: [scenario("l2-credited").paymentId, BENEFICIARY, 19_800_000n, scenario("l2-credited").termsHash],
    });
    expect(decodeFunctionData({ abi: paymentRegistryAbi, data: intents[2].data })).toEqual({
      functionName: "approvePayment",
      args: [scenario("created").paymentId],
    });
  });
});
