import type { CreatePaymentInput } from "@payment-demo/shared";
import { getAddress, isAddress } from "viem";

const INPUT_FIELDS = new Set([
  "payerAddress",
  "beneficiaryAddress",
  "brlAmountCents",
  "quotedRateBps",
  "feeBps",
]);
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

export interface ValidatedPaymentInput extends CreatePaymentInput {
  payerAddress: `0x${string}`;
  beneficiaryAddress: `0x${string}`;
}

function validateAddress(value: unknown, field: string): `0x${string}` {
  if (typeof value !== "string" || !isAddress(value, { strict: true })) {
    throw new TypeError(`${field} must be a valid EVM address`);
  }

  const normalized = getAddress(value);
  if (normalized.toLowerCase() === ZERO_ADDRESS) {
    throw new RangeError(`${field} cannot use the zero address`);
  }
  return normalized;
}

export function validateCreatePaymentInput(input: unknown): ValidatedPaymentInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("Payment input must be an object");
  }

  const record = input as Record<string, unknown>;
  const unsupportedField = Object.keys(record).find((field) => !INPUT_FIELDS.has(field));
  if (unsupportedField) {
    throw new TypeError(`Unsupported payment input field: ${unsupportedField}`);
  }

  const payerAddress = validateAddress(record.payerAddress, "Payer address");
  const beneficiaryAddress = validateAddress(record.beneficiaryAddress, "Beneficiary address");
  if (payerAddress.toLowerCase() === beneficiaryAddress.toLowerCase()) {
    throw new RangeError("Payer and beneficiary wallets must be different");
  }

  for (const field of ["brlAmountCents", "quotedRateBps", "feeBps"] as const) {
    if (typeof record[field] !== "bigint") {
      throw new TypeError(`${field} must use bigint integer units`);
    }
  }

  return {
    payerAddress,
    beneficiaryAddress,
    brlAmountCents: record.brlAmountCents as bigint,
    quotedRateBps: record.quotedRateBps as bigint,
    feeBps: record.feeBps as bigint,
  };
}
