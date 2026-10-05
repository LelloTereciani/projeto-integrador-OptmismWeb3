import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address, Hash } from "viem";

import { createPaymentDatabase, type PaymentDatabase } from "../src/lib/server/db";
import { createPaymentService } from "../src/lib/server/payment-service";
import { L1_DEPOSIT_AMOUNT_WEI, TransactionService, type PaymentChainVerifier } from "../src/lib/server/transaction-service";

const PAYER = "0x1000000000000000000000000000000000000001" as Address;
const BENEFICIARY = "0x2000000000000000000000000000000000000002" as Address;
const REGISTRY = "0x3000000000000000000000000000000000000003" as Address;
const L1_HASH = `0x${"1".repeat(64)}` as Hash;
const L2_HASH = `0x${"2".repeat(64)}` as Hash;
const CREATE_HASH = `0x${"3".repeat(64)}` as Hash;
const APPROVE_HASH = `0x${"4".repeat(64)}` as Hash;
const TOKEN_HASH = `0x${"5".repeat(64)}` as Hash;
const SETTLE_HASH = `0x${"6".repeat(64)}` as Hash;

const databases: PaymentDatabase[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function fixture() {
  const database = createPaymentDatabase(":memory:");
  databases.push(database);
  const payments = createPaymentService(database);
  const scenario = payments.createScenario({
    payerAddress: PAYER,
    beneficiaryAddress: BENEFICIARY,
    brlAmountCents: 10_000n,
    quotedRateBps: 50_000n,
    feeBps: 100n,
  });
  payments.approveCommercial(scenario.id);

  let l1Status: "pending-l1" | "pending-l2" | "unavailable-l2" | "confirmed" | "reverted" = "pending-l1";
  let registryState = 0;
  let allowance = scenario.quote.mockUsdAmount;
  const verifier: PaymentChainVerifier = {
    registryAddress: REGISTRY,
    verifyL1Deposit: vi.fn(async (_hash, _payer, amount) => {
      expect(amount).toBe(L1_DEPOSIT_AMOUNT_WEI);
      if (l1Status === "pending-l1") return { status: "pending" as const, chainId: 11155111, l1TransactionHash: L1_HASH };
      if (l1Status === "pending-l2") return { status: "pending" as const, chainId: 11155420, l1TransactionHash: L1_HASH, l2TransactionHash: L2_HASH };
      if (l1Status === "unavailable-l2") return { status: "unavailable" as const, chainId: 11155420, l1TransactionHash: L1_HASH, l2TransactionHash: L2_HASH };
      if (l1Status === "reverted") return { status: "reverted" as const, chainId: 11155111, l1TransactionHash: L1_HASH };
      return { status: "confirmed" as const, chainId: 11155420, l1TransactionHash: L1_HASH, l2TransactionHash: L2_HASH, blockNumber: 101n };
    }),
    verifyL2PaymentCreated: vi.fn(async () => ({ status: "confirmed" as const, chainId: 11155420, blockNumber: 102n })),
    verifyL2PaymentApproved: vi.fn(async () => ({ status: "confirmed" as const, chainId: 11155420, blockNumber: 103n })),
    verifyL2Allowance: vi.fn(async () => ({ status: "confirmed" as const, chainId: 11155420, blockNumber: 104n })),
    verifyL2PaymentEvent: vi.fn(async () => ({ status: "confirmed" as const, chainId: 11155420, blockNumber: 105n })),
    readRegistryPayment: vi.fn(async () => ({
      payer: scenario.payer,
      beneficiary: scenario.beneficiary,
      amount: scenario.quote.mockUsdAmount,
      termsHash: scenario.termsHash,
      state: registryState,
    })),
    readAllowance: vi.fn(async () => allowance),
    readTokenBalance: vi.fn(async () => scenario.quote.mockUsdAmount),
    readEthBalance: vi.fn(async () => 1_000_000_000_000_000n),
  };
  const transactions = new TransactionService(database, payments, verifier);
  return {
    scenario,
    payments,
    transactions,
    verifier,
    setL1Status: (value: typeof l1Status) => { l1Status = value; },
    setRegistryState: (value: number) => { registryState = value; },
    setAllowance: (value: bigint) => { allowance = value; },
  };
}

async function creditDeposit(f: ReturnType<typeof fixture>) {
  f.transactions.recordTransaction(f.scenario.id, { stage: "l1-deposit", chainId: 11155111, hash: L1_HASH });
  f.setL1Status("confirmed");
  await f.transactions.verifyTransaction(f.scenario.id, "l1-deposit");
}

describe("TransactionService integration with SQLite and mocked chain receipts", () => {
  it("uses existing L2 funds for a 5 MUSD payment in either direction without a new deposit", async () => {
    const f = fixture();
    const first = f.payments.createScenario({
      payerAddress: PAYER,
      beneficiaryAddress: BENEFICIARY,
      brlAmountCents: 2_526n,
      quotedRateBps: 50_000n,
      feeBps: 100n,
    });
    f.payments.approveCommercial(first.id);
    expect(first.quote.mockUsdAmount).toBe(5_000_000n);
    expect((await f.transactions.useExistingL2Balance(first.id)).stage).toBe("l2-ready");
    expect(f.transactions.recordTransaction(first.id, { stage: "payment-create", chainId: 11155420, hash: CREATE_HASH }).stage).toBe("l2-ready");
    vi.mocked(f.verifier.readRegistryPayment).mockResolvedValueOnce({
      payer: first.payer,
      beneficiary: first.beneficiary,
      amount: first.quote.mockUsdAmount,
      termsHash: first.termsHash,
      state: 0,
    });
    expect((await f.transactions.verifyTransaction(first.id, "payment-create")).stage).toBe("created");
    expect(f.payments.getScenario(first.id).transactions.every((tx) => tx.chainId === 11155420)).toBe(true);

    const reverse = f.payments.createScenario({
      payerAddress: BENEFICIARY,
      beneficiaryAddress: PAYER,
      brlAmountCents: 2_526n,
      quotedRateBps: 50_000n,
      feeBps: 100n,
    });
    f.payments.approveCommercial(reverse.id);
    expect(reverse.quote.mockUsdAmount).toBe(5_000_000n);
    expect((await f.transactions.useExistingL2Balance(reverse.id)).stage).toBe("l2-ready");
    expect(reverse.payer).toBe(first.beneficiary);
    expect(reverse.beneficiary).toBe(first.payer);
  });

  it("blocks an L2 payment when MockUSD or gas ETH is absent", async () => {
    const f = fixture();
    vi.mocked(f.verifier.readTokenBalance).mockResolvedValueOnce(0n);
    await expect(f.transactions.useExistingL2Balance(f.scenario.id)).rejects.toThrow(/MockUSD/);
    expect(f.payments.getScenario(f.scenario.id).stage).toBe("commercially-approved");
    vi.mocked(f.verifier.readEthBalance).mockResolvedValueOnce(0n);
    await expect(f.transactions.useExistingL2Balance(f.scenario.id)).rejects.toThrow(/ETH/);
  });

  it("preserves L1 pending, L2 pending, then confirmed credit as distinct evidence", async () => {
    const f = fixture();
    const recorded = f.transactions.recordTransaction(f.scenario.id, { stage: "l1-deposit", chainId: 11155111, hash: L1_HASH });
    expect(recorded.stage).toBe("l1-submitted");

    expect((await f.transactions.verifyTransaction(f.scenario.id, "l1-deposit")).stage).toBe("l1-submitted");
    f.setL1Status("pending-l2");
    const pending = await f.transactions.verifyTransaction(f.scenario.id, "l1-deposit");
    expect(pending.stage).toBe("l2-credit-pending");
    expect(pending.transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "l1-deposit", status: "confirmed" }),
      expect.objectContaining({ stage: "l2-deposit-credit", hash: L2_HASH, status: "pending" }),
    ]));

    f.setL1Status("confirmed");
    const confirmed = await f.transactions.verifyTransaction(f.scenario.id, "l1-deposit");
    expect(confirmed.stage).toBe("l2-credited");
    expect(confirmed.transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "l2-deposit-credit", status: "confirmed", blockNumber: "101" }),
    ]));
  });

  it("runs create, payment approval, exact token approval and settlement only after independent verification", async () => {
    const f = fixture();
    await creditDeposit(f);
    expect(f.transactions.recordTransaction(f.scenario.id, { stage: "payment-create", chainId: 11155420, hash: CREATE_HASH }).stage).toBe("l2-credited");
    expect((await f.transactions.verifyTransaction(f.scenario.id, "payment-create")).stage).toBe("created");
    f.setRegistryState(1);
    f.transactions.recordTransaction(f.scenario.id, { stage: "payment-approve", chainId: 11155420, hash: APPROVE_HASH });
    expect((await f.transactions.verifyTransaction(f.scenario.id, "payment-approve")).stage).toBe("approved");
    f.transactions.recordTransaction(f.scenario.id, { stage: "token-approve", chainId: 11155420, hash: TOKEN_HASH });
    expect((await f.transactions.verifyTransaction(f.scenario.id, "token-approve")).stage).toBe("token-approved");
    f.setRegistryState(2);
    expect(f.transactions.recordTransaction(f.scenario.id, { stage: "payment-settle", chainId: 11155420, hash: SETTLE_HASH }).stage).toBe("settlement-submitted");
    expect((await f.transactions.verifyTransaction(f.scenario.id, "payment-settle")).stage).toBe("settled");
    expect(f.transactions.simulatePayout(f.scenario.id).stage).toBe("payout-simulated");
  });

  it("rejects a fabricated chain ID, duplicate active hash and reuse of one L1 deposit across scenarios", () => {
    const f = fixture();
    expect(() => f.transactions.recordTransaction(f.scenario.id, { stage: "l1-deposit", chainId: 11155420, hash: L1_HASH })).toThrow(/11155111/);
    f.transactions.recordTransaction(f.scenario.id, { stage: "l1-deposit", chainId: 11155111, hash: L1_HASH });
    expect(() => f.transactions.recordTransaction(f.scenario.id, { stage: "l1-deposit", chainId: 11155111, hash: CREATE_HASH })).toThrow(/Cannot submit|active/);
    const other = f.payments.createScenario({ payerAddress: PAYER, beneficiaryAddress: BENEFICIARY, brlAmountCents: 5_000n, quotedRateBps: 50_000n, feeBps: 100n });
    f.payments.approveCommercial(other.id);
    expect(() => f.transactions.recordTransaction(other.id, { stage: "l1-deposit", chainId: 11155111, hash: L1_HASH })).toThrow(/already associated/);
  });

  it("does not advance when the event confirms but the current registry state differs", async () => {
    const f = fixture();
    await creditDeposit(f);
    f.setRegistryState(1);
    vi.mocked(f.verifier.readRegistryPayment).mockResolvedValueOnce({
      payer: f.scenario.payer,
      beneficiary: BENEFICIARY,
      amount: f.scenario.quote.mockUsdAmount + 1n,
      termsHash: f.scenario.termsHash,
      state: 1,
    });
    f.transactions.recordTransaction(f.scenario.id, { stage: "payment-create", chainId: 11155420, hash: CREATE_HASH });
    const result = await f.transactions.verifyTransaction(f.scenario.id, "payment-create");
    expect(result.stage).toBe("l2-credited");
    expect(result.transactions.at(-1)?.status).toBe("unavailable");
  });

  it("does not advance on an excessive on-chain allowance despite an approval receipt", async () => {
    const f = fixture();
    await creditDeposit(f);
    f.transactions.recordTransaction(f.scenario.id, { stage: "payment-create", chainId: 11155420, hash: CREATE_HASH });
    await f.transactions.verifyTransaction(f.scenario.id, "payment-create");
    f.setRegistryState(1);
    f.transactions.recordTransaction(f.scenario.id, { stage: "payment-approve", chainId: 11155420, hash: APPROVE_HASH });
    await f.transactions.verifyTransaction(f.scenario.id, "payment-approve");
    f.setAllowance(f.scenario.quote.mockUsdAmount + 1n);
    f.transactions.recordTransaction(f.scenario.id, { stage: "token-approve", chainId: 11155420, hash: TOKEN_HASH });
    expect((await f.transactions.verifyTransaction(f.scenario.id, "token-approve")).stage).toBe("approved");
  });

  it("keeps a reverted deposit visible and allows an explicit new transaction", async () => {
    const f = fixture();
    f.transactions.recordTransaction(f.scenario.id, { stage: "l1-deposit", chainId: 11155111, hash: L1_HASH });
    f.setL1Status("reverted");
    const reverted = await f.transactions.verifyTransaction(f.scenario.id, "l1-deposit");
    expect(reverted.stage).toBe("commercially-approved");
    expect(reverted.transactions[0].status).toBe("reverted");
    expect(f.transactions.recordTransaction(f.scenario.id, { stage: "l1-deposit", chainId: 11155111, hash: CREATE_HASH }).stage).toBe("l1-submitted");
  });

  it("preserves confirmed L1 evidence during L2 RPC failure and does not regress later stages", async () => {
    const f = fixture();
    f.transactions.recordTransaction(f.scenario.id, { stage: "l1-deposit", chainId: 11155111, hash: L1_HASH });
    f.setL1Status("unavailable-l2");
    const unavailable = await f.transactions.verifyTransaction(f.scenario.id, "l1-deposit");
    expect(unavailable.stage).toBe("l2-credit-pending");
    expect(unavailable.transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "l1-deposit", status: "confirmed" }),
      expect.objectContaining({ stage: "l2-deposit-credit", status: "unavailable" }),
    ]));
    f.setL1Status("confirmed");
    await f.transactions.verifyTransaction(f.scenario.id, "l1-deposit");
    f.transactions.recordTransaction(f.scenario.id, { stage: "payment-create", chainId: 11155420, hash: CREATE_HASH });
    await f.transactions.verifyTransaction(f.scenario.id, "payment-create");
    expect((await f.transactions.verifyTransaction(f.scenario.id, "l1-deposit")).stage).toBe("created");
  });
});
