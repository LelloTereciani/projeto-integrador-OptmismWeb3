"use client";

import {
  getAccount,
  getBalance,
  sendTransaction,
  simulateContract,
  waitForTransactionReceipt,
  type Config,
} from "@wagmi/core";
import { useCallback, useMemo, useState } from "react";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import {
  decodeFunctionData,
  encodeFunctionData,
  isAddressEqual,
  keccak256,
  toHex,
  type Address,
  type Hash,
  type Hex,
} from "viem";

import type {
  PaymentScenario,
  PaymentStage,
  TransactionStage,
} from "../../../../../packages/shared/src/payment";
import {
  L1_DEPOSIT_AMOUNT_WEI,
  L2_DEPOSIT_MIN_GAS_LIMIT,
  mockUsdAbi,
  paymentRegistryAbi,
  standardBridgeAbi,
  type PaymentContracts,
} from "../../lib/contracts";
import { getAllowedAction } from "./payment-machine";
import type {
  PaymentActionType,
  SupportedChainId,
  WalletActionState,
} from "./payment-types";
import { deserializeScenario } from "./ui-model";

type WalletWriteAction =
  | "deposit-l1"
  | "create-payment"
  | "approve-payment"
  | "approve-token"
  | "settle-payment";

interface WalletSnapshot {
  address: Address;
  chainId: number;
}

export interface TransactionIntent {
  action: WalletWriteAction;
  account: Address;
  chainId: SupportedChainId;
  to: Address;
  data: Hex;
  value: bigint;
  fingerprint: Hex;
}

interface SimulationResult {
  fingerprint: Hex;
}

export type ReceiptResult =
  | { status: "success" | "reverted"; hash: Hash; blockNumber: bigint }
  | { status: "replaced"; hash: Hash; replacementHash: Hash; reason: string };

export interface PaymentFlowDependencies {
  getWallet(): Promise<WalletSnapshot | null>;
  getBalance(chainId: SupportedChainId, address: Address): Promise<bigint>;
  simulate(intent: TransactionIntent): Promise<SimulationResult>;
  send(intent: TransactionIntent): Promise<Hash>;
  waitForReceipt(hash: Hash, chainId: SupportedChainId): Promise<ReceiptResult>;
  recordTransaction(
    scenarioId: string,
    stage: TransactionStage,
    chainId: SupportedChainId,
    hash: Hash,
  ): Promise<PaymentScenario>;
  verifyTransaction(scenarioId: string, stage: TransactionStage): Promise<PaymentScenario>;
}

interface PaymentFlowResult {
  state: WalletActionState;
  scenario?: PaymentScenario;
}

type StateListener = (state: WalletActionState) => void;

const TRANSACTION_STAGE_BY_ACTION: Record<WalletWriteAction, TransactionStage> = {
  "deposit-l1": "l1-deposit",
  "create-payment": "payment-create",
  "approve-payment": "payment-approve",
  "approve-token": "token-approve",
  "settle-payment": "payment-settle",
};

const CONFIRMED_SCENARIO_STAGE_BY_ACTION: Record<WalletWriteAction, PaymentStage> = {
  "deposit-l1": "l2-credit-pending",
  "create-payment": "created",
  "approve-payment": "approved",
  "approve-token": "token-approved",
  "settle-payment": "settled",
};

