import type { PaymentScenario, PaymentStage } from "../../../../packages/shared/src/payment";

interface PaymentStepperProps {
  scenario: PaymentScenario;
  useBridge: boolean;
}

const COMMON_STAGES: PaymentStage[] = [
  "created",
  "approved",
  "token-approved",
  "settlement-submitted",
  "settled",
  "payout-simulated",
];

export function PaymentStepper({ scenario, useBridge }: PaymentStepperProps) {
  const bridgeRoute = useBridge || scenario.transactions.some((transaction) => transaction.stage === "l1-deposit") ||
    ["l1-submitted", "l2-credit-pending", "l2-credited"].includes(scenario.stage);
  const stageOrder: PaymentStage[] = [
    "quoted",
    "commercially-approved",
    ...(bridgeRoute
      ? ["l1-submitted", "l2-credit-pending", "l2-credited"] as PaymentStage[]
      : ["l2-ready"] as PaymentStage[]),
    ...COMMON_STAGES,
  ];
  const steps = [
    { key: "quoted" as const, group: "Simulação", title: "Cotação fictícia", detail: "Calculada e revisada fora da blockchain" },
    { key: "commercially-approved" as const, group: "Decisão", title: "Aprovação comercial", detail: "Confirmação do cenário, sem assinatura" },
    ...(bridgeRoute
      ? [
          { key: "l1-submitted" as const, group: "L1 · Ethereum Sepolia", title: "Depósito enviado", detail: "Recibo L1 separado do crédito L2" },
          { key: "l2-credited" as const, group: "L2 · OP Sepolia", title: "Crédito confirmado", detail: "Relay verificado antes de liberar ações L2" },
        ]
      : [{ key: "l2-ready" as const, group: "L2 · OP Sepolia", title: "Saldo L2 conferido", detail: "MockUSD disponível e ETH de teste para gas" }]),
    { key: "token-approved" as const, group: "L2 · OP Sepolia", title: "Operação preparada", detail: "Registro e aprovação exata de MockUSD" },
    { key: "settled" as const, group: "L2 · OP Sepolia", title: "Liquidação confirmada", detail: "Recibo e evento PaymentSettled verificados" },
    { key: "payout-simulated" as const, group: "Aplicação", title: "Payout local simulado", detail: "Representação fictícia após confirmação L2" },
  ];
  const normalizedStage = scenario.stage === "draft" ? "quoted"
    : scenario.stage === "l2-credit-pending" ? "l1-submitted"
    : scenario.stage === "created" || scenario.stage === "approved"
      ? bridgeRoute ? "l2-credited" : "l2-ready"
      : scenario.stage === "settlement-submitted" ? "token-approved"
      : scenario.stage;
  const currentIndex = stageOrder.indexOf(normalizedStage);

  return (
    <section className="stepper-card" aria-labelledby="progress-heading">
      <div className="section-heading compact">
        <span className="eyebrow">03 · Progresso verificável</span>
        <h2 id="progress-heading">Uma etapa só libera a próxima</h2>
      </div>
      <ol className="payment-stepper">
        {steps.map((step, index) => {
          const stepIndex = stageOrder.indexOf(step.key);
          const state = stepIndex < currentIndex ? "complete" : stepIndex === currentIndex ? "current" : "upcoming";
          return (
            <li className={`step step-${state}`} key={step.key} aria-current={state === "current" ? "step" : undefined}>
              <span className="step-marker" aria-hidden="true">
                {state === "complete" ? "✓" : String(index + 1).padStart(2, "0")}
              </span>
              <div className="step-body">
                <span className="step-group">{step.group}</span>
                <strong className="step-title">{step.title}</strong>
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
