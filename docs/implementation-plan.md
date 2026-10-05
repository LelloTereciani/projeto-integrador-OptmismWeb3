# Testnet Payment Orchestrator Implementation Plan

O checklist abaixo registra a implementação e a verificação de cada etapa do projeto.

**Goal:** Build a full-stack, testnet-only web MVP that demonstrates an Ethereum Sepolia deposit into OP Sepolia and a fictitious `MockUSD` settlement on OP Sepolia.

**Status:** Tarefas 1 a 7 implementadas e verificadas localmente. Na Tarefa 8, o deploy dos dois contratos na OP Sepolia e a verificação exata no Sourcify foram concluídos em 2026-10-05; o Blockscout importou os fontes e marcou os contratos como verificados. Um cenário público confirmou o depósito Ethereum Sepolia → OP Sepolia, o mint separado de `19,8 MockUSD` para a pagadora e a liquidação desse valor à beneficiária. O payout bancário permanece simulado. O README e `docs/deployment-evidence.md` registram hashes, recibos e leituras públicas.

**Architecture:** A Next.js application contains the React frontend and a small HTTP backend with SQLite persistence for fictional payment scenarios and chain evidence. A separate Hardhat workspace compiles, tests, and deploys `MockUSD` and `PaymentRegistry`. The browser signs every write through an injected wallet; server-side adapter code independently reads receipts and events before it records an on-chain stage as confirmed.

**Tech Stack:** Next.js, React, TypeScript, Wagmi, Viem, Zod, SQLite with Drizzle ORM, Hardhat 3, Solidity, OpenZeppelin Contracts, Vitest, Playwright, pnpm workspaces.

**Spec:** `docs/design.md`, `docs/mvp-scope.md`, and `docs/frontend.md`

## Global Constraints

- The application supports only Ethereum Sepolia (`11155111`) and OP Sepolia (`11155420`); it must never expose a mainnet action.
- All user-facing commercial data, values and payout stages are fictitious and must retain the permanent testnet warning.
- `MockUSD` exists only on OP Sepolia, has no monetary value, and is never bridged.
- Browser and backend code must never receive, store, display or sign with private keys, seed phrases, reusable signatures, or wallet sessions.
- Every code comment must be written in English.
- Quantidades de token e saldos on-chain usam `bigint`; chain IDs usam inteiros de uma allowlist e hashes usam strings hexadecimais tipadas.
- The frontend supports only an injected EIP-1193 wallet; no WalletConnect, account abstraction, relayer, paymaster or server-side transaction signing.
- The ERC-20 approval is always the exact operation amount and must visibly name `PaymentRegistry` as spender.
- A transaction is confirmed only after a successful receipt and a state/event reread; a transaction hash alone is not success.
- `.env` files stay ignored. Deployment keys, RPC credentials and test wallet material must not be committed.
- O desenvolvimento local das Tarefas 1 a 7 excluía deployment e transações automáticas em testnet. A Tarefa 8 foi autorizada depois, em 2026-10-05; o deploy dos contratos foi executado manualmente, sem deploy da aplicação web.

## Review Focus

- Account or chain changes after a successful simulation must invalidate the pending write and require a new explicit action. Covered by Task 6.
- A browser could submit a fabricated transaction hash or claim a wrong payment state; the backend must verify chain, contract, event and event arguments before confirmation. Covered by Task 4.
- A user could approve a value greater than the fictitious payment or an incorrect spender; the UI must reject it and the contract must accept only its immutable token. Covered by Tasks 2 and 6.
- A delayed L1 deposit must never be portrayed as a completed L2 credit or unlock L2 payment actions. Covered by Tasks 4 and 6.
- A rejected, reverted, replaced or duplicate write must preserve the payment scenario without duplicating settlement. Covered by Tasks 2, 4 and 7.

## File Structure

