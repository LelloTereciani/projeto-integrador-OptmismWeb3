import { randomBytes, randomUUID } from "node:crypto";

import type {
  CreatePaymentInput,
  PaymentScenario,
  TransactionEvidence,
  TransactionStage,
  TransactionStatus,
} from "@payment-demo/shared";
import { and, asc, eq } from "drizzle-orm";
import { keccak256, toBytes } from "viem";

import {
  FICTIONAL_PAYMENT_FEE_BPS,
  FIXED_BRL_PER_MOCK_USD_RATE_BPS,
  QUOTE_SIMULATION_LABEL,
} from "../config";
import { calculateQuote } from "../quote";
import {
  createPaymentDatabase,
  paymentScenarios,
  paymentTransactions,
  type PaymentDatabase,
} from "./db";
import { validateCreatePaymentInput } from "./payment-validator";

const SCENARIO_TYPE = "fictional-testnet" as const;

export interface PaymentService {
  createScenario(input: CreatePaymentInput): PaymentScenario;
  approveCommercial(id: string): PaymentScenario;
  getScenario(id: string): PaymentScenario;
}

function centsFromFormattedAmount(value: string): bigint {
  return BigInt(value.replace(".", ""));
}

function formatStoredDecimal(value: string, decimals: number): string {
  const padded = value.padStart(decimals + 1, "0");
  return `${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`;
}

function canonicalTermsHash(input: {
  payer: string;
  beneficiary: string;
  brlAmountCents: bigint;
  feeAmountCents: bigint;
  mockUsdAmount: bigint;
}): `0x${string}` {
  const canonicalTerms = JSON.stringify({
    version: 1,
    scenarioType: SCENARIO_TYPE,
    payer: input.payer.toLowerCase(),
    beneficiary: input.beneficiary.toLowerCase(),
    brlAmountCents: input.brlAmountCents.toString(),
    rateBps: FIXED_BRL_PER_MOCK_USD_RATE_BPS.toString(),
    feeBps: FICTIONAL_PAYMENT_FEE_BPS.toString(),
    feeAmountCents: input.feeAmountCents.toString(),
    mockUsdAmount: input.mockUsdAmount.toString(),
  });
  return keccak256(toBytes(canonicalTerms));
}

function transactionFromRow(row: typeof paymentTransactions.$inferSelect): TransactionEvidence {
  const base = {
    hash: row.transactionHash as `0x${string}`,
    status: row.status as TransactionStatus,
    ...(row.blockNumber === null ? {} : { blockNumber: row.blockNumber }),
  };

  if (row.stage === "l1-deposit" && row.chainId === 11155111) {
    return { ...base, stage: "l1-deposit", chainId: 11155111 };
  }
  if (row.stage !== "l1-deposit" && row.chainId === 11155420) {
    return {
      ...base,
      stage: row.stage as Exclude<TransactionStage, "l1-deposit">,
      chainId: 11155420,
    };
  }
  throw new Error("Stored transaction has an invalid stage and chain combination");
}

export function createPaymentService(database: PaymentDatabase): PaymentService {
  function getScenario(id: string): PaymentScenario {
    const row = database.orm.select().from(paymentScenarios).where(eq(paymentScenarios.id, id)).get();
    if (!row) {
      throw new Error(`Payment scenario not found: ${id}`);
    }

    const metadata = JSON.parse(row.fictionalMetadata) as { scenarioType?: unknown };
    if (metadata.scenarioType !== SCENARIO_TYPE) {
      throw new Error("Stored payment scenario is missing fictional metadata");
    }

    const transactions = database.orm
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.scenarioId, id))
      .orderBy(asc(paymentTransactions.id))
      .all()
      .map(transactionFromRow);

    return {
      id: row.id,
      paymentId: row.paymentId as `0x${string}`,
      termsHash: row.termsHash as `0x${string}`,
      stage: row.stage as PaymentScenario["stage"],
      scenarioType: SCENARIO_TYPE,
      payer: row.payerAddress as `0x${string}`,
      beneficiary: row.beneficiaryAddress as `0x${string}`,
      quote: {
        brlAmount: formatStoredDecimal(row.brlAmountCents, 2),
        mockUsdAmount: BigInt(row.mockUsdAmount),
        exchangeRate: `${formatStoredDecimal(row.rateBps, 4)} BRL per MockUSD`,
        feeAmount: formatStoredDecimal(row.feeAmountCents, 2),
        simulationLabel: QUOTE_SIMULATION_LABEL,
      },
      transactions,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.commerciallyApprovedAt === null
        ? {}
        : { commerciallyApprovedAt: row.commerciallyApprovedAt }),
    };
  }

  function createScenario(input: CreatePaymentInput): PaymentScenario {
    const validated = validateCreatePaymentInput(input);
    const quote = calculateQuote({ brlAmountCents: validated.brlAmountCents });
    const feeAmountCents = centsFromFormattedAmount(quote.feeAmount);
    const now = new Date().toISOString();
    const id = randomUUID();
    const paymentId = `0x${randomBytes(32).toString("hex")}` as const;
    const termsHash = canonicalTermsHash({
      payer: validated.payerAddress,
      beneficiary: validated.beneficiaryAddress,
      brlAmountCents: validated.brlAmountCents,
      feeAmountCents,
      mockUsdAmount: quote.mockUsdAmount,
    });

    database.orm
      .insert(paymentScenarios)
      .values({
        id,
        paymentId,
        stage: "quoted",
        payerAddress: validated.payerAddress,
        beneficiaryAddress: validated.beneficiaryAddress,
        brlAmountCents: validated.brlAmountCents.toString(),
        rateBps: FIXED_BRL_PER_MOCK_USD_RATE_BPS.toString(),
        feeBps: FICTIONAL_PAYMENT_FEE_BPS.toString(),
        feeAmountCents: feeAmountCents.toString(),
        mockUsdAmount: quote.mockUsdAmount.toString(),
        termsHash,
        fictionalMetadata: JSON.stringify({ scenarioType: SCENARIO_TYPE }),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return getScenario(id);
  }

  function approveCommercial(id: string): PaymentScenario {
    const now = new Date().toISOString();
    const result = database.orm
      .update(paymentScenarios)
      .set({
        stage: "commercially-approved",
        commerciallyApprovedAt: now,
        updatedAt: now,
      })
      .where(and(eq(paymentScenarios.id, id), eq(paymentScenarios.stage, "quoted")))
      .run();

    if (result.changes === 0) {
      const existing = database.orm
        .select({ stage: paymentScenarios.stage })
        .from(paymentScenarios)
        .where(eq(paymentScenarios.id, id))
        .get();
      if (!existing) {
        throw new Error(`Payment scenario not found: ${id}`);
      }
      throw new Error(`Payment scenario is already commercially approved or beyond: ${existing.stage}`);
    }
    return getScenario(id);
  }

  return { createScenario, approveCommercial, getScenario };
}

let defaultService: PaymentService | undefined;

function getDefaultService(): PaymentService {
  defaultService ??= createPaymentService(createPaymentDatabase());
  return defaultService;
}

export function createScenario(input: CreatePaymentInput): PaymentScenario {
  return getDefaultService().createScenario(input);
}

export function approveCommercial(id: string): PaymentScenario {
  return getDefaultService().approveCommercial(id);
}

export function getScenario(id: string): PaymentScenario {
  return getDefaultService().getScenario(id);
}
