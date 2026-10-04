import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PaymentDemoModule", (m) => {
  const issuer = m.getAccount(0);
  const mockUsd = m.contract("MockUSD", [issuer]);
  const paymentRegistry = m.contract("PaymentRegistry", [mockUsd]);

  return { mockUsd, paymentRegistry };
});
