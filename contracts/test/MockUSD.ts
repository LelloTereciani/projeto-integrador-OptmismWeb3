import { expect } from "chai";
import type { BaseContract, ContractRunner } from "ethers";
import { network } from "hardhat";

const { ethers } = await network.create({
  network: "hardhatOp",
  chainType: "op",
});

function connect<T extends BaseContract>(contract: T, runner: ContractRunner): T {
  return contract.connect(runner) as T;
}

describe("MockUSD", function () {
  async function deployToken() {
    const [issuer, recipient, outsider] = await ethers.getSigners();
    const token = await ethers.deployContract("MockUSD", [issuer.address]);

    return { token, issuer, recipient, outsider };
  }

  it("publishes explicit demo metadata and the named six-decimal deployment constant", async function () {
    const { token } = await deployToken();

    expect(await token.name()).to.equal("MockUSD Test Token");
    expect(await token.symbol()).to.equal("MUSD");
    expect(await token.DECIMALS()).to.equal(6n);
    expect(await token.decimals()).to.equal(await token.DECIMALS());
    expect(await token.totalSupply()).to.equal(0n);
  });

  it("allows only the configured testnet issuer to mint the exact requested amount", async function () {
    const { token, recipient } = await deployToken();
    const amount = 25_500_000n;

    await expect(token.mint(recipient.address, amount))
      .to.emit(token, "Transfer")
      .withArgs(ethers.ZeroAddress, recipient.address, amount);

    expect(await token.balanceOf(recipient.address)).to.equal(amount);
    expect(await token.totalSupply()).to.equal(amount);
  });

  it("rejects minting by an account other than the configured issuer", async function () {
    const { token, recipient, outsider } = await deployToken();

    await expect(connect(token, outsider).mint(recipient.address, 1n))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
      .withArgs(outsider.address);

    expect(await token.balanceOf(recipient.address)).to.equal(0n);
    expect(await token.totalSupply()).to.equal(0n);
  });

  it("rejects minting to the zero address without changing supply", async function () {
    const { token } = await deployToken();

    await expect(token.mint(ethers.ZeroAddress, 1n))
      .to.be.revertedWithCustomError(token, "ERC20InvalidReceiver")
      .withArgs(ethers.ZeroAddress);

    expect(await token.totalSupply()).to.equal(0n);
  });
});
