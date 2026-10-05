import type { PaymentScenario, PaymentStage } from "../../../../../packages/shared/src/payment";

import type {
  PaymentAction,
  PaymentActionType,
  PendingPaymentAction,
  SupportedChainId,
  WalletState,
} from "./payment-types";

interface ActionDefinition {
  type: PaymentActionType;
  label: string;
  reason: string;
  requiredChainId?: SupportedChainId;
  requiresWallet?: boolean;
}

const ACTIONS_BY_STAGE: Record<PaymentStage, ActionDefinition> = {
  draft: {
    type: "none",
    label: "Preencha a fatura fictícia",
    reason: "Crie uma cotação simulada antes de aprovar o cenário.",
  },
  quoted: {
    type: "approve-commercial",
    label: "Aprovar cenário fictício",
    reason: "A cotação simulada está pronta para aprovação comercial.",
  },
  "commercially-approved": {
    type: "deposit-l1",
    label: "Depositar ETH de teste",
    reason: "O cenário está pronto para o depósito na Ethereum Sepolia.",
    requiredChainId: 11155111,
    requiresWallet: true,
  },
  "l1-submitted": {
    type: "refresh-deposit",
    label: "Verificar crédito na OP Sepolia",
    reason: "O crédito do depósito ainda precisa de confirmação na OP Sepolia.",
    requiredChainId: 11155420,
  },
  "l2-credit-pending": {
    type: "refresh-deposit",
    label: "Verificar crédito na OP Sepolia",
    reason: "O crédito do depósito ainda precisa de confirmação na OP Sepolia.",
    requiredChainId: 11155420,
  },
  "l2-credited": {
    type: "create-payment",
    label: "Criar operação na OP Sepolia",
    reason: "O crédito L2 foi confirmado pelo servidor.",
    requiredChainId: 11155420,
    requiresWallet: true,
  },
  created: {
    type: "approve-payment",
    label: "Aprovar operação fictícia",
    reason: "A operação foi criada no PaymentRegistry.",
    requiredChainId: 11155420,
    requiresWallet: true,
  },
  approved: {
    type: "approve-token",
    label: "Aprovar valor exato de MockUSD",
    reason: "O PaymentRegistry poderá usar somente o valor desta operação.",
    requiredChainId: 11155420,
    requiresWallet: true,
  },
  "token-approved": {
    type: "settle-payment",
    label: "Liquidar MockUSD de teste",
    reason: "O valor exato foi aprovado para o PaymentRegistry.",
    requiredChainId: 11155420,
    requiresWallet: true,
  },
  "settlement-submitted": {
    type: "refresh-settlement",
    label: "Verificar liquidação",
    reason: "A liquidação enviada ainda precisa de recibo e releitura do estado.",
    requiredChainId: 11155420,
  },
  settled: {
    type: "simulate-payout",
    label: "Exibir payout local simulado",
    reason: "A liquidação L2 foi confirmada pelo servidor.",
  },
  "payout-simulated": {
    type: "none",
    label: "Demonstração concluída",
    reason: "O payout local é apenas uma etapa fictícia da aplicação.",
  },
};

function networkName(chainId: SupportedChainId): string {
  return chainId === 11155111 ? "Ethereum Sepolia" : "OP Sepolia";
}

const TRANSACTION_STAGE_BY_WRITE_ACTION = {
  "deposit-l1": "l1-deposit",
  "create-payment": "payment-create",
  "approve-payment": "payment-approve",
  "approve-token": "token-approve",
  "settle-payment": "payment-settle",
} as const;

function activeTransactionForAction(
  scenario: PaymentScenario,
  action: PaymentActionType,
) {
  if (!(action in TRANSACTION_STAGE_BY_WRITE_ACTION)) return undefined;
  const transactionStage =
    TRANSACTION_STAGE_BY_WRITE_ACTION[action as keyof typeof TRANSACTION_STAGE_BY_WRITE_ACTION];
  return [...scenario.transactions]
    .reverse()
    .find(
      (transaction) =>
        transaction.stage === transactionStage &&
        ["submitted", "pending", "unavailable"].includes(transaction.status),
    );
}

export function shouldInvalidatePendingAction(
  pending: PendingPaymentAction,
  wallet: WalletState,
): boolean {
  if (wallet.status !== "connected" || !wallet.address || wallet.chainId === undefined) {
    return true;
  }

  return (
    wallet.address.toLowerCase() !== pending.address.toLowerCase() ||
    wallet.chainId !== pending.chainId
  );
}

export function getAllowedAction(
  scenario: PaymentScenario,
  wallet: WalletState,
): PaymentAction {
  const definition = ACTIONS_BY_STAGE[scenario.stage];
  const activeTransaction = activeTransactionForAction(scenario, definition.type);
  if (activeTransaction) {
    return {
      type: "refresh-transaction",
      label: `Verificar ${definition.label.toLowerCase()}`,
      enabled: true,
      reason: "Já existe uma transação desta etapa. Não envie novamente; atualize a verificação do servidor.",
      requiredChainId: activeTransaction.chainId,
      transactionStage: activeTransaction.stage,
    };
  }
  const base: PaymentAction = {
    type: definition.type,
    label: definition.label,
    enabled: definition.type !== "none",
    reason: definition.reason,
    ...(definition.requiredChainId === undefined
      ? {}
      : { requiredChainId: definition.requiredChainId }),
  };

  if (wallet.pendingAction?.type === definition.type) {
    return {
      ...base,
      enabled: false,
      reason: "A ação já está aguardando confirmação. Não envie novamente.",
    };
  }

  if (!definition.requiresWallet) {
    return base;
  }

  if (wallet.status !== "connected" || !wallet.address) {
    return {
      ...base,
      enabled: false,
      reason: "Conecte uma carteira injetada para continuar.",
    };
  }

  if (wallet.address.toLowerCase() !== scenario.payer.toLowerCase()) {
    return {
      ...base,
      enabled: false,
      reason: "Selecione a carteira pagadora informada no cenário.",
    };
  }

  if (definition.requiredChainId !== undefined && wallet.chainId !== definition.requiredChainId) {
    return {
      ...base,
      enabled: false,
      reason: `Troque a carteira para ${networkName(definition.requiredChainId)} antes de continuar.`,
    };
  }

  return base;
}
