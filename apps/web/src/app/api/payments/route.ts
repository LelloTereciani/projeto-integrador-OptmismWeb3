import { z } from "zod";

import { FICTIONAL_PAYMENT_FEE_BPS, FIXED_BRL_PER_MOCK_USD_RATE_BPS } from "../../../lib/config";
import { errorResponse, scenarioResponse } from "../../../lib/server/http";
import { paymentService } from "../../../lib/server/runtime";

export const runtime = "nodejs";

const createSchema = z.strictObject({
  payerAddress: z.string(),
  beneficiaryAddress: z.string(),
  brlAmountCents: z.string().regex(/^[1-9]\d{0,17}$/),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const input = createSchema.parse(await request.json());
    const scenario = paymentService.createScenario({
      payerAddress: input.payerAddress,
      beneficiaryAddress: input.beneficiaryAddress,
      brlAmountCents: BigInt(input.brlAmountCents),
      quotedRateBps: FIXED_BRL_PER_MOCK_USD_RATE_BPS,
      feeBps: FICTIONAL_PAYMENT_FEE_BPS,
    });
    return scenarioResponse(scenario, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
