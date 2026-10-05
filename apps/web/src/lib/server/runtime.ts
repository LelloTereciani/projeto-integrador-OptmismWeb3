import { createPublicClient, getAddress, http, isAddress, type Address, type Hash } from "viem";
import { optimismSepolia, sepolia } from "viem/chains";

import { createPaymentDatabase } from "./db";
import { OptimismAdapter } from "./optimism-adapter";
import { createPaymentService } from "./payment-service";
import { TransactionService, type PaymentChainVerifier } from "./transaction-service";

const L1_STANDARD_BRIDGE_ADDRESS = getAddress("0xFBb0621E0B23b5478B630BD55a5f21f67730B0F1");
const OPTIMISM_PORTAL_ADDRESS = getAddress("0x16Fc5058F25648194471939df75CF27A2fdC48BC");

const registryReadAbi = [{
  type: "function",
  name: "payments",
  stateMutability: "view",
  inputs: [{ name: "paymentId", type: "bytes32" }],
  outputs: [
    { name: "payer", type: "address" },
    { name: "beneficiary", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "termsHash", type: "bytes32" },
    { name: "state", type: "uint8" },
  ],
}] as const;

const tokenReadAbi = [{
  type: "function",
  name: "allowance",
  stateMutability: "view",
  inputs: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
  ],
  outputs: [{ name: "allowance", type: "uint256" }],
}, {
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "owner", type: "address" }],
  outputs: [{ name: "balance", type: "uint256" }],
}] as const;

export class TestnetConfigurationError extends Error {}

function configuredAddress(name: string): Address {
  const value = process.env[name];
  if (!value || !isAddress(value, { strict: true })) {
    throw new TestnetConfigurationError(`${name} ainda não foi configurado com um contrato implantado na OP Sepolia`);
  }
  return getAddress(value);
}

const database = createPaymentDatabase();
export const paymentService = createPaymentService(database);
let transactionService: TransactionService | undefined;

export function getTransactionService(): TransactionService {
  if (transactionService) return transactionService;

  const registryAddress = configuredAddress("NEXT_PUBLIC_PAYMENT_REGISTRY_ADDRESS");
  const mockUsdAddress = configuredAddress("NEXT_PUBLIC_MOCK_USD_ADDRESS");
  const l1Client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com"),
  });
  const l2Client = createPublicClient({
    chain: optimismSepolia,
    transport: http(process.env.OP_SEPOLIA_RPC_URL ?? "https://sepolia.optimism.io"),
  });
  const adapter = new OptimismAdapter({
    l1Client: {
      getChainId: () => l1Client.getChainId(),
      getTransactionReceipt: ({ hash }) => l1Client.getTransactionReceipt({ hash }),
    },
    l2Client: {
      getChainId: () => l2Client.getChainId(),
      getTransactionReceipt: ({ hash }) => l2Client.getTransactionReceipt({ hash }),
    },
    l1StandardBridgeAddress: L1_STANDARD_BRIDGE_ADDRESS,
    portalAddress: OPTIMISM_PORTAL_ADDRESS,
    paymentRegistryAddress: registryAddress,
    mockUsdAddress,
  });

  const verifier: PaymentChainVerifier = {
    registryAddress,
    verifyL1Deposit: (hash, payer, amount) => adapter.verifyL1Deposit(hash, payer, amount),
    verifyL2PaymentCreated: (hash, expected) => adapter.verifyL2PaymentCreated(hash, expected),
    verifyL2PaymentApproved: (hash, expected) => adapter.verifyL2PaymentApproved(hash, expected),
    verifyL2Allowance: (hash, expected) => adapter.verifyL2Allowance(hash, expected),
    verifyL2PaymentEvent: (hash, expected) => adapter.verifyL2PaymentEvent(hash, expected),
    readRegistryPayment: async (paymentId: Hash) => {
      const [payer, beneficiary, amount, termsHash, state] = await l2Client.readContract({
        address: registryAddress,
        abi: registryReadAbi,
        functionName: "payments",
        args: [paymentId],
      });
      return { payer, beneficiary, amount, termsHash, state };
    },
    readAllowance: (owner: Address, spender: Address) => l2Client.readContract({
      address: mockUsdAddress,
      abi: tokenReadAbi,
      functionName: "allowance",
      args: [owner, spender],
    }),
    readTokenBalance: (owner: Address) => l2Client.readContract({
      address: mockUsdAddress,
      abi: tokenReadAbi,
      functionName: "balanceOf",
      args: [owner],
    }),
    readEthBalance: (owner: Address) => l2Client.getBalance({ address: owner }),
  };
  transactionService = new TransactionService(database, paymentService, verifier);
  return transactionService;
}
