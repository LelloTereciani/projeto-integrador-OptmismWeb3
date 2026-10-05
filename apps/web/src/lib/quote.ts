import type { Quote } from "../../../../packages/shared/src/payment";

import {
  FICTIONAL_PAYMENT_FEE_BPS,
  FIXED_BRL_PER_MOCK_USD_RATE_BPS,
  QUOTE_SIMULATION_LABEL,
} from "./config";

const BASIS_POINTS_SCALE = 10_000n;
const BRL_CENTS_PER_UNIT = 100n;
const MOCK_USD_ATOMIC_SCALE = 1_000_000n;

export interface QuoteCalculationInput {
  brlAmountCents: bigint;
}

function divideRoundingUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function formatDecimal(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0");
  return `${whole}.${fraction}`;
}

export function calculateQuote(input: QuoteCalculationInput): Quote {
  if (typeof input.brlAmountCents !== "bigint") {
    throw new TypeError("BRL amount must use integer cents as bigint");
  }

  const feeAmountCents = divideRoundingUp(
    input.brlAmountCents * FICTIONAL_PAYMENT_FEE_BPS,
    BASIS_POINTS_SCALE,
  );
  const netBrlAmountCents = input.brlAmountCents - feeAmountCents;
  const mockUsdAmount =
    (netBrlAmountCents * BASIS_POINTS_SCALE * MOCK_USD_ATOMIC_SCALE) /
    (BRL_CENTS_PER_UNIT * FIXED_BRL_PER_MOCK_USD_RATE_BPS);

  if (mockUsdAmount <= 0n) {
    throw new RangeError("BRL amount must produce a positive MockUSD quote after the fee");
  }

  return {
    brlAmount: formatDecimal(input.brlAmountCents, 2),
    mockUsdAmount,
    exchangeRate: `${formatDecimal(FIXED_BRL_PER_MOCK_USD_RATE_BPS, 4)} BRL per MockUSD`,
    feeAmount: formatDecimal(feeAmountCents, 2),
    simulationLabel: QUOTE_SIMULATION_LABEL,
  };
}
