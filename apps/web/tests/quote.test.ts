import { describe, expect, it } from "vitest";

import { calculateQuote } from "../src/lib/quote";

describe("calculateQuote", () => {
  it("uses the server fixed rate and fee with exact integer arithmetic", () => {
    const quote = calculateQuote({ brlAmountCents: 10_000n });

    expect(quote).toEqual({
      brlAmount: "100.00",
      mockUsdAmount: 19_800_000n,
      exchangeRate: "5.0000 BRL per MockUSD",
      feeAmount: "1.00",
      simulationLabel: "Simulated fixed quote for a testnet demonstration; no real money",
    });
  });

  it("rounds the fee up to a cent and the converted amount down to atomic units", () => {
    expect(calculateQuote({ brlAmountCents: 102n })).toMatchObject({
      brlAmount: "1.02",
      feeAmount: "0.02",
      mockUsdAmount: 200_000n,
    });
  });

  it("calculates amounts beyond JavaScript safe integers without losing precision", () => {
    expect(calculateQuote({ brlAmountCents: 9_007_199_254_740_993n })).toEqual({
      brlAmount: "90071992547409.93",
      mockUsdAmount: 17_834_254_524_387_166_000n,
      exchangeRate: "5.0000 BRL per MockUSD",
      feeAmount: "900719925474.10",
      simulationLabel: "Simulated fixed quote for a testnet demonstration; no real money",
    });
  });

  it.each([0n, 1n, -1n])("rejects an amount that cannot produce a positive quote: %s", (amount) => {
    expect(() => calculateQuote({ brlAmountCents: amount })).toThrow(/positive mockusd/i);
  });

  it.each([100, 1.5, "100", Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects malformed currency input %j",
    (amount) => {
      expect(() => calculateQuote({ brlAmountCents: amount as never })).toThrow(/integer cents/i);
    },
  );
});
