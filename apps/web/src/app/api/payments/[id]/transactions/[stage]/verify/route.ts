import { z } from "zod";

import { errorResponse, scenarioResponse } from "../../../../../../../lib/server/http";
import { getTransactionService } from "../../../../../../../lib/server/runtime";

export const runtime = "nodejs";

const stageSchema = z.enum(["l1-deposit", "payment-create", "payment-approve", "token-approve", "payment-settle"]);

export async function POST(_request: Request, context: { params: Promise<{ id: string; stage: string }> }): Promise<Response> {
  try {
    const { id, stage } = await context.params;
    return scenarioResponse(await getTransactionService().verifyTransaction(id, stageSchema.parse(stage)));
  } catch (error) {
    return errorResponse(error);
  }
}
