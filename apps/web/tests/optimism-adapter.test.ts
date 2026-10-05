import {
  TransactionReceiptNotFoundError,
  concatHex,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  toHex,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { getL2TransactionHashes } from "viem/op-stack";
import { describe, expect, it } from "vitest";

import {
  OptimismAdapter,
  type OptimismReceiptClient,
} from "../src/lib/server/optimism-adapter";

const L1_CHAIN_ID = 11155111;
const L2_CHAIN_ID = 11155420;
const L1_HASH = `0x${"1".repeat(64)}` as Hash;
const PAYMENT_HASH = `0x${"2".repeat(64)}` as Hash;
const ALLOWANCE_HASH = `0x${"3".repeat(64)}` as Hash;
const BLOCK_HASH = `0x${"a".repeat(64)}` as Hash;
const PAYER = getAddress("0x1000000000000000000000000000000000000001");
const BENEFICIARY = getAddress("0x2000000000000000000000000000000000000002");
const REGISTRY = getAddress("0x3000000000000000000000000000000000000003");
const MOCK_USD = getAddress("0x4000000000000000000000000000000000000004");
const L1_STANDARD_BRIDGE = getAddress("0x5000000000000000000000000000000000000005");
const L2_STANDARD_BRIDGE = getAddress("0x4200000000000000000000000000000000000010");
const PORTAL = getAddress("0x6000000000000000000000000000000000000006");
const OTHER_CONTRACT = getAddress("0x7000000000000000000000000000000000000007");
const PAYMENT_ID = `0x${"8".repeat(64)}` as Hash;
const AMOUNT = 19_000_000n;

const transactionDepositedAbi = [
  {
    type: "event",
    name: "TransactionDeposited",
    anonymous: false,
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "version", type: "uint256", indexed: true },
      { name: "opaqueData", type: "bytes", indexed: false },
    ],
  },
] as const;

const ethBridgeInitiatedAbi = [
  {
    type: "event",
    name: "ETHBridgeInitiated",
    anonymous: false,
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "extraData", type: "bytes", indexed: false },
    ],
  },
] as const;

const ethBridgeFinalizedAbi = [
  {
    type: "event",
    name: "ETHBridgeFinalized",
    anonymous: false,
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "extraData", type: "bytes", indexed: false },
    ],
  },
] as const;

