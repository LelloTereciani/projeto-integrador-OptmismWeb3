import { getAddress, isAddress, type Address } from "viem";
import { optimismSepolia, sepolia } from "viem/chains";

export const L1_DEPOSIT_AMOUNT_WEI = 100_000_000_000_000n;
export const L2_DEPOSIT_MIN_GAS_LIMIT = 200_000;

export const standardBridgeAbi = [
  {
    type: "function",
    name: "depositETHTo",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "minGasLimit", type: "uint32" },
      { name: "extraData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const mockUsdAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const paymentRegistryAbi = [
  {
    type: "function",
    name: "createPayment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentId", type: "bytes32" },
      { name: "beneficiary", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "termsHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approvePayment",
    stateMutability: "nonpayable",
    inputs: [{ name: "paymentId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settlePayment",
    stateMutability: "nonpayable",
    inputs: [{ name: "paymentId", type: "bytes32" }],
    outputs: [],
  },
] as const;

export interface PaymentContracts {
  l1StandardBridge: Address;
  paymentRegistry: Address;
  mockUsd: Address;
}

const bridgeAddress = optimismSepolia.contracts.l1StandardBridge?.[sepolia.id]?.address;

function configuredAddress(value: string | undefined): Address | null {
  return value && isAddress(value, { strict: true }) ? getAddress(value) : null;
}

export function getPaymentContracts(): PaymentContracts | null {
  const paymentRegistry = configuredAddress(process.env.NEXT_PUBLIC_PAYMENT_REGISTRY_ADDRESS);
  const mockUsd = configuredAddress(process.env.NEXT_PUBLIC_MOCK_USD_ADDRESS);

  if (!bridgeAddress || !paymentRegistry || !mockUsd) {
    return null;
  }

  return {
    l1StandardBridge: getAddress(bridgeAddress),
    paymentRegistry,
    mockUsd,
  };
}
