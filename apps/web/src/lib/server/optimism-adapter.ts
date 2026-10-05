import {
  TransactionReceiptNotFoundError,
  decodeEventLog,
  getAddress,
  isAddressEqual,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { getL2TransactionHashes } from "viem/op-stack";

const L1_CHAIN_ID = 11155111;
const L2_CHAIN_ID = 11155420;
const L2_STANDARD_BRIDGE_ADDRESS = getAddress("0x4200000000000000000000000000000000000010");

const ethBridgeInitiatedAbi = [{
  type: "event",
  name: "ETHBridgeInitiated",
  anonymous: false,
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
    { name: "extraData", type: "bytes", indexed: false },
  ],
}] as const;

const ethBridgeFinalizedAbi = [{
  type: "event",
  name: "ETHBridgeFinalized",
  anonymous: false,
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
    { name: "extraData", type: "bytes", indexed: false },
  ],
}] as const;

const paymentSettledAbi = [{
  type: "event",
  name: "PaymentSettled",
  anonymous: false,
  inputs: [
    { name: "paymentId", type: "bytes32", indexed: true },
    { name: "payer", type: "address", indexed: true },
    { name: "beneficiary", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
  ],
}] as const;

const paymentCreatedAbi = [{
  type: "event",
  name: "PaymentCreated",
  anonymous: false,
  inputs: [
    { name: "paymentId", type: "bytes32", indexed: true },
    { name: "payer", type: "address", indexed: true },
    { name: "beneficiary", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
    { name: "termsHash", type: "bytes32", indexed: false },
  ],
}] as const;

const paymentApprovedAbi = [{
  type: "event",
  name: "PaymentApproved",
  anonymous: false,
  inputs: [
    { name: "paymentId", type: "bytes32", indexed: true },
    { name: "payer", type: "address", indexed: true },
  ],
}] as const;

const approvalAbi = [{
  type: "event",
  name: "Approval",
  anonymous: false,
  inputs: [
    { name: "owner", type: "address", indexed: true },
    { name: "spender", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
}] as const;

export interface OptimismReceiptClient {
  getChainId(): Promise<number>;
  getTransactionReceipt(input: { hash: Hash }): Promise<TransactionReceipt>;
}

type VerificationStatus = "pending" | "confirmed" | "reverted" | "unavailable";

export interface VerificationResult {
  status: VerificationStatus;
  chainId: number;
  transactionHash?: Hash;
  l1TransactionHash?: Hash;
  l2TransactionHash?: Hash;
  blockNumber?: bigint;
  reason?: string;
}

interface AdapterConfig {
  l1Client: OptimismReceiptClient;
  l2Client: OptimismReceiptClient;
  l1StandardBridgeAddress: Address;
  portalAddress: Address;
  paymentRegistryAddress: Address;
  mockUsdAddress: Address;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "RPC verification failed";
}

function receiptError(error: unknown, chainId: number, hash: Hash): VerificationResult {
  return error instanceof TransactionReceiptNotFoundError
    ? { status: "pending", chainId, transactionHash: hash }
    : { status: "unavailable", chainId, transactionHash: hash, reason: errorMessage(error) };
}

function sameAddress(left: Address | null | undefined, right: Address): boolean {
  return !!left && isAddressEqual(left, right);
}

function isVerificationResult(value: TransactionReceipt | VerificationResult): value is VerificationResult {
  return "chainId" in value;
}

export class OptimismAdapter {
  constructor(private readonly config: AdapterConfig) {}

  private async checkedReceipt(client: OptimismReceiptClient, chainId: number, hash: Hash): Promise<TransactionReceipt | VerificationResult> {
    try {
      const observedChainId = await client.getChainId();
      if (observedChainId !== chainId) {
        return { status: "unavailable", chainId, transactionHash: hash, reason: `Expected chain ${chainId}; RPC returned ${observedChainId}` };
      }
      const receipt = await client.getTransactionReceipt({ hash });
      if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) {
        return { status: "unavailable", chainId, transactionHash: hash, reason: "RPC receipt hash does not match requested transaction" };
      }
      return receipt;
    } catch (error) {
      return receiptError(error, chainId, hash);
    }
  }

  async verifyL1Deposit(hash: Hash, payer: Address, expectedAmountWei?: bigint): Promise<VerificationResult> {
    const l1 = await this.checkedReceipt(this.config.l1Client, L1_CHAIN_ID, hash);
    if (isVerificationResult(l1)) {
      return {
        status: l1.status,
        chainId: l1.chainId,
        l1TransactionHash: hash,
        ...(l1.reason === undefined ? {} : { reason: l1.reason }),
      };
    }
    const l1Receipt = l1 as TransactionReceipt;
    if (l1Receipt.status === "reverted") {
      return { status: "reverted", chainId: L1_CHAIN_ID, l1TransactionHash: hash, blockNumber: l1Receipt.blockNumber };
    }
    if (!sameAddress(l1Receipt.from, payer) || !sameAddress(l1Receipt.to, this.config.l1StandardBridgeAddress)) {
      return { status: "unavailable", chainId: L1_CHAIN_ID, l1TransactionHash: hash, reason: "Deposit transaction sender or bridge does not match" };
    }

    const bridgeLogMatches = l1Receipt.logs.some((log) => {
      if (!sameAddress(log.address, this.config.l1StandardBridgeAddress)) return false;
      try {
        const decoded = decodeEventLog({ abi: ethBridgeInitiatedAbi, data: log.data, topics: log.topics });
        return decoded.eventName === "ETHBridgeInitiated" &&
          sameAddress(decoded.args.from, payer) && sameAddress(decoded.args.to, payer) &&
          decoded.args.amount > 0n && (expectedAmountWei === undefined || decoded.args.amount === expectedAmountWei);
      } catch { return false; }
    });
    if (!bridgeLogMatches) {
      return { status: "unavailable", chainId: L1_CHAIN_ID, l1TransactionHash: hash, reason: "ETH bridge event does not match payer" };
    }

    const portalLogs = l1Receipt.logs.filter((log) => sameAddress(log.address, this.config.portalAddress));
    let l2Hashes: readonly Hash[];
    try {
      l2Hashes = getL2TransactionHashes({ logs: portalLogs });
    } catch (error) {
      return { status: "unavailable", chainId: L1_CHAIN_ID, l1TransactionHash: hash, reason: errorMessage(error) };
    }
    if (l2Hashes.length !== 1) {
      return { status: "unavailable", chainId: L1_CHAIN_ID, l1TransactionHash: hash, reason: "Expected one portal deposit transaction" };
    }
    const l2Hash = l2Hashes[0];
    const l2 = await this.checkedReceipt(this.config.l2Client, L2_CHAIN_ID, l2Hash);
    if (isVerificationResult(l2)) {
      return { ...l2, l1TransactionHash: hash, l2TransactionHash: l2Hash };
    }
    const l2Receipt = l2 as TransactionReceipt;
    if (l2Receipt.status === "success") {
      const finalized = l2Receipt.logs.some((log) => {
        if (!sameAddress(log.address, L2_STANDARD_BRIDGE_ADDRESS)) return false;
        try {
          const decoded = decodeEventLog({ abi: ethBridgeFinalizedAbi, data: log.data, topics: log.topics });
          return decoded.eventName === "ETHBridgeFinalized" &&
            sameAddress(decoded.args.from, payer) && sameAddress(decoded.args.to, payer) &&
            decoded.args.amount > 0n && (expectedAmountWei === undefined || decoded.args.amount === expectedAmountWei);
        } catch { return false; }
      });
      if (!finalized) {
        return {
          status: "unavailable",
          chainId: L2_CHAIN_ID,
          l1TransactionHash: hash,
          l2TransactionHash: l2Hash,
          blockNumber: l2Receipt.blockNumber,
          reason: "L2 ETH bridge finalization event does not match the deposit",
        };
      }
    }
    return {
      status: l2Receipt.status === "success" ? "confirmed" : "reverted",
      chainId: L2_CHAIN_ID,
      l1TransactionHash: hash,
      l2TransactionHash: l2Hash,
      blockNumber: l2Receipt.blockNumber,
    };
  }

  async verifyL2PaymentEvent(hash: Hash, expected: { paymentId: Hash; payer: Address; beneficiary: Address; amount: bigint }): Promise<VerificationResult> {
    const l2 = await this.checkedReceipt(this.config.l2Client, L2_CHAIN_ID, hash);
    if (isVerificationResult(l2)) return l2;
    const receipt = l2 as TransactionReceipt;
    if (receipt.status === "reverted") return { status: "reverted", chainId: L2_CHAIN_ID, transactionHash: hash, blockNumber: receipt.blockNumber };
    if (!sameAddress(receipt.from, expected.payer) || !sameAddress(receipt.to, this.config.paymentRegistryAddress)) {
      return { status: "unavailable", chainId: L2_CHAIN_ID, transactionHash: hash, reason: "Registry transaction does not match payer or registry" };
    }
    const matched = receipt.logs.some((log) => {
      if (!sameAddress(log.address, this.config.paymentRegistryAddress)) return false;
      try {
        const decoded = decodeEventLog({ abi: paymentSettledAbi, data: log.data, topics: log.topics });
        return decoded.eventName === "PaymentSettled" && decoded.args.paymentId.toLowerCase() === expected.paymentId.toLowerCase() &&
          sameAddress(decoded.args.payer, expected.payer) && sameAddress(decoded.args.beneficiary, expected.beneficiary) &&
          decoded.args.amount === expected.amount;
      } catch { return false; }
    });
    return matched
      ? { status: "confirmed", chainId: L2_CHAIN_ID, transactionHash: hash, blockNumber: receipt.blockNumber }
      : { status: "unavailable", chainId: L2_CHAIN_ID, transactionHash: hash, reason: "PaymentSettled event does not match expected payment" };
  }

  async verifyL2PaymentCreated(hash: Hash, expected: { paymentId: Hash; payer: Address; beneficiary: Address; amount: bigint; termsHash: Hash }): Promise<VerificationResult> {
    const l2 = await this.checkedReceipt(this.config.l2Client, L2_CHAIN_ID, hash);
    if (isVerificationResult(l2)) return l2;
    const receipt = l2;
    if (receipt.status === "reverted") return { status: "reverted", chainId: L2_CHAIN_ID, transactionHash: hash, blockNumber: receipt.blockNumber };
    if (!sameAddress(receipt.from, expected.payer) || !sameAddress(receipt.to, this.config.paymentRegistryAddress)) {
      return { status: "unavailable", chainId: L2_CHAIN_ID, transactionHash: hash, reason: "Registry transaction does not match payer or registry" };
    }
    const matched = receipt.logs.some((log) => {
      if (!sameAddress(log.address, this.config.paymentRegistryAddress)) return false;
      try {
        const decoded = decodeEventLog({ abi: paymentCreatedAbi, data: log.data, topics: log.topics });
        return decoded.eventName === "PaymentCreated" && decoded.args.paymentId.toLowerCase() === expected.paymentId.toLowerCase() &&
          sameAddress(decoded.args.payer, expected.payer) && sameAddress(decoded.args.beneficiary, expected.beneficiary) &&
          decoded.args.amount === expected.amount && decoded.args.termsHash.toLowerCase() === expected.termsHash.toLowerCase();
      } catch { return false; }
    });
    return matched
      ? { status: "confirmed", chainId: L2_CHAIN_ID, transactionHash: hash, blockNumber: receipt.blockNumber }
      : { status: "unavailable", chainId: L2_CHAIN_ID, transactionHash: hash, reason: "PaymentCreated event does not match expected payment" };
  }

  async verifyL2PaymentApproved(hash: Hash, expected: { paymentId: Hash; payer: Address }): Promise<VerificationResult> {
    const l2 = await this.checkedReceipt(this.config.l2Client, L2_CHAIN_ID, hash);
    if (isVerificationResult(l2)) return l2;
    const receipt = l2;
    if (receipt.status === "reverted") return { status: "reverted", chainId: L2_CHAIN_ID, transactionHash: hash, blockNumber: receipt.blockNumber };
    if (!sameAddress(receipt.from, expected.payer) || !sameAddress(receipt.to, this.config.paymentRegistryAddress)) {
      return { status: "unavailable", chainId: L2_CHAIN_ID, transactionHash: hash, reason: "Registry transaction does not match payer or registry" };
    }
    const matched = receipt.logs.some((log) => {
      if (!sameAddress(log.address, this.config.paymentRegistryAddress)) return false;
      try {
        const decoded = decodeEventLog({ abi: paymentApprovedAbi, data: log.data, topics: log.topics });
        return decoded.eventName === "PaymentApproved" && decoded.args.paymentId.toLowerCase() === expected.paymentId.toLowerCase() &&
          sameAddress(decoded.args.payer, expected.payer);
      } catch { return false; }
    });
    return matched
      ? { status: "confirmed", chainId: L2_CHAIN_ID, transactionHash: hash, blockNumber: receipt.blockNumber }
      : { status: "unavailable", chainId: L2_CHAIN_ID, transactionHash: hash, reason: "PaymentApproved event does not match expected payment" };
  }

  async verifyL2Allowance(hash: Hash, expected: { owner: Address; spender: Address; amount: bigint }): Promise<VerificationResult> {
    const l2 = await this.checkedReceipt(this.config.l2Client, L2_CHAIN_ID, hash);
    if (isVerificationResult(l2)) return l2;
    const receipt = l2 as TransactionReceipt;
    if (receipt.status === "reverted") return { status: "reverted", chainId: L2_CHAIN_ID, transactionHash: hash, blockNumber: receipt.blockNumber };
    if (!sameAddress(receipt.from, expected.owner) || !sameAddress(receipt.to, this.config.mockUsdAddress)) {
      return { status: "unavailable", chainId: L2_CHAIN_ID, transactionHash: hash, reason: "MockUSD approval transaction does not match owner or token" };
    }
    const matched = receipt.logs.some((log) => {
      if (!sameAddress(log.address, this.config.mockUsdAddress)) return false;
      try {
        const decoded = decodeEventLog({ abi: approvalAbi, data: log.data, topics: log.topics });
        return decoded.eventName === "Approval" && sameAddress(decoded.args.owner, expected.owner) &&
          sameAddress(decoded.args.spender, expected.spender) && decoded.args.value === expected.amount;
      } catch { return false; }
    });
    return matched
      ? { status: "confirmed", chainId: L2_CHAIN_ID, transactionHash: hash, blockNumber: receipt.blockNumber }
      : { status: "unavailable", chainId: L2_CHAIN_ID, transactionHash: hash, reason: "MockUSD Approval event does not match expected allowance" };
  }
}