```text
.
├── apps/web/
│   ├── src/app/
│   │   ├── api/payments/[id]/commercial-approval/route.ts
│   │   ├── api/payments/[id]/transactions/[stage]/verify/route.ts
│   │   ├── api/payments/[id]/transactions/route.ts
│   │   ├── api/payments/[id]/route.ts
│   │   ├── api/payments/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── src/components/
│   │   ├── invoice-form.tsx
│   │   ├── payment-stepper.tsx
│   │   ├── proof-cards.tsx
│   │   ├── quote-card.tsx
│   │   ├── transaction-action.tsx
│   │   └── wallet-panel.tsx
│   ├── src/features/payment/
│   │   ├── payment-machine.ts
│   │   ├── payment-types.ts
│   │   └── use-payment-flow.ts
│   ├── src/lib/
│   │   ├── config.ts
│   │   ├── contracts.ts
│   │   ├── explorer.ts
│   │   ├── quote.ts
│   │   ├── wagmi.ts
│   │   └── server/
│   │       ├── db.ts
│   │       ├── payment-service.ts
│   │       ├── payment-validator.ts
│   │       └── optimism-adapter.ts
│   ├── drizzle/0000_initial.sql
│   ├── tests/
│   └── playwright.config.ts
├── contracts/
│   ├── contracts/MockUSD.sol
│   ├── contracts/PaymentRegistry.sol
│   ├── ignition/modules/PaymentDemo.ts
│   ├── scripts/mint-demo-token.ts
│   ├── test/MockUSD.ts
│   ├── test/PaymentRegistry.ts
│   ├── hardhat.config.ts
│   └── package.json
├── packages/shared/
│   └── src/payment.ts
├── docs/
│   ├── deployment-evidence.md
│   ├── frontend.md
│   ├── mvp-scope.md
│   ├── design.md
│   └── implementation-plan.md
├── .env.example
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

### Task 1: Initialize the workspace and shared payment model

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.env.example`
- Create: `packages/shared/src/payment.ts`, `packages/shared/package.json`
- Create: `apps/web/package.json`, `contracts/package.json`
- Modify: `README.md`
- Test: `packages/shared/src/payment.test.ts`

**Interfaces:**
- Produces: `PaymentStage`, `PaymentScenario`, `TransactionStage`, `Quote`, `SUPPORTED_CHAIN_IDS`, and `parseAtomicMockUsd(value: string): bigint` for web, backend and tests.
- Consumes: the exact chain IDs and explicit exclusions defined in the specification.

- [x] **Step 1: Write the failing tests for shared payment types and quote-safe amount parsing**

Cover valid decimal conversion, malformed decimal input, excessive decimal places, the two allowed chain IDs, and every persisted transaction stage.

- [x] **Step 2: Run the shared tests to verify they fail**

Run: `pnpm --filter @payment-demo/shared test`

Expected: FAIL because the shared package and exports do not exist.

- [x] **Step 3: Create the pnpm workspace and implement the shared domain package**

Use `bigint` for atomic `MockUSD` amounts and string serialization only at API/database boundaries. Configure `.gitignore` for dependency folders, Next build output, Hardhat artifacts, coverage output and `.env` files. Include placeholders only in `.env.example`.

- [x] **Step 4: Run the shared tests and typecheck**

Run: `pnpm --filter @payment-demo/shared test && pnpm --filter @payment-demo/shared typecheck`

Expected: PASS.

- [x] **Step 5: Commit the workspace foundation**

```bash
git add package.json pnpm-workspace.yaml .gitignore .env.example packages README.md
git commit -m "chore: initialize testnet payment workspace"
```

### Task 2: Implement and test the OP Sepolia contracts

**Files:**
- Create: `contracts/contracts/MockUSD.sol`
- Create: `contracts/contracts/PaymentRegistry.sol`
- Create: `contracts/test/MockUSD.ts`, `contracts/test/PaymentRegistry.ts`
- Create: `contracts/hardhat.config.ts`, `contracts/ignition/modules/PaymentDemo.ts`, `contracts/scripts/mint-demo-token.ts`
- Modify: `contracts/package.json`, `.env.example`, `README.md`

**Interfaces:**
- Consumes: `bytes32 paymentId`, `address beneficiary`, `uint256 amount`, `bytes32 termsHash`.
- Produces: `MockUSD.mint(address,uint256)`, `PaymentRegistry.createPayment(bytes32,address,uint256,bytes32)`, `approvePayment(bytes32)`, `settlePayment(bytes32)` and the three specified payment events.

- [x] **Step 1: Write failing unit tests for `MockUSD`**

Test initial token metadata, authorized demo minting, rejection of unauthorized minting, zero-address mint rejection, and exact balance changes. Assert that token decimals are a named deployment constant and not an implicit UI assumption.

- [x] **Step 2: Run the MockUSD tests to verify they fail**