const paymentSettledAbi = [
  {
    type: "event",
    name: "PaymentSettled",
    anonymous: false,
    inputs: [
      { name: "paymentId", type: "bytes32", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "beneficiary", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

const approvalAbi = [
  {
    type: "event",
    name: "Approval",
    anonymous: false,
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "spender", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

function eventLog(
  address: Address,
  transactionHash: Hash,
  topics: readonly (Hex | Hex[] | null)[],
  data: Hex,
  logIndex = 0,
): TransactionReceipt["logs"][number] {
  return {
    address,
    blockHash: BLOCK_HASH,
    blockNumber: 100n,
    data,
    logIndex,
    removed: false,
    topics: topics.map((topic) => {
      if (typeof topic !== "string") throw new TypeError("Expected a concrete indexed event topic");
      return topic;
    }) as TransactionReceipt["logs"][number]["topics"],
    transactionHash,
    transactionIndex: 0,
  };
}

function receipt(input: {
  hash: Hash;
  from: Address;
  to: Address;
  status?: "success" | "reverted";
  logs?: TransactionReceipt["logs"];
}): TransactionReceipt {
  return {
    blockHash: BLOCK_HASH,
    blockNumber: 100n,
    contractAddress: null,
    cumulativeGasUsed: 1n,
    effectiveGasPrice: 1n,
    from: input.from,
    gasUsed: 1n,
    logs: input.logs ?? [],
    logsBloom: `0x${"0".repeat(512)}`,
    status: input.status ?? "success",
    to: input.to,
    transactionHash: input.hash,
    transactionIndex: 0,
    type: "eip1559",
  };
}

function l1DepositReceipt(status: "success" | "reverted" = "success") {
  const opaqueData = concatHex([
    toHex(1n, { size: 32 }),
    toHex(1n, { size: 32 }),
    toHex(100_000n, { size: 8 }),
    "0x00",
  ]);
  const bridgeTopics = encodeEventTopics({
    abi: ethBridgeInitiatedAbi,
    eventName: "ETHBridgeInitiated",
    args: { from: PAYER, to: PAYER },
  });
  const portalTopics = encodeEventTopics({
    abi: transactionDepositedAbi,
    eventName: "TransactionDeposited",
    args: { from: L1_STANDARD_BRIDGE, to: PAYER, version: 0n },
  });

  return receipt({
    hash: L1_HASH,
    from: PAYER,
    to: L1_STANDARD_BRIDGE,
    status,
    logs: [
      eventLog(
        L1_STANDARD_BRIDGE,
        L1_HASH,
        bridgeTopics,
        encodeAbiParameters(
          [
            { type: "uint256", name: "amount" },
            { type: "bytes", name: "extraData" },
          ],
          [1n, "0x"],
        ),
      ),
      eventLog(
        PORTAL,
        L1_HASH,
        portalTopics,
        encodeAbiParameters([{ type: "bytes", name: "opaqueData" }], [opaqueData]),
        1,
      ),
    ],
  });
}

function paymentReceipt(overrides: {
  receiptTo?: Address;
  logAddress?: Address;
  paymentId?: Hash;
  payer?: Address;
  beneficiary?: Address;
  amount?: bigint;
  status?: "success" | "reverted";
} = {}) {
  const topics = encodeEventTopics({
    abi: paymentSettledAbi,
    eventName: "PaymentSettled",
    args: {
      paymentId: overrides.paymentId ?? PAYMENT_ID,
      payer: overrides.payer ?? PAYER,
      beneficiary: overrides.beneficiary ?? BENEFICIARY,
    },
  });
  return receipt({
    hash: PAYMENT_HASH,
    from: PAYER,
    to: overrides.receiptTo ?? REGISTRY,
    status: overrides.status,
    logs: [
      eventLog(
        overrides.logAddress ?? REGISTRY,
        PAYMENT_HASH,
        topics,
        encodeAbiParameters(
          [{ type: "uint256", name: "amount" }],
          [overrides.amount ?? AMOUNT],
        ),
      ),
    ],
  });
}

function allowanceReceipt(overrides: {
  receiptTo?: Address;
  logAddress?: Address;
  owner?: Address;
  spender?: Address;
  amount?: bigint;
} = {}) {
  const topics = encodeEventTopics({
    abi: approvalAbi,
    eventName: "Approval",
    args: {
      owner: overrides.owner ?? PAYER,
      spender: overrides.spender ?? REGISTRY,
    },
  });
  return receipt({
    hash: ALLOWANCE_HASH,
    from: PAYER,
    to: overrides.receiptTo ?? MOCK_USD,
    logs: [
      eventLog(
        overrides.logAddress ?? MOCK_USD,
        ALLOWANCE_HASH,
        topics,
        encodeAbiParameters(
          [{ type: "uint256", name: "value" }],
          [overrides.amount ?? AMOUNT],
        ),
      ),
    ],
  });
}

function client(chainId: number, resolveReceipt: (hash: Hash) => TransactionReceipt): OptimismReceiptClient {
  return {
    getChainId: async () => chainId,
    getTransactionReceipt: async ({ hash }) => resolveReceipt(hash),
  };
}

function adapter(input: {
  l1?: OptimismReceiptClient;
  l2?: OptimismReceiptClient;
} = {}) {
  const deposit = l1DepositReceipt();
  const [derivedL2Hash] = getL2TransactionHashes({ logs: deposit.logs });
  const l1 = input.l1 ?? client(L1_CHAIN_ID, () => deposit);
  const l2 =
    input.l2 ??
    client(L2_CHAIN_ID, (hash) => {
      if (hash === derivedL2Hash) {
        return receipt({
          hash,
          from: L1_STANDARD_BRIDGE,
          to: PAYER,
          logs: [eventLog(
            L2_STANDARD_BRIDGE,
            hash,
            encodeEventTopics({ abi: ethBridgeFinalizedAbi, eventName: "ETHBridgeFinalized", args: { from: PAYER, to: PAYER } }),
            encodeAbiParameters([{ type: "uint256", name: "amount" }, { type: "bytes", name: "extraData" }], [1n, "0x"]),
          )],
        });
      }
      if (hash === PAYMENT_HASH) return paymentReceipt();
      if (hash === ALLOWANCE_HASH) return allowanceReceipt();
      throw new TransactionReceiptNotFoundError({ hash });
    });

  return new OptimismAdapter({
    l1Client: l1,
    l2Client: l2,
    l1StandardBridgeAddress: L1_STANDARD_BRIDGE,
    portalAddress: PORTAL,
    paymentRegistryAddress: REGISTRY,
    mockUsdAddress: MOCK_USD,
  });
}

describe("OptimismAdapter.verifyL1Deposit", () => {
  it("confirms only the L2 receipt cryptographically derived from the L1 portal log", async () => {
    const result = await adapter().verifyL1Deposit(L1_HASH, PAYER);

    expect(result).toMatchObject({
      status: "confirmed",
      chainId: L2_CHAIN_ID,
      l1TransactionHash: L1_HASH,
      blockNumber: 100n,
    });
    expect(result.l2TransactionHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("returns pending when the L1 receipt does not exist yet", async () => {
    const l1 = client(L1_CHAIN_ID, (hash) => {
      throw new TransactionReceiptNotFoundError({ hash });
    });

    await expect(adapter({ l1 }).verifyL1Deposit(L1_HASH, PAYER)).resolves.toEqual({
      status: "pending",
      chainId: L1_CHAIN_ID,
      l1TransactionHash: L1_HASH,
    });
  });

  it("returns pending with the derived hash while the linked L2 receipt is absent", async () => {
    const l2 = client(L2_CHAIN_ID, (hash) => {
      throw new TransactionReceiptNotFoundError({ hash });
    });

    const result = await adapter({ l2 }).verifyL1Deposit(L1_HASH, PAYER);

    expect(result).toMatchObject({
      status: "pending",
      chainId: L2_CHAIN_ID,
      l1TransactionHash: L1_HASH,
    });
    expect(result.l2TransactionHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("does not call relay success a credit if the L2 bridge finalization event is absent", async () => {
    const l2 = client(L2_CHAIN_ID, (hash) => receipt({ hash, from: L1_STANDARD_BRIDGE, to: PAYER }));
    await expect(adapter({ l2 }).verifyL1Deposit(L1_HASH, PAYER)).resolves.toMatchObject({
      status: "unavailable",
      chainId: L2_CHAIN_ID,
      reason: expect.stringMatching(/finalization event/i),
    });
  });

  it("reports a reverted L1 receipt", async () => {
    const l1 = client(L1_CHAIN_ID, () => l1DepositReceipt("reverted"));

    await expect(adapter({ l1 }).verifyL1Deposit(L1_HASH, PAYER)).resolves.toMatchObject({
      status: "reverted",
      chainId: L1_CHAIN_ID,
      l1TransactionHash: L1_HASH,
    });
  });

  it("rejects a deposit whose bridge amount differs from the scenario amount", async () => {
    await expect(adapter().verifyL1Deposit(L1_HASH, PAYER, 2n)).resolves.toMatchObject({
      status: "unavailable",
      reason: expect.stringMatching(/bridge event/i),
    });
  });

  it("rejects a client connected to the wrong source chain", async () => {
    const l1 = client(1, () => l1DepositReceipt());

    await expect(adapter({ l1 }).verifyL1Deposit(L1_HASH, PAYER)).resolves.toMatchObject({
      status: "unavailable",
      reason: expect.stringMatching(/11155111/),
    });
  });

  it("returns unavailable when the L1 RPC fails", async () => {
    const l1 = client(L1_CHAIN_ID, () => {
      throw new Error("RPC connection failed");
    });

    await expect(adapter({ l1 }).verifyL1Deposit(L1_HASH, PAYER)).resolves.toMatchObject({
      status: "unavailable",
      reason: "RPC connection failed",
    });
  });
});

describe("OptimismAdapter.verifyL2PaymentEvent", () => {
  const expected = {
    paymentId: PAYMENT_ID,
    payer: PAYER,
    beneficiary: BENEFICIARY,
    amount: AMOUNT,
  };

  it("confirms an exact PaymentSettled event from the configured registry", async () => {
    await expect(adapter().verifyL2PaymentEvent(PAYMENT_HASH, expected)).resolves.toMatchObject({
      status: "confirmed",
      chainId: L2_CHAIN_ID,
      transactionHash: PAYMENT_HASH,
      blockNumber: 100n,
    });
  });

  it.each([
    ["receipt target", { receiptTo: OTHER_CONTRACT }],
    ["log address", { logAddress: OTHER_CONTRACT }],
    ["payment ID", { paymentId: `0x${"9".repeat(64)}` as Hash }],
    ["payer", { payer: OTHER_CONTRACT }],
    ["beneficiary", { beneficiary: OTHER_CONTRACT }],
    ["amount", { amount: AMOUNT + 1n }],
  ])("rejects a mismatched %s", async (_label, overrides) => {
    const l2 = client(L2_CHAIN_ID, () => paymentReceipt(overrides));

    await expect(adapter({ l2 }).verifyL2PaymentEvent(PAYMENT_HASH, expected)).resolves.toMatchObject({
      status: "unavailable",
      reason: expect.stringMatching(/does not match|registry/i),
    });
  });

  it("reports a reverted settlement receipt", async () => {
    const l2 = client(L2_CHAIN_ID, () => paymentReceipt({ status: "reverted" }));

    await expect(adapter({ l2 }).verifyL2PaymentEvent(PAYMENT_HASH, expected)).resolves.toMatchObject({
      status: "reverted",
    });
  });

  it("returns unavailable when the L2 RPC fails", async () => {
    const l2 = client(L2_CHAIN_ID, () => {
      throw new Error("OP Sepolia RPC unavailable");
    });

    await expect(adapter({ l2 }).verifyL2PaymentEvent(PAYMENT_HASH, expected)).resolves.toMatchObject({
      status: "unavailable",
      reason: "OP Sepolia RPC unavailable",
    });
  });
});

describe("OptimismAdapter.verifyL2Allowance", () => {
  const expected = { owner: PAYER, spender: REGISTRY, amount: AMOUNT };

  it("confirms only the exact MockUSD approval for PaymentRegistry", async () => {
    await expect(adapter().verifyL2Allowance(ALLOWANCE_HASH, expected)).resolves.toMatchObject({
      status: "confirmed",
      chainId: L2_CHAIN_ID,
      transactionHash: ALLOWANCE_HASH,
      blockNumber: 100n,
    });
  });

  it.each([
    ["token target", { receiptTo: OTHER_CONTRACT }],
    ["token log address", { logAddress: OTHER_CONTRACT }],
    ["owner", { owner: OTHER_CONTRACT }],
    ["spender", { spender: OTHER_CONTRACT }],
    ["amount", { amount: AMOUNT + 1n }],
  ])("rejects a mismatched %s", async (_label, overrides) => {
    const l2 = client(L2_CHAIN_ID, () => allowanceReceipt(overrides));

    await expect(adapter({ l2 }).verifyL2Allowance(ALLOWANCE_HASH, expected)).resolves.toMatchObject({
      status: "unavailable",
      reason: expect.stringMatching(/does not match|MockUSD/i),
    });
  });
});
