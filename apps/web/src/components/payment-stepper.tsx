import type { PaymentStage } from "../../../../packages/shared/src/payment";

interface PaymentStepperProps {
  currentStage: PaymentStage;
}

const STAGE_ORDER: PaymentStage[] = [
  "quoted",
  "commercially-approved",
  "l1-submitted",
  "l2-credit-pending",
  "l2-credited",
  "created",
  "approved",
  "token-approved",
  "settlement-submitted",
  "settled",
  "payout-simulated",
];

const STEPS = [
  {
    key: "quoted" as const,
    group: "Simulação",
    title: "Cotação fictícia",
    detail: "Calculada e revisada fora da blockchain",
  },
  {
    key: "commercially-approved" as const,
    group: "Decisão",
    title: "Aprovação comercial",
    detail: "Confirmação do cenário, sem assinatura",
  },
  {
    key: "l1-submitted" as const,
    group: "L1 · Ethereum Sepolia",
    title: "Depósito enviado",
    detail: "Recibo L1 separado do crédito L2",
  },
  {
    key: "l2-credited" as const,
    group: "L2 · OP Sepolia",
    title: "Crédito confirmado",
    detail: "Relay verificado antes de liberar ações L2",
  },
  {
    key: "token-approved" as const,
    group: "L2 · OP Sepolia",
    title: "Operação preparada",
    detail: "Registro e aprovação exata de MockUSD",
  },
  {
    key: "settled" as const,
    group: "L2 · OP Sepolia",
    title: "Liquidação confirmada",
    detail: "Recibo e evento PaymentSettled verificados",
  },
  {
    key: "payout-simulated" as const,
    group: "Aplicação",
    title: "Payout local simulado",
    detail: "Representação fictícia após confirmação L2",
  },
];

function normalizedStage(stage: PaymentStage): PaymentStage {
  if (stage === "draft") return "quoted";
  if (stage === "l2-credit-pending") return "l1-submitted";
  if (stage === "created" || stage === "approved") return "l2-credited";
  if (stage === "settlement-submitted") return "token-approved";
  return stage;
}

export function PaymentStepper({ currentStage }: PaymentStepperProps) {
  const normalized = normalizedStage(currentStage);
  const currentIndex = STAGE_ORDER.indexOf(normalized);

  return (
    <section className="stepper-card" aria-labelledby="progress-heading">
      <div className="section-heading compact">
        <span className="eyebrow">03 · Progresso verificável</span>
        <h2 id="progress-heading">Uma etapa só libera a próxima</h2>
      </div>
      <ol className="payment-stepper">
        {STEPS.map((step) => {
          const stepIndex = STAGE_ORDER.indexOf(step.key);
          const state = stepIndex < currentIndex ? "complete" : stepIndex === currentIndex ? "current" : "upcoming";
          return (
            <li className={`step step-${state}`} key={step.key} aria-current={state === "current" ? "step" : undefined}>
              <span className="step-marker" aria-hidden="true">
                {state === "complete" ? "✓" : String(STEPS.indexOf(step) + 1).padStart(2, "0")}
              </span>
              <div>
                <span className="step-group">{step.group}</span>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
                <span className="step-state">
                  {state === "complete" ? "Confirmada" : state === "current" ? "Etapa atual" : "Bloqueada"}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
