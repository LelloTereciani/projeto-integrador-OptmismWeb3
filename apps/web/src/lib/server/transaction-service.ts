import type { PaymentScenario, TransactionStage, TransactionStatus } from "@payment-demo/shared";
import { and, desc, eq } from "drizzle-orm";
import { isAddressEqual, type Address, type Hash } from "viem";

import { paymentScenarios, paymentTransactions, type PaymentDatabase } from "./db";
import type { PaymentService } from "./payment-service";
import type { VerificationResult } from "./optimism-adapter";

export const L1_DEPOSIT_AMOUNT_WEI = 100_000_000_000_000n;

type RegistryPayment = {
  payer: Address;
  beneficiary: Address;
  amount: bigint;
  termsHash: Hash;
  state: number;
};

export interface PaymentChainVerifier {
  verifyL1Deposit(hash: Hash, payer: Address, expectedAmountWei: bigint): Promise<VerificationResult>;
  verifyL2PaymentCreated(hash: Hash, expected: { paymentId: Hash; payer: Address; beneficiary: Address; amount: bigint; termsHash: Hash }): Promise<VerificationResult>;
  verifyL2PaymentApproved(hash: Hash, expected: { paymentId: Hash; payer: Address }): Promise<VerificationResult>;
  verifyL2Allowance(hash: Hash, expected: { owner: Address; spender: Address; amount: bigint }): Promise<VerificationResult>;
  verifyL2PaymentEvent(hash: Hash, expected: { paymentId: Hash; payer: Address; beneficiary: Address; amount: bigint }): Promise<VerificationResult>;
  readRegistryPayment(paymentId: Hash): Promise<RegistryPayment>;
  readAllowance(owner: Address, spender: Address): Promise<bigint>;
  readTokenBalance(owner: Address): Promise<bigint>;
  readEthBalance(owner: Address): Promise<bigint>;
  registryAddress: Address;
}

const REQUIRED_STAGE = {
  "l1-deposit": "commercially-approved",
  "payment-create": "l2-credited",
  "payment-approve": "created",
  "token-approve": "approved",
  "payment-settle": "token-approved",
} as const;

type UserSubmittedStage = keyof typeof REQUIRED_STAGE;

const NEXT_STAGE = {
  "payment-create": "created",
  "payment-approve": "approved",
  "token-approve": "token-approved",
  "payment-settle": "settled",
} as const;

