"use client";

import { readContract, watchAsset } from "@wagmi/core";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useConfig } from "wagmi";

import type { PaymentScenario } from "../../../../packages/shared/src/payment";
import type { InvoiceDraft } from "../features/payment/payment-types";
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
import { getPaymentContracts, mockUsdAbi } from "../lib/contracts";

export default function PaymentDemoPage() {
  const [scenario, setScenario] = useState<PaymentScenario | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [nextDraft, setNextDraft] = useState<InvoiceDraft | undefined>(undefined);
  const [formRevision, setFormRevision] = useState(0);
  const [tokenBalances, setTokenBalances] = useState<{ payer: bigint; beneficiary: bigint } | null>(null);
  const [tokenBalanceError, setTokenBalanceError] = useState<string | null>(null);
  const [tokenWalletMessage, setTokenWalletMessage] = useState<string | null>(null);
  const [payerTokenBalance, setPayerTokenBalance] = useState<bigint | null>(null);
  const config = useConfig();
  const walletAccount = useAccount();
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

  useEffect(() => {
    if (!scenario || !contracts || ["settled", "payout-simulated"].includes(scenario.stage)) {
      return;
    }
    let cancelled = false;
    void readContract(config, {
      address: contracts.mockUsd,
      abi: mockUsdAbi,
      functionName: "balanceOf",
      args: [scenario.payer],
      chainId: 11155420,
    }).then((balance) => {
      if (!cancelled) setPayerTokenBalance(balance);
    }).catch(() => {
      if (!cancelled) setPayerTokenBalance(null);
    });
    return () => { cancelled = true; };
  }, [config, contracts, scenario]);

  useEffect(() => {
    if (!scenario || !contracts || !["settled", "payout-simulated"].includes(scenario.stage)) {
      return;
    }
    let cancelled = false;
    void Promise.all([
      readContract(config, { address: contracts.mockUsd, abi: mockUsdAbi, functionName: "balanceOf", args: [scenario.payer], chainId: 11155420 }),
      readContract(config, { address: contracts.mockUsd, abi: mockUsdAbi, functionName: "balanceOf", args: [scenario.beneficiary], chainId: 11155420 }),
    ]).then(([payer, beneficiary]) => {
      if (!cancelled) setTokenBalances({ payer, beneficiary });
    }).catch(() => {
      if (!cancelled) setTokenBalanceError("A leitura do saldo L2 está indisponível. Confira o contrato no explorador ou tente recarregar.");
    });
    return () => { cancelled = true; };
  }, [config, contracts, scenario]);

  function activateScenario(created: PaymentScenario) {
    setRestoreError(null);
    setPayerTokenBalance(null);
    setTokenBalances(null);
    setTokenBalanceError(null);
    setScenario(created);
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", created.id);
    window.history.replaceState(window.history.state, "", url);
  }

  function startNewScenario(reverse = false) {
    if (reverse && scenario) {
      setNextDraft({
        payerAddress: scenario.beneficiary,
        beneficiaryAddress: scenario.payer,
        brlAmount: scenario.quote.brlAmount.replace(".", ","),
      });
    } else {
      setNextDraft(undefined);
    }
    setScenario(null);
    setApprovalError(null);
    setTokenWalletMessage(null);
    setPayerTokenBalance(null);
    setTokenBalances(null);
    setTokenBalanceError(null);
    setFormRevision((current) => current + 1);
    paymentFlow.setUseBridge(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("scenario");
    window.history.replaceState(window.history.state, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function addMockUsdToWallet() {
    if (!contracts || !walletAccount.isConnected || walletAccount.chainId !== 11155420) return;
    setTokenWalletMessage(null);
    try {
      const added = await watchAsset(config, {
        type: "ERC20",
        options: { address: contracts.mockUsd, symbol: "MUSD", decimals: 6 },
      });
      setTokenWalletMessage(added
        ? "MUSD adicionado à MetaMask. Selecione a conta beneficiária e a rede OP Sepolia para ver o saldo."
        : "A MetaMask não adicionou o token. Use o endereço do contrato abaixo para importá-lo manualmente.");
    } catch {
      setTokenWalletMessage("Não foi possível adicionar o token automaticamente. Importe o contrato abaixo na MetaMask.");
    }
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
        <span>OP Sepolia · depósito L1 opcional</span>
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
            <h1 id="page-title">Da cotação à transferência de MUSD na OP Sepolia.</h1>
            <p>
              Pague com saldo de teste já disponível na OP Sepolia, uma rede L2. Se quiser demonstrar
              a passagem L1 → L2, faça antes um depósito opcional de ETH pela Ethereum Sepolia. Cada
              assinatura e confirmação permanece visível.
            </p>
          </div>
          <div className="route-visual" aria-label="Rota técnica do cenário">
            <div>
              <span className="route-index">L1 · opcional</span>
              <strong>Ethereum Sepolia</strong>
              <small>Depósito de ETH de teste, se escolhido</small>
            </div>
            <span className="route-line" aria-hidden="true"><i /></span>
            <div>
              <span className="route-index">L2</span>
              <strong>OP Sepolia</strong>
              <small>Liquidação de MockUSD</small>
            </div>
          </div>
        </section>

        <section className="journey-guide" aria-labelledby="journey-heading">
          <span className="eyebrow">Como testar · envio e recebimento de MUSD</span>
          <h2 id="journey-heading">Siga a próxima ação mostrada na tela</h2>
          <ol>
            <li>Informe duas carteiras de teste e escolha um valor fictício em BRL que a pagadora possa cobrir com MUSD. Revise a cotação e aprove o cenário.</li>
            <li>Confira o saldo já existente na OP Sepolia. As duas contas usam essa L2 para enviar MUSD. O depósito de ETH pela Ethereum Sepolia é opcional e demonstra a passagem L1 → L2.</li>
            <li>Selecione na MetaMask a conta pagadora informada no cenário. Mantenha essa conta na OP Sepolia para criar, aprovar, autorizar o valor cotado e liquidar.</li>
            <li>Depois de liquidar, selecione a conta beneficiária na MetaMask para ver o MUSD recebido. Para pagar de volta, crie o pagamento inverso e use essa conta como nova pagadora.</li>
          </ol>
        </section>

        <div className="content-grid">
          <section className="panel form-panel" aria-labelledby="invoice-heading">
            {scenario ? (
              <div className="invoice-form">
                <div className="section-heading">
                  <span className="eyebrow">01 · Cenário em andamento</span>
                  <h2 id="invoice-heading">Fatura fictícia registrada</h2>
                  <p>Pagador: <code>{scenario.payer}</code></p>
                  <p>Beneficiário: <code>{scenario.beneficiary}</code></p>
                  <p>Valor: R$ {scenario.quote.brlAmount} → {formatAtomicMockUsd(scenario.quote.mockUsdAmount)} MUSD de teste</p>
                  <p>Para continuar depois, guarde o ID do cenário abaixo.</p>
                </div>
                <button className="button button-secondary" type="button" onClick={() => startNewScenario()}>
                  Criar outro cenário
                </button>
              </div>
            ) : (
              <InvoiceForm key={formRevision} initialDraft={nextDraft} onCreated={activateScenario} />
            )}
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
              <PaymentStepper scenario={scenario} useBridge={paymentFlow.useBridge} />
            </div>

            {!(["settled", "payout-simulated"].includes(scenario.stage)) && payerTokenBalance !== null && payerTokenBalance < scenario.quote.mockUsdAmount ? (
              <div className="form-error workspace-error" role="alert">
                <strong>Saldo de MUSD insuficiente para esta cotação.</strong>
                <span>Disponível na pagadora na OP Sepolia: {formatAtomicMockUsd(payerTokenBalance)} MUSD. Necessário: {formatAtomicMockUsd(scenario.quote.mockUsdAmount)} MUSD. Reduza o valor da fatura em um novo cenário ou obtenha mais tokens de teste antes de continuar.</span>
              </div>
            ) : null}

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
                useBridge={paymentFlow.useBridge}
                onSelectFundingRoute={paymentFlow.setUseBridge}
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
                <div className="completion-balances" aria-live="polite">
                  <strong>Saldos de MUSD na OP Sepolia após a liquidação</strong>
                  {tokenBalances ? (
                    <p>Pagadora {scenario.payer}: <strong>{formatAtomicMockUsd(tokenBalances.payer)} MUSD</strong><br />Beneficiária {scenario.beneficiary}: <strong>{formatAtomicMockUsd(tokenBalances.beneficiary)} MUSD</strong></p>
                  ) : <p>{tokenBalanceError ?? "Lendo os saldos confirmados na OP Sepolia…"}</p>}
                </div>
                <button className="button button-secondary" type="button" disabled={!walletAccount.isConnected || walletAccount.chainId !== 11155420} onClick={() => void addMockUsdToWallet()}>
                  Mostrar MUSD na MetaMask
                </button>
                {!walletAccount.isConnected || walletAccount.chainId !== 11155420 ? (
                  <p>Conecte a MetaMask na OP Sepolia para adicionar MUSD à exibição da carteira.</p>
                ) : null}
                {tokenWalletMessage ? <p role="status">{tokenWalletMessage}</p> : null}
                <button className="button button-primary" type="button" onClick={() => startNewScenario(true)}>
                  Criar pagamento inverso com as carteiras trocadas
                </button>
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
              <p>Depois do cálculo, você verá a sequência na OP Sepolia, com depósito L1 opcional, e o payout local simulado.</p>
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
