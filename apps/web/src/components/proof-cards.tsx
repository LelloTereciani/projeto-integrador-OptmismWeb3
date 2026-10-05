import type { PaymentScenario } from "../../../../packages/shared/src/payment";

import { buildProofCards } from "../features/payment/ui-model";

interface ProofCardsProps {
  scenario: PaymentScenario;
}

export function ProofCards({ scenario }: ProofCardsProps) {
  const proofs = buildProofCards(scenario);

  return (
    <section className="proofs-section" aria-labelledby="proofs-heading">
      <div className="section-heading compact">
        <span className="eyebrow">04 · Provas técnicas</span>
        <h2 id="proofs-heading">Evidências on-chain do cenário</h2>
        <p>Hash enviado é diferente de confirmação. Cada card mantém rede, estado e prova juntos.</p>
      </div>

      {proofs.length === 0 ? (
        <div className="empty-proof">
          <span aria-hidden="true">◇</span>
          <div>
            <strong>Nenhuma transação enviada</strong>
            <p>Os links aparecerão somente depois que um hash conhecido for registrado.</p>
          </div>
        </div>
      ) : (
        <div className="proof-grid">
          {proofs.map((proof) => (
            <article className="proof-card" key={`${proof.chainId}-${proof.hash}`}>
              <div className="proof-card-header">
                <span className="status-chip">{proof.status}</span>
                <span>{proof.network}</span>
              </div>
              <h3>{proof.title}</h3>
              <dl>
                <div>
                  <dt>Chain ID</dt>
                  <dd>{proof.chainId}</dd>
                </div>
                {proof.blockNumber ? (
                  <div>
                    <dt>Bloco</dt>
                    <dd>{proof.blockNumber}</dd>
                  </div>
                ) : null}
              </dl>
              <code className="transaction-hash">{proof.hash}</code>
              <a href={proof.explorerUrl} target="_blank" rel="noreferrer">
                Abrir no explorador <span aria-hidden="true">↗</span>
                <span className="sr-only"> em nova aba</span>
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
