import { network } from "hardhat";

const OP_SEPOLIA_CHAIN_ID = 11155420n;
const MOCK_USD_DECIMALS = 6;

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing required ${name} argument`);
  }
  return value;
}

const recipientInput = requiredArgument("--recipient");
const amountInput = requiredArgument("--amount");
const tokenAddressInput = process.env.MOCK_USD_ADDRESS;
if (tokenAddressInput === undefined) {
  throw new Error("MOCK_USD_ADDRESS must be set in ignored environment configuration");
}

const { ethers } = await network.create({
  network: "opSepolia",
  chainType: "op",
});
const activeNetwork = await ethers.provider.getNetwork();
if (activeNetwork.chainId !== OP_SEPOLIA_CHAIN_ID) {
  throw new Error(`Refusing to mint on unsupported chain ${activeNetwork.chainId}`);
}

const recipient = ethers.getAddress(recipientInput);
const tokenAddress = ethers.getAddress(tokenAddressInput);
const token = await ethers.getContractAt("MockUSD", tokenAddress);
if ((await token.DECIMALS()) !== BigInt(MOCK_USD_DECIMALS)) {
  throw new Error("Configured token does not use the expected MockUSD decimals");
}

const amount = ethers.parseUnits(amountInput, MOCK_USD_DECIMALS);
if (amount <= 0n) {
  throw new Error("Mint amount must be greater than zero");
}

const [issuer] = await ethers.getSigners();
if (issuer === undefined) {
  throw new Error("No issuer signer is available from ignored environment configuration");
}

const issuerToken = token.connect(issuer) as typeof token;
const transaction = await issuerToken.mint(recipient, amount);
const receipt = await transaction.wait();
if (receipt === null) {
  throw new Error("Mint transaction was not mined");
}

console.log(`Minted ${amount} atomic MockUSD units to ${recipient} in transaction ${receipt.hash}`);
