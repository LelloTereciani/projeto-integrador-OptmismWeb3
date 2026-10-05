import type { PaymentScenario } from "../../../../packages/shared/src/payment";

import { formatAtomicMockUsd, TESTNET_WARNING } from "../features/payment/ui-model";

interface QuoteCardProps {
  scenario: PaymentScenario;
  isApproving: boolean;
  onApprove(): void;
}

export function QuoteCard({ scenario, isApproving, onApprove }: QuoteCardProps) {
  return (
    <section className="quote-card" aria-labelledby="quote-heading">
      <div className="quote-card-topline">
        <span className="eyebrow">02 · Cotação simulada</span>
        <span className="status-chip status-ready">Pronta para revisar</span>
      </div>
      <h2 id="quote-heading">Resumo antes de qualquer assinatura</h2>

      <div className="quote-amount">
        <span>Beneficiário receberia</span>
        <strong>{formatAtomicMockUsd(scenario.quote.mockUsdAmount)} MockUSD</strong>
        <small>Token de teste, sem valor monetário</small>
      </div>

      <dl className="quote-breakdown">
        <div>
          <dt>Valor fictício</dt>
          <dd>R$ {scenario.quote.brlAmount}</dd>
        </div>
        <div>
          <dt>Taxa fixa simulada</dt>
          <dd>{scenario.quote.exchangeRate}</dd>
        </div>
        <div>
          <dt>Tarifa fictícia</dt>
          <dd>R$ {scenario.quote.feeAmount}</dd>
        </div>
      </dl>

      <div className="address-summary">
        <span>Carteira beneficiária completa</span>
        <code>{scenario.beneficiary}</code>
      </div>

      <p className="inline-warning">
        <span aria-hidden="true">◆</span> {TESTNET_WARNING}. Aprovar aqui confirma somente o cenário
        comercial fictício e não abre a carteira.
      </p>

      {scenario.stage === "quoted" ? (
        <button
          className="button button-primary"
          type="button"
          onClick={onApprove}
          disabled={isApproving}
        >
          {isApproving ? "Registrando aprovação…" : "Aprovar cenário fictício"}
        </button>
      ) : (
        <span className="approval-confirmed" role="status">
          <span aria-hidden="true">✓</span> Cenário aprovado comercialmente
        </span>
      )}
    </section>
  );
}
