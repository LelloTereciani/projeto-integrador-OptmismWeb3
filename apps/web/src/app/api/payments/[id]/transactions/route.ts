import { z } from "zod";

import { errorResponse, scenarioResponse } from "../../../../../lib/server/http";
import { getTransactionService } from "../../../../../lib/server/runtime";

export const runtime = "nodejs";

const recordSchema = z.strictObject({
  stage: z.enum(["l1-deposit", "payment-create", "payment-approve", "token-approve", "payment-settle"]),
  chainId: z.union([z.literal(11155111), z.literal(11155420)]),
  hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params;
    const input = recordSchema.parse(await request.json());
    return scenarioResponse(getTransactionService().recordTransaction(id, input), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
