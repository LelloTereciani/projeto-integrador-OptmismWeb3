import { expect } from "chai";
import type { BaseContract, ContractRunner } from "ethers";
import { network } from "hardhat";

const { ethers } = await network.create({
  network: "hardhatOp",
  chainType: "op",
});

const PAYMENT_ID = ethers.id("payment-1");
const TERMS_HASH = ethers.id("fictional-commercial-terms-v1");
const AMOUNT = 125_500_000n;

function connect<T extends BaseContract>(contract: T, runner: ContractRunner): T {
  return contract.connect(runner) as T;
}

describe("PaymentRegistry", function () {
  async function deployContracts() {
    const [issuer, payer, beneficiary, outsider] = await ethers.getSigners();
    const token = await ethers.deployContract("MockUSD", [issuer.address]);
    const registry = await ethers.deployContract("PaymentRegistry", [await token.getAddress()]);

    return { token, registry, issuer, payer, beneficiary, outsider };
  }

  async function createAndApprove() {
    const deployment = await deployContracts();
    const { registry, payer, beneficiary } = deployment;

    await connect(registry, payer).createPayment(PAYMENT_ID, beneficiary.address, AMOUNT, TERMS_HASH);
    await connect(registry, payer).approvePayment(PAYMENT_ID);

    return deployment;
  }

  it("rejects the zero address as the immutable token", async function () {
    const registryFactory = await ethers.getContractFactory("PaymentRegistry");

    await expect(registryFactory.deploy(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(registryFactory, "InvalidToken")
      .withArgs(ethers.ZeroAddress);
  });

  it("rejects an externally owned account as the immutable token", async function () {
    const [, payer] = await ethers.getSigners();
    const registryFactory = await ethers.getContractFactory("PaymentRegistry");

    await expect(registryFactory.deploy(payer.address))
      .to.be.revertedWithCustomError(registryFactory, "InvalidToken")
      .withArgs(payer.address);
  });

  it("records, approves, and settles an exact non-custodial token payment", async function () {
    const { token, registry, payer, beneficiary } = await deployContracts();
    const registryAddress = await registry.getAddress();
    const payerFunding = AMOUNT + 17_000_000n;
    const beneficiaryOpeningBalance = 9_000_000n;

    await expect(
      connect(registry, payer).createPayment(PAYMENT_ID, beneficiary.address, AMOUNT, TERMS_HASH),
    )
      .to.emit(registry, "PaymentCreated")
      .withArgs(PAYMENT_ID, payer.address, beneficiary.address, AMOUNT, TERMS_HASH);

    const created = await registry.payments(PAYMENT_ID);
    expect(created.payer).to.equal(payer.address);
    expect(created.beneficiary).to.equal(beneficiary.address);
    expect(created.amount).to.equal(AMOUNT);
    expect(created.termsHash).to.equal(TERMS_HASH);
    expect(created.state).to.equal(0n);

    await expect(connect(registry, payer).approvePayment(PAYMENT_ID))
      .to.emit(registry, "PaymentApproved")
      .withArgs(PAYMENT_ID, payer.address);
    expect((await registry.payments(PAYMENT_ID)).state).to.equal(1n);

    await token.mint(payer.address, payerFunding);
    await token.mint(beneficiary.address, beneficiaryOpeningBalance);
    await connect(token, payer).approve(registryAddress, AMOUNT);
    expect(await token.allowance(payer.address, registryAddress)).to.equal(AMOUNT);

    await expect(connect(registry, payer).settlePayment(PAYMENT_ID))
      .to.emit(registry, "PaymentSettled")
      .withArgs(PAYMENT_ID, payer.address, beneficiary.address, AMOUNT);

    expect((await registry.payments(PAYMENT_ID)).state).to.equal(2n);
    expect(await token.balanceOf(payer.address)).to.equal(payerFunding - AMOUNT);
    expect(await token.balanceOf(beneficiary.address)).to.equal(beneficiaryOpeningBalance + AMOUNT);
    expect(await token.balanceOf(registryAddress)).to.equal(0n);
    expect(await token.allowance(payer.address, registryAddress)).to.equal(0n);
    expect(await token.totalSupply()).to.equal(payerFunding + beneficiaryOpeningBalance);
  });

  it("rejects a zero beneficiary", async function () {
    const { registry, payer } = await deployContracts();

    await expect(connect(registry, payer).createPayment(PAYMENT_ID, ethers.ZeroAddress, AMOUNT, TERMS_HASH))
      .to.be.revertedWithCustomError(registry, "InvalidBeneficiary");
  });

  it("rejects the payer as beneficiary for a two-wallet payment", async function () {
    const { registry, payer } = await deployContracts();

    await expect(connect(registry, payer).createPayment(PAYMENT_ID, payer.address, AMOUNT, TERMS_HASH))
      .to.be.revertedWithCustomError(registry, "InvalidBeneficiary");
  });

  it("rejects a zero payment amount", async function () {
    const { registry, payer, beneficiary } = await deployContracts();

    await expect(connect(registry, payer).createPayment(PAYMENT_ID, beneficiary.address, 0n, TERMS_HASH))
      .to.be.revertedWithCustomError(registry, "InvalidAmount");
  });

  it("rejects reuse of an existing payment identifier", async function () {
    const { registry, payer, beneficiary } = await deployContracts();
    await connect(registry, payer).createPayment(PAYMENT_ID, beneficiary.address, AMOUNT, TERMS_HASH);

    await expect(
      connect(registry, payer).createPayment(PAYMENT_ID, beneficiary.address, AMOUNT + 1n, TERMS_HASH),
    )
      .to.be.revertedWithCustomError(registry, "PaymentAlreadyExists")
      .withArgs(PAYMENT_ID);
  });

  it("rejects approval and settlement by an account other than the payer", async function () {
    const { token, registry, payer, beneficiary, outsider } = await deployContracts();
    await connect(registry, payer).createPayment(PAYMENT_ID, beneficiary.address, AMOUNT, TERMS_HASH);

    await expect(connect(registry, outsider).approvePayment(PAYMENT_ID))
      .to.be.revertedWithCustomError(registry, "UnauthorizedPayer")
      .withArgs(outsider.address);

    await connect(registry, payer).approvePayment(PAYMENT_ID);
    await token.mint(payer.address, AMOUNT);
    await connect(token, payer).approve(await registry.getAddress(), AMOUNT);

    await expect(connect(registry, outsider).settlePayment(PAYMENT_ID))
      .to.be.revertedWithCustomError(registry, "UnauthorizedPayer")
      .withArgs(outsider.address);
  });

  it("rejects settlement before payer approval", async function () {
    const { registry, payer, beneficiary } = await deployContracts();
    await connect(registry, payer).createPayment(PAYMENT_ID, beneficiary.address, AMOUNT, TERMS_HASH);

    await expect(connect(registry, payer).settlePayment(PAYMENT_ID))
      .to.be.revertedWithCustomError(registry, "InvalidPaymentState")
      .withArgs(PAYMENT_ID, 1n, 0n);
  });

  it("rejects a second settlement", async function () {
    const { token, registry, payer } = await createAndApprove();
    await token.mint(payer.address, AMOUNT * 2n);
    await connect(token, payer).approve(await registry.getAddress(), AMOUNT * 2n);
    await connect(registry, payer).settlePayment(PAYMENT_ID);

    await expect(connect(registry, payer).settlePayment(PAYMENT_ID))
      .to.be.revertedWithCustomError(registry, "InvalidPaymentState")
      .withArgs(PAYMENT_ID, 1n, 2n);
  });

  it("keeps the accepted token address immutable throughout the lifecycle", async function () {
    const { token, registry, payer, beneficiary } = await deployContracts();
    const configuredToken = await token.getAddress();

    expect(await registry.token()).to.equal(configuredToken);
    await connect(registry, payer).createPayment(PAYMENT_ID, beneficiary.address, AMOUNT, TERMS_HASH);
    await connect(registry, payer).approvePayment(PAYMENT_ID);
    expect(await registry.token()).to.equal(configuredToken);
  });

  it("reverts settlement atomically when allowance is insufficient", async function () {
    const { token, registry, payer, beneficiary } = await createAndApprove();
    await token.mint(payer.address, AMOUNT);

    await expect(connect(registry, payer).settlePayment(PAYMENT_ID))
      .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")
      .withArgs(await registry.getAddress(), 0n, AMOUNT);

    expect((await registry.payments(PAYMENT_ID)).state).to.equal(1n);
    expect(await token.balanceOf(payer.address)).to.equal(AMOUNT);
    expect(await token.balanceOf(beneficiary.address)).to.equal(0n);
  });

  it("reverts settlement atomically when the payer balance is insufficient", async function () {
    const { token, registry, payer, beneficiary } = await createAndApprove();
    const payerBalance = AMOUNT - 1n;
    const registryAddress = await registry.getAddress();
    await token.mint(payer.address, payerBalance);
    await connect(token, payer).approve(registryAddress, AMOUNT);

    await expect(connect(registry, payer).settlePayment(PAYMENT_ID))
      .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
      .withArgs(payer.address, payerBalance, AMOUNT);

    expect((await registry.payments(PAYMENT_ID)).state).to.equal(1n);
    expect(await token.balanceOf(payer.address)).to.equal(payerBalance);
    expect(await token.balanceOf(beneficiary.address)).to.equal(0n);
    expect(await token.allowance(payer.address, registryAddress)).to.equal(AMOUNT);
  });

  it("settles exact atomic amounts across representative boundaries", async function () {
    for (const amount of [1n, 1_000_000n, (1n << 128n) - 1n]) {
      const { token, registry, payer, beneficiary } = await deployContracts();
      const paymentId = ethers.keccak256(ethers.toBeHex(amount, 32));
      const registryAddress = await registry.getAddress();

      await connect(registry, payer).createPayment(paymentId, beneficiary.address, amount, TERMS_HASH);
      await connect(registry, payer).approvePayment(paymentId);
      await token.mint(payer.address, amount);
      await connect(token, payer).approve(registryAddress, amount);
      await connect(registry, payer).settlePayment(paymentId);

      expect(await token.balanceOf(payer.address)).to.equal(0n);
      expect(await token.balanceOf(beneficiary.address)).to.equal(amount);
      expect(await token.balanceOf(registryAddress)).to.equal(0n);
    }
  });
});