Run: `pnpm --filter @payment-demo/contracts test -- --grep MockUSD`

Expected: FAIL because contracts are absent.

- [x] **Step 3: Implement `MockUSD` using reviewed OpenZeppelin ERC-20 and access-control primitives**

Expose only the required testnet issuer capability. Write English comments only where a security or testnet-only decision is not obvious from the code.

- [x] **Step 4: Write failing lifecycle tests for `PaymentRegistry`**

Test successful create → payment approval → exact ERC-20 allowance → settlement. Add isolated tests for zero beneficiary, zero amount, duplicate ID, non-payer calls, settlement before approval, settlement twice, immutable token address, insufficient allowance and insufficient payer balance. Assert all event fields and no registry token balance after settlement.

- [x] **Step 5: Run the registry tests to verify they fail**

Run: `pnpm --filter @payment-demo/contracts test -- --grep PaymentRegistry`

Expected: FAIL because `PaymentRegistry` is absent.

- [x] **Step 6: Implement `PaymentRegistry` with direct `SafeERC20.safeTransferFrom` settlement**

Use an immutable `MockUSD` address and an enum with created, approved and settled states. Persist only the fields named by the spec. Do not add custody, cancel, refund, token swapping, bridge behavior or generic admin controls.

- [x] **Step 7: Run contract tests, compiler, and static checks**

Run: `pnpm --filter @payment-demo/contracts test && pnpm --filter @payment-demo/contracts build && pnpm --filter @payment-demo/contracts lint`

Expected: PASS.

- [x] **Step 8: Add the Ignition deployment module and test-only mint script**

The module deploys `MockUSD` then injects its address into `PaymentRegistry`. The mint script reads explicit `MOCK_USD_ADDRESS`, `MOCK_USD_RECIPIENT` and `MOCK_USD_AMOUNT` environment values, refuses unsupported chain IDs, and reads the signer from the Hardhat keystore or ignored environment configuration. Hardhat 3 `run` does not forward free-form script arguments.

- [x] **Step 9: Commit the contracts**

```bash
git add contracts .env.example README.md
git commit -m "feat: add testnet settlement contracts"
```

### Task 3: Build the backend domain, persistence, and deterministic quote service

**Files:**
- Create: `apps/web/src/lib/server/db.ts`
- Create: `apps/web/src/lib/server/payment-service.ts`
- Create: `apps/web/src/lib/server/payment-validator.ts`
- Create: `apps/web/src/lib/quote.ts`, `apps/web/src/lib/config.ts`
- Create: `apps/web/drizzle/0000_initial.sql`
- Create: `apps/web/tests/payment-service.test.ts`, `apps/web/tests/quote.test.ts`
- Modify: `apps/web/package.json`, `packages/shared/src/payment.ts`

**Interfaces:**
- Consumes: `CreatePaymentInput { payerAddress, beneficiaryAddress, brlAmountCents, quotedRateBps, feeBps }`.
- Produces: `createScenario(input): PaymentScenario`, `approveCommercial(id): PaymentScenario`, `getScenario(id): PaymentScenario`, and `calculateQuote(input): Quote`.

- [x] **Step 1: Write failing quote tests**

Pin a documented fixed BRL/USD rate, a fee in basis points, rounding direction, and conversion of the resulting `MockUSD` amount to atomic units. Test malformed currency inputs and exact monetary boundaries without JavaScript floating point arithmetic.

- [x] **Step 2: Run quote tests to verify they fail**

Run: `pnpm --filter @payment-demo/web test -- quote.test.ts`

Expected: FAIL because the quote service is absent.

- [x] **Step 3: Implement the deterministic quote module**

Use integer cents, basis points and `bigint`. Define the fixed rate in one server configuration value and return an explanatory label marking it simulated.

- [x] **Step 4: Write failing service tests for scenario persistence and commercial approval**

Test valid fictional scenario creation, invalid EVM address rejection, server-generated unique `paymentId`, canonical `termsHash`, explicit commercial approval, preservation of previous transaction evidence, and prohibition of creating a real-world payment label or banking fields.

- [x] **Step 5: Run service tests to verify they fail**

Run: `pnpm --filter @payment-demo/web test -- payment-service.test.ts`

Expected: FAIL because database schema and service are absent.

- [x] **Step 6: Implement the SQLite schema and payment service**