function isHash(value: string): value is Hash {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function matchesRegistryPayment(observed: RegistryPayment, scenario: PaymentScenario, requiredState: number): boolean {
  return isAddressEqual(observed.payer, scenario.payer) &&
    isAddressEqual(observed.beneficiary, scenario.beneficiary) &&
    observed.amount === scenario.quote.mockUsdAmount &&
    observed.termsHash.toLowerCase() === scenario.termsHash.toLowerCase() &&
    observed.state >= requiredState;
}

export class TransactionService {
  constructor(
    private readonly database: PaymentDatabase,
    private readonly payments: PaymentService,
    private readonly verifier: PaymentChainVerifier,
  ) {}

  async useExistingL2Balance(id: string): Promise<PaymentScenario> {
    const scenario = this.payments.getScenario(id);
    if (scenario.stage !== "commercially-approved") {
      throw new Error(`Cannot use existing L2 balance while scenario is ${scenario.stage}`);
    }
    const [tokenBalance, ethBalance] = await Promise.all([
      this.verifier.readTokenBalance(scenario.payer),
      this.verifier.readEthBalance(scenario.payer),
    ]);
    if (tokenBalance < scenario.quote.mockUsdAmount) {
      throw new Error("Insufficient MockUSD balance on OP Sepolia for this quote");
    }
    if (ethBalance <= 0n) {
      throw new Error("Insufficient OP Sepolia ETH for transaction gas");
    }
    const changed = this.database.orm.update(paymentScenarios)
      .set({ stage: "l2-ready", updatedAt: new Date().toISOString() })
      .where(and(eq(paymentScenarios.id, id), eq(paymentScenarios.stage, "commercially-approved")))
      .run();
    if (changed.changes !== 1) {
      throw new Error("Cannot use existing L2 balance after another funding action started");
    }
    return this.payments.getScenario(id);
  }

  recordTransaction(id: string, input: { stage: TransactionStage; chainId: number; hash: string }): PaymentScenario {
    const scenario = this.payments.getScenario(id);
    if (input.stage === "l2-deposit-credit" || !(input.stage in REQUIRED_STAGE)) {
      throw new TypeError("Only wallet-submitted transaction stages can be recorded");
    }
    if (!isHash(input.hash)) throw new TypeError("Transaction hash must be 32 bytes in hex");
    const stage = input.stage as UserSubmittedStage;
    const expectedChainId = stage === "l1-deposit" ? 11155111 : 11155420;
    if (input.chainId !== expectedChainId) throw new TypeError(`Expected chain ID ${expectedChainId} for ${stage}`);

    const previous = this.database.orm.select().from(paymentTransactions)
      .where(and(eq(paymentTransactions.scenarioId, id), eq(paymentTransactions.stage, stage)))
      .orderBy(desc(paymentTransactions.id)).get();
    if (previous && previous.transactionHash.toLowerCase() === input.hash.toLowerCase()) return scenario;
    if (scenario.stage !== REQUIRED_STAGE[stage] && !(stage === "payment-create" && scenario.stage === "l2-ready")) {
      throw new Error(`Cannot submit ${stage} while scenario is ${scenario.stage}`);
    }
    if (previous && previous.status !== "reverted") {
      throw new Error(`${stage} already has an active transaction`);
    }
    if (stage === "l1-deposit") {
      const reused = this.database.orm.select().from(paymentTransactions)
        .where(and(eq(paymentTransactions.stage, "l1-deposit"), eq(paymentTransactions.transactionHash, input.hash.toLowerCase())))
        .get();
      if (reused && reused.scenarioId !== id) throw new Error("Deposit hash is already associated with another scenario");
    }

    const now = new Date().toISOString();
    this.database.orm.insert(paymentTransactions).values({
      scenarioId: id,
      stage,
      chainId: input.chainId,
      transactionHash: input.hash.toLowerCase(),
      status: "submitted",
      observedAt: now,
    }).run();
    if (stage === "l1-deposit" || stage === "payment-settle") {
      this.database.orm.update(paymentScenarios).set({
        stage: stage === "l1-deposit" ? "l1-submitted" : "settlement-submitted",
        updatedAt: now,
      }).where(eq(paymentScenarios.id, id)).run();
    }
    return this.payments.getScenario(id);
  }

  private setTransaction(id: number, status: TransactionStatus, blockNumber?: bigint): void {
    this.database.orm.update(paymentTransactions).set({
      status,
      blockNumber: blockNumber === undefined ? null : blockNumber.toString(),
      observedAt: new Date().toISOString(),
    }).where(eq(paymentTransactions.id, id)).run();
  }

  private setStage(id: string, stage: PaymentScenario["stage"]): void {
    this.database.orm.update(paymentScenarios).set({ stage, updatedAt: new Date().toISOString() })
      .where(eq(paymentScenarios.id, id)).run();
  }

  async verifyTransaction(id: string, stage: TransactionStage): Promise<PaymentScenario> {
    const scenario = this.payments.getScenario(id);
    if (stage === "l2-deposit-credit" || !(stage in REQUIRED_STAGE)) {
      throw new TypeError("Verify the original wallet transaction stage");
    }
    const transaction = this.database.orm.select().from(paymentTransactions)
      .where(and(eq(paymentTransactions.scenarioId, id), eq(paymentTransactions.stage, stage)))
      .orderBy(desc(paymentTransactions.id)).get();
    if (!transaction) throw new Error(`No submitted transaction for ${stage}`);
    if (transaction.status === "reverted") return scenario;
    if (transaction.status === "confirmed" && stage !== "l1-deposit") return scenario;
    if (transaction.status === "confirmed" && stage === "l1-deposit" &&
      scenario.stage !== "l1-submitted" && scenario.stage !== "l2-credit-pending") return scenario;

    const hash = transaction.transactionHash as Hash;
    let result: VerificationResult;
    if (stage === "l1-deposit") {
      result = await this.verifier.verifyL1Deposit(hash, scenario.payer, L1_DEPOSIT_AMOUNT_WEI);
      if (result.status === "pending" && result.chainId === 11155111) {
        this.setTransaction(transaction.id, "pending");
        return this.payments.getScenario(id);
      }
      if (result.chainId === 11155420 && result.l2TransactionHash) {
        this.setTransaction(transaction.id, "confirmed");
        const credit = this.database.orm.select().from(paymentTransactions)
          .where(and(eq(paymentTransactions.scenarioId, id), eq(paymentTransactions.stage, "l2-deposit-credit")))
          .get();
        if (!credit) {
          this.database.orm.insert(paymentTransactions).values({
            scenarioId: id,
            stage: "l2-deposit-credit",
            chainId: 11155420,
            transactionHash: result.l2TransactionHash.toLowerCase(),
            status: result.status,
            blockNumber: result.status === "confirmed" ? result.blockNumber?.toString() : undefined,
            observedAt: new Date().toISOString(),
          }).run();
        } else {
          this.setTransaction(credit.id, result.status, result.blockNumber);
        }
        this.setStage(id, result.status === "confirmed" ? "l2-credited" : "l2-credit-pending");
        return this.payments.getScenario(id);
      }
    } else if (stage === "payment-create") {
      result = await this.verifier.verifyL2PaymentCreated(hash, {
        paymentId: scenario.paymentId,
        payer: scenario.payer,
        beneficiary: scenario.beneficiary,
        amount: scenario.quote.mockUsdAmount,
        termsHash: scenario.termsHash,
      });
    } else if (stage === "payment-approve") {
      result = await this.verifier.verifyL2PaymentApproved(hash, { paymentId: scenario.paymentId, payer: scenario.payer });
    } else if (stage === "token-approve") {
      result = await this.verifier.verifyL2Allowance(hash, {
        owner: scenario.payer,
        spender: this.verifier.registryAddress,
        amount: scenario.quote.mockUsdAmount,
      });
    } else {
      result = await this.verifier.verifyL2PaymentEvent(hash, {
        paymentId: scenario.paymentId,
        payer: scenario.payer,
        beneficiary: scenario.beneficiary,
        amount: scenario.quote.mockUsdAmount,
      });
    }

    if (result.status === "confirmed" && stage !== "l1-deposit") {
      try {
        if (stage === "token-approve") {
          const allowance = await this.verifier.readAllowance(scenario.payer, this.verifier.registryAddress);
          if (allowance !== scenario.quote.mockUsdAmount) throw new Error("On-chain allowance is not the exact scenario amount");
        } else {
          const observed = await this.verifier.readRegistryPayment(scenario.paymentId);
          const requiredState = stage === "payment-create" ? 0 : stage === "payment-approve" ? 1 : 2;
          if (!matchesRegistryPayment(observed, scenario, requiredState)) throw new Error("On-chain registry state does not match the scenario");
        }
      } catch {
        this.setTransaction(transaction.id, "unavailable");
        return this.payments.getScenario(id);
      }
      this.setTransaction(transaction.id, "confirmed", result.blockNumber);
      this.setStage(id, NEXT_STAGE[stage]);
      return this.payments.getScenario(id);
    }
    this.setTransaction(transaction.id, result.status, result.blockNumber);
    if (result.status === "reverted" && stage !== "payment-create") this.setStage(id, REQUIRED_STAGE[stage]);
    return this.payments.getScenario(id);
  }

  simulatePayout(id: string): PaymentScenario {
    const scenario = this.payments.getScenario(id);
    if (scenario.stage !== "settled") throw new Error("Only a confirmed settlement can show simulated payout");
    this.setStage(id, "payout-simulated");
    return this.payments.getScenario(id);
  }
}