const PAYMENT_STAGE_ORDER: PaymentStage[] = [
  "draft",
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

function serverConfirmedAction(action: WalletWriteAction, stage: PaymentStage): boolean {
  return PAYMENT_STAGE_ORDER.indexOf(stage) >= PAYMENT_STAGE_ORDER.indexOf(CONFIRMED_SCENARIO_STAGE_BY_ACTION[action]);
}

function fingerprint(to: Address, data: Hex, value: bigint): Hex {
  return keccak256(`${to.toLowerCase()}${data.slice(2)}${toHex(value, { size: 32 }).slice(2)}` as Hex);
}

function intent(
  action: WalletWriteAction,
  account: Address,
  chainId: SupportedChainId,
  to: Address,
  data: Hex,
  value = 0n,
): TransactionIntent {
  return {
    action,
    account,
    chainId,
    to,
    data,
    value,
    fingerprint: fingerprint(to, data, value),
  };
}

function buildTransactionIntent(
  action: WalletWriteAction,
  scenario: PaymentScenario,
  contracts: PaymentContracts,
  account: Address,
): TransactionIntent {
  switch (action) {
    case "deposit-l1":
      return intent(
        action,
        account,
        11155111,
        contracts.l1StandardBridge,
        encodeFunctionData({
          abi: standardBridgeAbi,
          functionName: "depositETHTo",
          args: [account, L2_DEPOSIT_MIN_GAS_LIMIT, "0x"],
        }),
        L1_DEPOSIT_AMOUNT_WEI,
      );
    case "create-payment":
      return intent(
        action,
        account,
        11155420,
        contracts.paymentRegistry,
        encodeFunctionData({
          abi: paymentRegistryAbi,
          functionName: "createPayment",
          args: [scenario.paymentId, scenario.beneficiary, scenario.quote.mockUsdAmount, scenario.termsHash],
        }),
      );
    case "approve-payment":
      return intent(
        action,
        account,
        11155420,
        contracts.paymentRegistry,
        encodeFunctionData({
          abi: paymentRegistryAbi,
          functionName: "approvePayment",
          args: [scenario.paymentId],
        }),
      );
    case "approve-token":
      return intent(
        action,
        account,
        11155420,
        contracts.mockUsd,
        encodeFunctionData({
          abi: mockUsdAbi,
          functionName: "approve",
          args: [contracts.paymentRegistry, scenario.quote.mockUsdAmount],
        }),
      );
    case "settle-payment":
      return intent(
        action,
        account,
        11155420,
        contracts.paymentRegistry,
        encodeFunctionData({
          abi: paymentRegistryAbi,
          functionName: "settlePayment",
          args: [scenario.paymentId],
        }),
      );
  }
}

function errorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "number") return error.code;
  return "cause" in error ? errorCode(error.cause) : undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "A carteira ou o RPC não respondeu.";
}

function failureState(error: unknown): WalletActionState {
  const message = errorText(error);
  if (errorCode(error) === 4001 || /user rejected|user denied|rejeit/i.test(message)) {
    return { status: "rejected", error: "A solicitação foi rejeitada na carteira." };
  }
  return { status: "unavailable", error: message };
}

function sameWallet(snapshot: WalletSnapshot, expected: WalletSnapshot): boolean {
  return snapshot.chainId === expected.chainId && isAddressEqual(snapshot.address, expected.address);
}

export function createPaymentFlowController(
  dependencies: PaymentFlowDependencies,
  contracts: PaymentContracts,
) {
  const inFlight = new Set<string>();

  return {
    async submit(
      action: WalletWriteAction,
      scenario: PaymentScenario,
      onState: StateListener = () => undefined,
    ): Promise<PaymentFlowResult> {
      const key = `${scenario.id}:${action}`;
      if (inFlight.has(key)) {
        return { state: { status: "duplicate", error: "Esta ação já está em andamento." } };
      }
      inFlight.add(key);
      let submittedHash: Hash | undefined;
      let recordedScenario: PaymentScenario | undefined;

      try {
        const wallet = await dependencies.getWallet();
        if (!wallet) return { state: { status: "disconnected" } };
        if (!isAddressEqual(wallet.address, scenario.payer)) {
          return {
            state: {
              status: "invalidated",
              error: "A conta conectada não é a carteira pagadora deste cenário.",
            },
          };
        }

        const expectedIntent = buildTransactionIntent(action, scenario, contracts, wallet.address);
        if (wallet.chainId !== expectedIntent.chainId) {
          return {
            state: { status: "wrong-network", requiredChainId: expectedIntent.chainId },
          };
        }

        if (action === "deposit-l1") {
          const balance = await dependencies.getBalance(expectedIntent.chainId, wallet.address);
          if (balance < expectedIntent.value) {
            return {
              state: {
                status: "insufficient-funds",
                error: "Saldo insuficiente de ETH de teste na Ethereum Sepolia.",
              },
            };
          }
        }

        onState({ status: "simulating" });
        const simulation = await dependencies.simulate(expectedIntent);
        if (simulation.fingerprint !== expectedIntent.fingerprint) {
          return {
            state: {
              status: "invalidated",
              error: "O alvo, os dados, o spender ou o valor mudaram após a simulação.",
            },
          };
        }

        const currentWallet = await dependencies.getWallet();
        if (!currentWallet || !sameWallet(currentWallet, wallet)) {
          return {
            state: {
              status: "invalidated",
              error: "A conta ou a rede mudou após a simulação. Revise a ação novamente.",
            },
          };
        }

        const finalIntent = buildTransactionIntent(action, scenario, contracts, currentWallet.address);
        if (finalIntent.fingerprint !== expectedIntent.fingerprint) {
          return {
            state: {
              status: "invalidated",
              error: "Os dados da transação mudaram após a simulação.",
            },
          };
        }

        onState({ status: "signature-pending" });
        const hash = await dependencies.send(finalIntent);
        submittedHash = hash;
        onState({ status: "submitted", hash });
        const stage = TRANSACTION_STAGE_BY_ACTION[action];
        recordedScenario = await dependencies.recordTransaction(
          scenario.id,
          stage,
          finalIntent.chainId,
          hash,
        );
        onState({ status: "confirming", hash });
        const receipt = await dependencies.waitForReceipt(hash, finalIntent.chainId);

        if (receipt.status === "replaced") {
          return {
            state: {
              status: "replaced",
              hash,
              replacementHash: receipt.replacementHash,
              error: "A transação foi substituída. Confirme o hash efetivo antes de continuar.",
            },
            scenario: recordedScenario,
          };
        }
        if (receipt.status === "reverted") {
          let revertedScenario = recordedScenario;
          try {
            revertedScenario = await dependencies.verifyTransaction(scenario.id, stage);
          } catch {
            // The on-chain receipt remains authoritative for the reverted UI state.
          }
          return {
            state: {
              status: "reverted",
              hash,
              error: "A transação foi revertida pela rede.",
            },
            scenario: revertedScenario,
          };
        }

        onState({ status: "verifying", hash });
        const verifiedScenario = await dependencies.verifyTransaction(scenario.id, stage);
        const state: WalletActionState = {
          status: serverConfirmedAction(action, verifiedScenario.stage)
            ? "confirmed"
            : "server-pending",
          hash,
        };
        onState(state);
        return { state, scenario: verifiedScenario };
      } catch (error) {
        const state = {
          ...failureState(error),
          ...(submittedHash ? { hash: submittedHash } : {}),
        };
        onState(state);
        return { state, scenario: recordedScenario };
      } finally {
        inFlight.delete(key);
      }
    },
  };
}