Create `payment_scenarios` and `payment_transactions` tables. Store public addresses, hashes, chain IDs, serialized atomic amounts, fictional metadata and observed states only. Do not add authentication tables, banking fields, uploaded documents or wallet secrets.

- [x] **Step 7: Run backend domain tests and migration validation**

Run: `pnpm --filter @payment-demo/web test && pnpm --filter @payment-demo/web db:check`

Expected: PASS.

- [x] **Step 8: Commit backend domain and persistence**

```bash
git add apps/web packages/shared
git commit -m "feat: add fictional payment scenario backend"
```

### Task 4: Implement receipt verification and API routes

**Files:**
- Create: `apps/web/src/lib/server/optimism-adapter.ts`
- Create: `apps/web/src/app/api/payments/route.ts`
- Create: `apps/web/src/app/api/payments/[id]/route.ts`
- Create: `apps/web/src/app/api/payments/[id]/commercial-approval/route.ts`
- Create: `apps/web/src/app/api/payments/[id]/transactions/route.ts`
- Create: `apps/web/src/app/api/payments/[id]/transactions/[stage]/verify/route.ts`
- Create: `apps/web/tests/optimism-adapter.test.ts`, `apps/web/tests/payment-routes.test.ts`
- Modify: `apps/web/src/lib/server/payment-service.ts`, `apps/web/src/lib/config.ts`

**Interfaces:**
- Consumes: `recordTransaction(id, { stage, chainId, hash })` and `verifyTransaction(id, stage): VerifiedTransaction`.
- Produces: `OptimismAdapter.verifyL1Deposit(hash, payer)`, `verifyL2PaymentEvent(hash, expectedPayment)`, `verifyL2Allowance(hash, expectedAllowance)`, and JSON API responses with `PaymentScenario`.

- [x] **Step 1: Write failing adapter tests with mocked Viem public clients**

Cover successful L1 deposit receipt, pending receipt, reverted receipt, wrong source chain, L2 receipt from the wrong registry address, event with wrong `paymentId`, mismatched payer/beneficiary/amount, payment event success, allowance success, and RPC failure.

- [x] **Step 2: Run adapter tests to verify they fail**

Run: `pnpm --filter @payment-demo/web test -- optimism-adapter.test.ts`

Expected: FAIL because the adapter is absent.

- [x] **Step 3: Implement `OptimismAdapter` with allowlisted Viem public clients**

Build explorer URLs from reviewed chain configuration. Parse only the deployed bridge and contract ABIs. Return `pending`, `confirmed`, `reverted` or `unavailable`; never infer a confirmation from a browser claim.

- [x] **Step 4: Write failing HTTP route tests**

Cover malformed payloads, non-existent scenario, invalid commercial-approval order, fabricated hash, duplicate stage hash, refresh after pending receipt, valid confirmation and idempotent re-verification.

- [x] **Step 5: Run route tests to verify they fail**

Run: `pnpm --filter @payment-demo/web test -- payment-routes.test.ts`

Expected: FAIL because API routes are absent.

- [x] **Step 6: Implement Zod-validated API routes and status derivation**

Routes receive only allowlisted stages, chain IDs and transaction hashes. The backend stores submitted evidence separately from confirmed evidence and derives the display state after verification.

- [x] **Step 7: Run the backend test suite and typecheck**

Run: `pnpm --filter @payment-demo/web test && pnpm --filter @payment-demo/web typecheck`

Expected: PASS.

- [x] **Step 8: Commit receipt verification and APIs**

```bash
git add apps/web
git commit -m "feat: verify testnet payment evidence"
```

### Task 5: Build the accessible fictional-payment interface

**Files:**
- Create: `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`
- Create: `apps/web/src/components/invoice-form.tsx`, `apps/web/src/components/quote-card.tsx`, `apps/web/src/components/payment-stepper.tsx`, `apps/web/src/components/proof-cards.tsx`
- Create: `apps/web/src/features/payment/payment-machine.ts`, `apps/web/src/features/payment/payment-types.ts`
- Create: `apps/web/tests/payment-machine.test.ts`, `apps/web/tests/page.test.tsx`

**Interfaces:**
- Consumes: `PaymentScenario` from the API and wallet state from Task 6.
- Produces: `getAllowedAction(scenario, wallet): PaymentAction`, `PaymentStepper`, a valid draft submission, and proof cards for verified transaction records.

