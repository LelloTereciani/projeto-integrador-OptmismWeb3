"use client";

import { useEffect, useMemo, useState } from "react";

import type { PaymentScenario } from "../../../../packages/shared/src/payment";
import { InvoiceForm } from "../components/invoice-form";
import { PaymentStepper } from "../components/payment-stepper";
import { ProofCards } from "../components/proof-cards";
import { QuoteCard } from "../components/quote-card";
import { TransactionAction } from "../components/transaction-action";
import { WalletPanel } from "../components/wallet-panel";
import { usePaymentFlow } from "../features/payment/use-payment-flow";
import {
  buildConfirmationSummary,
  deserializeScenario,
  formatAtomicMockUsd,
  TESTNET_WARNING,
} from "../features/payment/ui-model";
import { getPaymentContracts } from "../lib/contracts";

export default function PaymentDemoPage() {
  const [scenario, setScenario] = useState<PaymentScenario | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const contracts = useMemo(() => getPaymentContracts(), []);
  const paymentFlow = usePaymentFlow(scenario, contracts);
  const action = paymentFlow.actions[0] ?? null;
  const settlementProof = scenario?.transactions.find((transaction) =>
    transaction.stage === "payment-settle" && transaction.status === "confirmed"
  );

  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("scenario");
    if (!id) return;

    const scenarioId = id;
    const controller = new AbortController();
    async function restoreScenario() {
      try {
        const response = await fetch(`/api/payments/${encodeURIComponent(scenarioId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Não foi possível recuperar o cenário salvo.");
        const body = (await response.json()) as unknown;
        setScenario(deserializeScenario(body));
      } catch (error) {
        if (!controller.signal.aborted) {
          setRestoreError(error instanceof Error ? error.message : "Não foi possível recuperar o cenário.");
        }
      }
    }

    void restoreScenario();
    return () => controller.abort();
  }, []);

  function activateScenario(created: PaymentScenario) {
    setRestoreError(null);
    setScenario(created);
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", created.id);
    window.history.replaceState(window.history.state, "", url);
  }

  async function approveCommercial() {
    if (!scenario || scenario.stage !== "quoted") return;

    setIsApproving(true);
    setApprovalError(null);
    try {
      const response = await fetch(`/api/payments/${scenario.id}/commercial-approval`, {
        method: "POST",
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: unknown }).error)
            : "Não foi possível registrar a aprovação.",
        );
      }
      setScenario(deserializeScenario(body));
    } catch (error) {
      setApprovalError(
        error instanceof Error ? error.message : "Não foi possível registrar a aprovação.",
      );
    } finally {
      setIsApproving(false);
    }
  }

  async function submitWalletAction() {
    const updated = await paymentFlow.submitAction();
    if (updated) setScenario(updated);
  }

  return (
    <>
      <div className="environment-banner" role="status">
        <span className="pulse-dot" aria-hidden="true" />
        <strong>{TESTNET_WARNING}</strong>
        <span>Ethereum Sepolia → OP Sepolia</span>
      </div>

      <header className="site-header">
        <a className="brand" href="#main-content" aria-label="Rollup Pay Demo — ir ao conteúdo">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>Rollup Pay <small>DEMO</small></span>
        </a>
        <WalletPanel />
      </header>

      <main id="main-content">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <span className="eyebrow">Pagamento internacional · protótipo testnet</span>
            <h1 id="page-title">Acompanhe cada prova, da L1 à liquidação fictícia.</h1>
            <p>
              Uma demonstração transparente de depósito em rollup e liquidação com MockUSD de
              teste. Cada rede, assinatura e confirmação permanece visível.
            </p>
          </div>
          <div className="route-visual" aria-label="Rota técnica do cenário">
            <div>
              <span className="route-index">L1</span>
              <strong>Ethereum Sepolia</strong>
              <small>Depósito de ETH de teste</small>
            </div>
            <span className="route-line" aria-hidden="true"><i /></span>
            <div>
              <span className="route-index">L2</span>
              <strong>OP Sepolia</strong>
              <small>Liquidação de MockUSD</small>
            </div>
          </div>
        </section>

        <div className="content-grid">
          <section className="panel form-panel" aria-labelledby="invoice-heading">
            <InvoiceForm onCreated={activateScenario} />
          </section>

          <aside className="panel trust-panel" aria-labelledby="trust-heading">
            <span className="eyebrow">Regras desta demonstração</span>
            <h2 id="trust-heading">Controle continua na carteira</h2>
            <ul className="trust-list">
              <li><span aria-hidden="true">01</span><p><strong>Sem custódia</strong>A aplicação nunca recebe chaves privadas.</p></li>
              <li><span aria-hidden="true">02</span><p><strong>Sem mainnet</strong>Somente chain IDs 11155111 e 11155420.</p></li>
              <li><span aria-hidden="true">03</span><p><strong>Valor exato</strong>Nenhuma aprovação ilimitada de token.</p></li>
              <li><span aria-hidden="true">04</span><p><strong>Prova verificável</strong>Sucesso exige recibo e releitura do estado.</p></li>
            </ul>
            <p className="task-note" id="wallet-task-note">
              A carteira só abre depois de um clique explícito. Conta, rede, contrato e valor são
              revalidados após a simulação e imediatamente antes do envio.
            </p>
          </aside>
        </div>

        {scenario ? (
          <div className="scenario-workspace" aria-live="polite">
            <div className="scenario-identity">
              <span>Cenário fictício</span>
              <code>{scenario.id}</code>
            </div>

            <div className="scenario-grid">
              <QuoteCard
                scenario={scenario}
                isApproving={isApproving}
                onApprove={approveCommercial}
              />
              <PaymentStepper currentStage={scenario.stage} />
            </div>

            {approvalError ? (
              <div className="form-error workspace-error" role="alert">
                <strong>A aprovação não foi registrada.</strong>
                <span>{approvalError} O cenário e a cotação continuam disponíveis.</span>
              </div>
            ) : null}

            <section className="confirmation-summary" aria-labelledby="confirmation-heading">
              <div className="section-heading compact">
                <span className="eyebrow">
                  {scenario.stage === "payout-simulated" ? "Resumo da operação" : "Antes da assinatura"}
                </span>
                <h2 id="confirmation-heading">
                  {scenario.stage === "payout-simulated"
                    ? "Endereço, rede e valor da operação concluída"
                    : "Revise endereço, rede e valor completos"}
                </h2>
              </div>
              <dl>
                {buildConfirmationSummary(scenario).map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {action && action.type !== "approve-commercial" && action.type !== "none" ? (
              <TransactionAction
                action={action}
                actionState={paymentFlow.actionState}
                activeChainId={paymentFlow.activeChainId}
                contracts={contracts}
                scenario={scenario}
                onSubmit={() => void submitWalletAction()}
                onSwitchChain={(chainId) => void paymentFlow.switchChain(chainId)}
              />
            ) : null}

            {scenario.stage === "payout-simulated" ? (
              <section className="panel completion-card" aria-labelledby="completion-heading" role="status">
                <span className="eyebrow">Cenário concluído</span>
                <h2 id="completion-heading">MockUSD entregue à carteira beneficiária</h2>
                <p>
                  A operação transferiu {formatAtomicMockUsd(scenario.quote.mockUsdAmount)} MockUSD
                  de teste da carteira pagadora para <code>{scenario.beneficiary}</code> na OP Sepolia.
                </p>
                <p>
                  O depósito de ETH entre Sepolia e OP Sepolia demonstrou a ponte L1 → L2. Ele não
                  criou nem converteu MockUSD. O token foi emitido separadamente na OP Sepolia para
                  representar o pagamento fictício.
                </p>
                <p>
                  A beneficiária pode ver o token na carteira ao adicionar o contrato MockUSD
                  {contracts ? <> <code>{contracts.mockUsd}</code></> : null} na OP Sepolia. Não há
                  resgate, câmbio ou envio bancário neste MVP: a etapa de pagamento local foi
                  apenas simulada.
                </p>
                {settlementProof ? (
                  <a
                    href={`https://sepolia-optimism.etherscan.io/tx/${settlementProof.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver a transferência de MockUSD no explorador ↗
                  </a>
                ) : null}
              </section>
            ) : null}

            <ProofCards scenario={scenario} />
          </div>
        ) : (
          <section className="waiting-state" aria-labelledby="waiting-heading">
            <span className="waiting-icon" aria-hidden="true">↳</span>
            <div>
              <span className="eyebrow">Próxima etapa</span>
              <h2 id="waiting-heading">A cotação abre a linha de evidências</h2>
              <p>Depois do cálculo, você verá a sequência L1, L2 e payout local simulado.</p>
              {restoreError ? <p role="alert">{restoreError} Confira o ID na URL.</p> : null}
            </div>
          </section>
        )}
      </main>

      <footer>
        <strong>{TESTNET_WARNING}</strong>
        <span>MockUSD não é USDC, não é stablecoin e não possui valor monetário.</span>
      </footer>
    </>
  );
}