async function responseScenario(response: Response): Promise<PaymentScenario> {
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : "O servidor não confirmou a evidência da transação.";
    throw new Error(message);
  }
  return deserializeScenario(body);
}

export function createWagmiPaymentFlowDependencies(config: Config): PaymentFlowDependencies {
  return {
    async getWallet() {
      const account = getAccount(config);
      return account.status === "connected" && account.address && account.chainId
        ? { address: account.address, chainId: account.chainId }
        : null;
    },
    async getBalance(chainId, address) {
      return (await getBalance(config, { address, chainId })).value;
    },
    async simulate(intent) {
      if (intent.action === "deposit-l1") {
        await simulateContract(config, {
          account: intent.account,
          address: intent.to,
          abi: standardBridgeAbi,
          functionName: "depositETHTo",
          args: [intent.account, L2_DEPOSIT_MIN_GAS_LIMIT, "0x"],
          chainId: intent.chainId,
          value: intent.value,
        });
      } else if (intent.action === "approve-token") {
        const decoded = decodeFunctionData({ abi: mockUsdAbi, data: intent.data });
        if (decoded.functionName !== "approve") {
          throw new Error("The simulated token call is not an approval");
        }
        await simulateContract(config, {
          account: intent.account,
          address: intent.to,
          abi: mockUsdAbi,
          functionName: "approve",
          args: decoded.args,
          chainId: intent.chainId,
        });
      } else {
        const decoded = decodeFunctionData({ abi: paymentRegistryAbi, data: intent.data });
        if (decoded.functionName === "createPayment") {
          await simulateContract(config, {
            account: intent.account,
            address: intent.to,
            abi: paymentRegistryAbi,
            functionName: "createPayment",
            args: decoded.args,
            chainId: intent.chainId,
          });
        } else if (decoded.functionName === "approvePayment") {
          await simulateContract(config, {
            account: intent.account,
            address: intent.to,
            abi: paymentRegistryAbi,
            functionName: "approvePayment",
            args: decoded.args,
            chainId: intent.chainId,
          });
        } else {
          await simulateContract(config, {
            account: intent.account,
            address: intent.to,
            abi: paymentRegistryAbi,
            functionName: "settlePayment",
            args: decoded.args,
            chainId: intent.chainId,
          });
        }
      }
      return { fingerprint: fingerprint(intent.to, intent.data, intent.value) };
    },
    async send(intent) {
      return sendTransaction(config, {
        account: intent.account,
        chainId: intent.chainId,
        to: intent.to,
        data: intent.data,
        value: intent.value,
      });
    },
    async waitForReceipt(hash, chainId) {
      let replacement:
        | { replacementHash: Hash; reason: string }
        | undefined;
      const receipt = await waitForTransactionReceipt(config, {
        chainId,
        hash,
        confirmations: 1,
        onReplaced(replaced) {
          replacement = {
            replacementHash: replaced.transaction.hash,
            reason: replaced.reason,
          };
        },
      });
      if (replacement) {
        return { status: "replaced", hash, ...replacement };
      }
      return { status: receipt.status, hash, blockNumber: receipt.blockNumber };
    },
    async recordTransaction(scenarioId, stage, chainId, hash) {
      return responseScenario(
        await fetch(`/api/payments/${scenarioId}/transactions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stage, chainId, hash }),
        }),
      );
    },
    async verifyTransaction(scenarioId, stage) {
      return responseScenario(
        await fetch(`/api/payments/${scenarioId}/transactions/${stage}/verify`, {
          method: "POST",
        }),
      );
    },
  };
}

export function usePaymentFlow(scenario: PaymentScenario | null, contracts: PaymentContracts | null) {
  const config = useConfig();
  const account = useAccount();
  const switchChain = useSwitchChain();
  const [actionState, setActionState] = useState<WalletActionState>({ status: "idle" });
  const [activeAction, setActiveAction] = useState<PaymentActionType>("none");
  const controller = useMemo(
    () => (contracts ? createPaymentFlowController(createWagmiPaymentFlowDependencies(config), contracts) : null),
    [config, contracts],
  );

  const walletState = useMemo(
    () => ({
      status: account.status === "connected" ? "connected" as const : account.status === "connecting" || account.status === "reconnecting" ? "connecting" as const : "disconnected" as const,
      ...(account.address ? { address: account.address } : {}),
      ...(account.chainId ? { chainId: account.chainId } : {}),
      pendingAction: null,
    }),
    [account.address, account.chainId, account.status],
  );
  const action = scenario ? getAllowedAction(scenario, walletState) : null;

  const submitAction = useCallback(async (): Promise<PaymentScenario | undefined> => {
    if (!scenario || !action || !action.enabled) return undefined;
    setActiveAction(action.type);

    if (!contracts || !controller) {
      setActionState({ status: "configuration-error", error: "Configure os endereços testnet de MockUSD e PaymentRegistry." });
      return undefined;
    }

    if (
      action.type === "refresh-deposit" ||
      action.type === "refresh-settlement" ||
      action.type === "refresh-transaction"
    ) {
      const stage = action.type === "refresh-deposit"
        ? "l1-deposit"
        : action.type === "refresh-settlement"
          ? "payment-settle"
          : action.transactionStage;
      if (!stage) {
        setActionState({ status: "configuration-error", error: "A etapa de verificação não foi definida." });
        return undefined;
      }
      setActionState({ status: "verifying" });
      try {
        const updated = await createWagmiPaymentFlowDependencies(config).verifyTransaction(scenario.id, stage);
        setActionState({ status: updated.stage === scenario.stage ? "server-pending" : "confirmed" });
        return updated;
      } catch (error) {
        setActionState(failureState(error));
        return undefined;
      }
    }

    if (action.type === "simulate-payout") {
      setActionState({ status: "verifying" });
      try {
        const updated = await responseScenario(
          await fetch(`/api/payments/${scenario.id}/simulate-payout`, { method: "POST" }),
        );
        setActionState({ status: "confirmed" });
        return updated;
      } catch (error) {
        setActionState(failureState(error));
        return undefined;
      }
    }

    if (
      action.type !== "deposit-l1" &&
      action.type !== "create-payment" &&
      action.type !== "approve-payment" &&
      action.type !== "approve-token" &&
      action.type !== "settle-payment"
    ) {
      return undefined;
    }

    const result = await controller.submit(action.type, scenario, setActionState);
    setActionState(result.state);
    return result.scenario;
  }, [action, config, contracts, controller, scenario]);

  const requestChain = useCallback(
    async (chainId: SupportedChainId) => {
      try {
        await switchChain.mutateAsync({ chainId });
        setActionState({ status: "ready" });
      } catch (error) {
        setActionState(failureState(error));
      }
    },
    [switchChain],
  );

  const derivedState: WalletActionState =
    actionState.status !== "idle" && activeAction === action?.type
      ? actionState
      : !account.isConnected
        ? { status: "disconnected" }
        : action?.requiredChainId && account.chainId !== action.requiredChainId
          ? { status: "wrong-network", requiredChainId: action.requiredChainId }
          : { status: "ready" };

  return {
    actions: action ? [action] : [],
    actionState: derivedState,
    submitAction,
    switchChain: requestChain,
    activeChainId: account.chainId,
  };
}