- [x] **Step 1: Write failing state-machine tests**

Test that commercial approval follows a quote, L2 actions remain disabled until deposit credit is confirmed, payout simulation follows only a confirmed settlement, pending work prevents duplicates, and account/network changes invalidate a pending action.

- [x] **Step 2: Run state-machine tests to verify they fail**

Run: `pnpm --filter @payment-demo/web test -- payment-machine.test.ts`

Expected: FAIL because the feature module is absent.

- [x] **Step 3: Implement the pure payment state machine**

Keep state transition logic independent of React and wallet providers. Use server-confirmed status as the only source for confirmed stages.

- [x] **Step 4: Write failing component tests for the main demonstration screen**

Assert permanent testnet warning, associated field labels and validation messages, no real-payment terminology, disabled unsupported stages, full addresses/amounts in confirmation summaries, and explorer links only for known hashes.

- [x] **Step 5: Run component tests to verify they fail**

Run: `pnpm --filter @payment-demo/web test -- page.test.tsx`

Expected: FAIL because components are absent.

- [x] **Step 6: Implement the one-page UI and responsive accessibility baseline**

Use semantic form controls, keyboard-operable actions, focus management, non-color status labels and a responsive proof layout. Retain form values after recoverable errors. Do not add login, dashboard, history, user analytics, language switching or visual features outside `docs/frontend.md`.

- [x] **Step 7: Run component tests, lint, typecheck, and production build**

Run: `pnpm --filter @payment-demo/web test && pnpm --filter @payment-demo/web lint && pnpm --filter @payment-demo/web typecheck && pnpm --filter @payment-demo/web build`

Expected: PASS.

- [x] **Step 8: Commit the payment interface**

```bash
git add apps/web
git commit -m "feat: add accessible payment demonstration UI"
```

### Task 6: Integrate the injected wallet and contract actions

**Files:**
- Create: `apps/web/src/lib/wagmi.ts`, `apps/web/src/lib/contracts.ts`, `apps/web/src/lib/explorer.ts`
- Create: `apps/web/src/components/wallet-panel.tsx`, `apps/web/src/components/transaction-action.tsx`
- Create: `apps/web/src/features/payment/use-payment-flow.ts`
- Create: `apps/web/tests/use-payment-flow.test.tsx`, `apps/web/tests/transaction-action.test.tsx`
- Modify: `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/features/payment/payment-machine.ts`

**Interfaces:**
- Consumes: contract addresses/ABIs from verified deployment configuration, `PaymentScenario`, Wagmi account/chain state, and API transaction endpoints.
- Produces: `usePaymentFlow(scenario): { actions, actionState, submitAction }` and one explicit UI action per wallet write.

- [x] **Step 1: Write failing wallet-flow tests with a mocked EIP-1193 provider**

Cover disconnected state, unsupported network, requested switch to Sepolia or OP Sepolia, user rejection, exact allowance request, wrong spender, insufficient ETH, account change after simulation, chain change after simulation, transaction submitted, receipt success, revert, replacement and duplicate-click prevention.

- [x] **Step 2: Run wallet-flow tests to verify they fail**

Run: `pnpm --filter @payment-demo/web test -- use-payment-flow.test.tsx transaction-action.test.tsx`

Expected: FAIL because wallet configuration and hooks are absent.

- [x] **Step 3: Configure Wagmi and Viem with only the two approved chains and an injected connector**

Use explicit transports and typed ABI artifacts. The wallet connection is initiated only by a user click. Keep all RPC credential handling server-only when credentials are used.

- [x] **Step 4: Implement each write with simulation, explicit confirmation data, receipt waiting, API verification, and state refresh**

Implement exactly six transaction actions: L1 ETH deposit, L2 `createPayment`, L2 `approvePayment`, L2 exact `MockUSD.approve`, L2 `settlePayment`, and explicit L2 deposit-credit refresh. Revalidate account, chain, target, calldata and amount after simulation and immediately before prompting.

- [x] **Step 5: Run wallet integration tests and build**

Run: `pnpm --filter @payment-demo/web test && pnpm --filter @payment-demo/web build`

Expected: PASS.

- [x] **Step 6: Commit wallet integration**

```bash
git add apps/web
git commit -m "feat: add testnet wallet payment flow"
```

### Task 7: Verify browser behavior and document manual testnet evidence

