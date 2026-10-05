import { ZodError } from "zod";

import { TestnetConfigurationError } from "./runtime";

export function scenarioResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ZodError || error instanceof TypeError || error instanceof RangeError) {
    return scenarioResponse({ error: "Dados inválidos para a demonstração em testnet." }, 400);
  }
  if (error instanceof TestnetConfigurationError) return scenarioResponse({ error: error.message }, 503);
  if (error instanceof Error && error.message.startsWith("Payment scenario not found")) {
    return scenarioResponse({ error: "Cenário não encontrado." }, 404);
  }
  if (error instanceof Error && /Cannot submit|already has|already commercially approved|Only a confirmed|No submitted/.test(error.message)) {
    return scenarioResponse({ error: "A etapa não está disponível no estado atual do cenário." }, 409);
  }
  return scenarioResponse({ error: "Não foi possível concluir a operação. Tente novamente." }, 500);
}
