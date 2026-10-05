import { errorResponse, scenarioResponse } from "../../../../../lib/server/http";
import { getTransactionService } from "../../../../../lib/server/runtime";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params;
    return scenarioResponse(getTransactionService().simulatePayout(id));
  } catch (error) {
    return errorResponse(error);
  }
}