**Files:**
- Create: `apps/web/tests/e2e/payment-flow.spec.ts`
- Create: `docs/deployment-evidence.md`
- Modify: `README.md`, `docs/frontend.md`

**Interfaces:**
- Consumes: local mocked-provider application from Tasks 1–6 and deployed contract addresses only after manual deployment.
- Produces: browser test evidence for the mocked end-to-end sequence and a manual evidence template with no fabricated hashes.

- [x] **Step 1: Write the failing Playwright scenario**

Use a mocked injected provider to cover form entry, quote, commercial approval, incorrect-network guard, L1 deposit submitted state, pending L2 credit, L2 actions unlocked after confirmed evidence, wallet rejection, exact token approval, confirmed settlement and payout simulation.

- [x] **Step 2: Run the browser test to verify it fails**

Run: `pnpm --filter @payment-demo/web test:e2e -- payment-flow.spec.ts`

Expected: FAIL because the complete local flow is not yet wired.

- [x] **Step 3: Implement only the missing integration seams needed for the scenario**

Keep the browser test deterministic by mocking wallet/RPC responses; it must not use a live wallet, faucet, private key, or public testnet call.

- [x] **Step 4: Run browser tests and the full local verification suite**

Run: `pnpm test && pnpm build && git diff --check`

Expected: PASS.

- [x] **Step 5: Create the testnet evidence template**

Document fields for date, deployed addresses, deployer address, block numbers, L1 deposit hash, L2 receipt/hash, `PaymentSettled` hash, explorer links and confirmed pending items. Leave all values blank until a real manual testnet run verifies them.

- [x] **Step 6: Commit local verification and evidence template**

```bash
git add apps/web/tests docs README.md
git commit -m "test: cover end-to-end payment demonstration"
```

### Task 8: Perform manual OP Sepolia release evidence collection

**Files:**
- Modify: `docs/deployment-evidence.md`, `README.md`

**Interfaces:**
- Consumes: manually deployed contract addresses, test wallets funded with test ETH only, and the browser application.
- Produces: verified public evidence for the exact deployed version.

- [x] **Step 1: Check ignored environment configuration and active network before deployment**

Confirm the intended account is a test wallet and the target is OP Sepolia. Do not print or copy private material.

- [x] **Step 2: Deploy `MockUSD` and `PaymentRegistry` to OP Sepolia and verify receipts**

Record addresses, deployment hashes and block numbers only after public receipt/bytecode checks. Keep source verification as a separately recorded state.

- [x] **Step 3: Execute the manual two-network journey in a visible browser**

Use test ETH only: deposit from Ethereum Sepolia, wait for L2 credit, mint demo `MockUSD` to the payer, create/approve/allow/settle the payment, and inspect the beneficiary balance.

- [x] **Step 4: Record only verified public artifacts in documentation**

Update `docs/deployment-evidence.md` and `README.md` with exact addresses, hashes, blocks, explorer links and outstanding verification status. Never add private configuration.

- [x] **Step 5: Perform final release checks and commit the evidence update**

Run: `pnpm test && pnpm build && git diff --check`

Result: `pnpm test` (19 shared, 110 web/backend and 18 contract tests), web typecheck, lint, build, two Playwright tests and `git diff --check` passed. Public records match the observed receipts.

```bash
git add docs README.md
git commit -m "docs: record OP Sepolia demonstration evidence"
```

## Plan Self-Review

- **Spec coverage:** Tasks 2, 4 and 6 cover contracts, bridge evidence and wallet actions; Tasks 3 and 4 cover the fictional backend; Tasks 5 and 6 cover frontend, accessibility and transaction UX; Tasks 7 and 8 cover local and real-testnet verification. `docs/mvp-scope.md` exclusions are repeated as constraints where an implementation could drift into them.
- **Step scan:** Every task begins with a failing test, specifies an interface, implements a bounded unit and ends with an independently checkable command and commit.
- **Type consistency:** `PaymentScenario`, `PaymentStage`, `TransactionStage`, `Quote`, `paymentId` and atomic `bigint` amounts originate in Task 1 and are consumed consistently by contracts, backend and UI tasks.
- **Review Focus:** Each of the five likely failure conditions appears in the owning task's explicit test step.
- **Proportion:** The plan gives interfaces, files, assertions and commands without embedding contract, backend or frontend implementation bodies.
