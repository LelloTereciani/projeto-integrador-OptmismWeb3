import { expect, test, type Page, type Route } from "@playwright/test";
import { encodeAbiParameters } from "viem";

const PAYER = "0x1000000000000000000000000000000000000001";
const BENEFICIARY = "0x2000000000000000000000000000000000000002";
const REGISTRY = "0x3000000000000000000000000000000000000003";
const MOCK_USD = "0x4000000000000000000000000000000000000004";
const PAYMENT_ID = `0x${"a".repeat(64)}`;
const TERMS_HASH = `0x${"b".repeat(64)}`;
const L2_DEPOSIT_HASH = `0x${"6".repeat(64)}`;
const TRANSACTION_HASHES = [1, 2, 3, 4, 5].map(
  (digit) => `0x${String(digit).repeat(64)}`,
);

type PaymentStage =
  | "quoted"
  | "commercially-approved"
  | "l1-submitted"
  | "l2-credit-pending"
  | "l2-credited"
  | "l2-ready"
  | "created"
  | "approved"
  | "token-approved"
  | "settlement-submitted"
  | "settled"
  | "payout-simulated";

interface TransactionEvidence {
  stage: string;
  chainId: number;
  hash: string;
  status: "submitted" | "pending" | "confirmed";
  blockNumber?: string;
}

interface MockScenario {
  id: string;
  paymentId: string;
  termsHash: string;
  stage: PaymentStage;
  scenarioType: "fictional-testnet";
  payer: string;
  beneficiary: string;
  quote: {
    brlAmount: string;
    mockUsdAmount: string;
    exchangeRate: string;
    feeAmount: string;
    simulationLabel: string;
  };
  transactions: TransactionEvidence[];
  createdAt: string;
  updatedAt: string;
  commerciallyApprovedAt?: string;
}

async function installInjectedWallet(page: Page) {
  await page.addInitScript(
    ({ account, hashes }) => {
      let chainId = 11155420;
      let rejectNextTransaction = true;
      let hashIndex = 0;
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
      const requests: Array<{ method: string; params?: unknown }> = [];

      const provider = {
        isMetaMask: true,
        on(event: string, listener: (...args: unknown[]) => void) {
          const eventListeners = listeners.get(event) ?? new Set();
          eventListeners.add(listener);
          listeners.set(event, eventListeners);
          return provider;
        },
        removeListener(event: string, listener: (...args: unknown[]) => void) {
          listeners.get(event)?.delete(listener);
          return provider;
        },
        async request(input: { method: string; params?: unknown }) {
          requests.push(input);
          switch (input.method) {
            case "eth_accounts":
            case "eth_requestAccounts":
              return [account];
            case "eth_chainId":
              return `0x${chainId.toString(16)}`;
            case "wallet_switchEthereumChain": {
              const params = input.params as [{ chainId: string }];
              chainId = Number.parseInt(params[0].chainId, 16);
              for (const listener of listeners.get("chainChanged") ?? []) {
                listener(params[0].chainId);
              }
              return null;
            }
            case "eth_sendTransaction": {
              if (rejectNextTransaction) {
                rejectNextTransaction = false;
                throw Object.assign(new Error("User rejected the request"), { code: 4001 });
              }
              const hash = hashes[hashIndex];
              hashIndex += 1;
              return hash;
            }
            case "eth_getBalance":
              return "0xde0b6b3a7640000";
            case "eth_estimateGas":
              return "0x30d40";
            case "wallet_getCapabilities":
              return {};
            case "wallet_watchAsset":
              return true;
            default:
              throw new Error(`Unexpected injected wallet method: ${input.method}`);
          }
        },
      };

      Object.defineProperty(window, "ethereum", {
        configurable: true,
        value: provider,
      });
      Object.defineProperty(window, "__walletRequests", {
        configurable: true,
        value: requests,
      });
    },
    { account: PAYER, hashes: TRANSACTION_HASHES },
  );
}

function rpcResult(method: string, params: unknown[] | undefined, isL1: boolean): unknown {
  switch (method) {
    case "eth_call": {
      const call = params?.[0] as { data?: string } | undefined;
      if (call?.data?.startsWith("0x70a08231")) {
        return encodeAbiParameters([{ type: "uint256" }], [19_800_000n]);
      }
      if (call?.data?.startsWith("0x82ad56cb")) {
        return encodeAbiParameters(
          [{ type: "tuple[]", components: [{ name: "success", type: "bool" }, { name: "returnData", type: "bytes" }] }],
          [[{ success: true, returnData: encodeAbiParameters([{ type: "uint256" }], [isL1 ? 1_000_000_000_000_000_000n : 19_800_000n]) }]],
        );
      }
      return call?.data?.startsWith("0x095ea7b3")
        ? `0x${"0".repeat(63)}1`
        : "0x";
    }
    case "eth_getBalance":
      return "0xde0b6b3a7640000";
    case "eth_estimateGas":
      return "0x30d40";
    case "eth_blockNumber":
      return "0x65";
    case "eth_getTransactionReceipt": {
      const hash = String(params?.[0]);
      return {
        blockHash: `0x${"c".repeat(64)}`,
        blockNumber: "0x65",
        contractAddress: null,
        cumulativeGasUsed: "0x5208",
        effectiveGasPrice: "0x1",
        from: PAYER,
        gasUsed: "0x5208",
        logs: [],
        logsBloom: `0x${"0".repeat(512)}`,
        status: "0x1",
        to: REGISTRY,
        transactionHash: hash,
        transactionIndex: "0x0",
        type: "0x2",
      };
    }
    default:
      throw new Error(`Unexpected mocked RPC method: ${method}`);
  }
}

async function installMockRpc(page: Page) {
  for (const endpoint of [
    "https://11155111.rpc.thirdweb.com/**",
    "https://sepolia.optimism.io/**",
  ]) {
    await page.route(endpoint, async (route) => {
      const payload = route.request().postDataJSON() as
        | { id: number; method: string; params?: unknown[] }
        | Array<{ id: number; method: string; params?: unknown[] }>;
      const requests = Array.isArray(payload) ? payload : [payload];
      const response = requests.map((request) => ({
        jsonrpc: "2.0",
        id: request.id,
        result: rpcResult(request.method, request.params, endpoint.includes("11155111")),
      }));
      await route.fulfill({
        contentType: "application/json",
        json: Array.isArray(payload) ? response : response[0],
      });
    });
  }
}

function scenarioFixture(): MockScenario {
  return {
    id: "scenario-e2e-001",
    paymentId: PAYMENT_ID,
    termsHash: TERMS_HASH,
    stage: "quoted",
    scenarioType: "fictional-testnet",
    payer: PAYER,
    beneficiary: BENEFICIARY,
    quote: {
      brlAmount: "100.00",
      mockUsdAmount: "19800000",
      exchangeRate: "R$ 5,0000 por MockUSD",
      feeAmount: "1.00",
      simulationLabel: "Cotação fixa simulada",
    },
    transactions: [],
    createdAt: "2026-10-04T12:00:00.000Z",
    updatedAt: "2026-10-04T12:00:00.000Z",
  };
}

function responseBody(scenario: MockScenario): MockScenario {
  return structuredClone(scenario);
}

async function fulfillScenario(route: Route, scenario: MockScenario, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "no-store" },
    json: responseBody(scenario),
  });
}

async function installMockApi(page: Page, initialStage: PaymentStage = "quoted") {
  const scenario = scenarioFixture();
  scenario.stage = initialStage;
  let depositVerificationCount = 0;

  await page.route("**/api/payments**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === "/api/payments" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as { brlAmountCents?: string };
      if (payload.brlAmountCents === "2526") {
        scenario.quote = { ...scenario.quote, brlAmount: "25.26", mockUsdAmount: "5000000", feeAmount: "0.26" };
      } else if (payload.brlAmountCents === "12000") {
        scenario.quote = { ...scenario.quote, brlAmount: "120.00", mockUsdAmount: "23760000", feeAmount: "1.20" };
      }
      await fulfillScenario(route, scenario, 201);
      return;
    }

    if (path === `/api/payments/${scenario.id}` && route.request().method() === "GET") {
      await fulfillScenario(route, scenario);
      return;
    }

    if (path.endsWith("/commercial-approval")) {
      scenario.stage = "commercially-approved";
      scenario.commerciallyApprovedAt = "2026-10-04T12:01:00.000Z";
      await fulfillScenario(route, scenario);
      return;
    }

    if (path.endsWith("/use-l2-balance")) {
      if (BigInt(scenario.quote.mockUsdAmount) > 19_800_000n) {
        await route.fulfill({ status: 409, json: { error: "Saldo de MockUSD insuficiente na carteira pagadora na OP Sepolia para esta cotação." } });
        return;
      }
      scenario.stage = "l2-ready";
      await fulfillScenario(route, scenario);
      return;
    }

    if (path.endsWith("/transactions")) {
      const transaction = route.request().postDataJSON() as {
        stage: string;
        chainId: number;
        hash: string;
      };
      scenario.transactions.push({ ...transaction, status: "submitted" });
      if (transaction.stage === "l1-deposit") scenario.stage = "l1-submitted";
      if (transaction.stage === "payment-settle") scenario.stage = "settlement-submitted";
      await fulfillScenario(route, scenario, 201);
      return;
    }

    if (path.includes("/transactions/") && path.endsWith("/verify")) {
      const stage = path.split("/").at(-2);
      if (!stage) throw new Error("Missing mocked transaction stage");
      const transaction = [...scenario.transactions].reverse().find((item) => item.stage === stage);
      if (!transaction) throw new Error(`No recorded transaction for ${stage}`);

      transaction.status = "confirmed";
      transaction.blockNumber = "101";
      if (stage === "l1-deposit") {
        depositVerificationCount += 1;
        const l2Evidence = scenario.transactions.find(
          (item) => item.stage === "l2-deposit-credit",
        );
        if (depositVerificationCount === 1) {
          scenario.stage = "l2-credit-pending";
          scenario.transactions.push({
            stage: "l2-deposit-credit",
            chainId: 11155420,
            hash: L2_DEPOSIT_HASH,
            status: "pending",
          });
        } else {
          scenario.stage = "l2-credited";
          if (l2Evidence) {
            l2Evidence.status = "confirmed";
            l2Evidence.blockNumber = "102";
          }
        }
      } else {
        const stageAfterVerification: Record<string, PaymentStage> = {
          "payment-create": "created",
          "payment-approve": "approved",
          "token-approve": "token-approved",
          "payment-settle": "settled",
        };
        const nextStage = stageAfterVerification[stage];
        if (!nextStage) {
          await route.fulfill({ status: 404, json: { error: "Unsupported mocked stage" } });
          return;
        }
        scenario.stage = nextStage;
      }
      await fulfillScenario(route, scenario);
      return;
    }

    if (path.endsWith("/simulate-payout")) {
      scenario.stage = "payout-simulated";
      await fulfillScenario(route, scenario);
      return;
    }

    await route.fulfill({ status: 404, json: { error: `Unhandled mocked API path: ${path}` } });
  });

  return scenario;
}

test("completes the mocked payment journey only after wallet and server evidence", async ({ page }) => {
  await installInjectedWallet(page);
  await installMockRpc(page);
  await installMockApi(page);

  await page.goto("/");
  await expect(page.getByText("Ambiente de demonstração — sem dinheiro real").first()).toBeVisible();

  await page.getByLabel("Carteira pagadora de teste").fill(PAYER);
  await page.getByLabel("Carteira beneficiária de teste").fill(BENEFICIARY);
  await page.getByLabel("Valor fictício em BRL").fill("100,00");
  await page.getByRole("button", { name: "Gerar cotação simulada" }).click();

  await expect(page.getByText("19.800000 MockUSD", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/scenario=scenario-e2e-001/);
  await page.getByRole("button", { name: "Aprovar cenário fictício" }).click();
  await expect(page.getByText("Cenário aprovado comercialmente")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Cenário aprovado comercialmente")).toBeVisible();

  await page.getByRole("button", { name: "Conectar carteira" }).click();
  await expect(page.getByText("0x1000…0001")).toBeVisible();
  await page.getByRole("button", { name: "Demonstrar depósito L1 → L2 (opcional)" }).click();
  await expect(page.getByRole("button", { name: "Trocar para Ethereum Sepolia" })).toBeVisible();
  await page.getByRole("button", { name: "Trocar para Ethereum Sepolia" }).click();

  await page.getByRole("button", { name: "Revisar e abrir a carteira" }).click();
  await expect(page.getByText("A solicitação foi rejeitada na carteira.", { exact: true })).toBeVisible();
  await expect(page.getByText("Cenário aprovado comercialmente")).toBeVisible();

  await page.getByRole("button", { name: "Revisar e abrir a carteira" }).click();
  await expect(page.getByRole("heading", { name: "Verificar crédito na OP Sepolia" })).toBeVisible();
  await expect(page.getByText("Depósito enviado na L1")).toBeVisible();
  await expect(page.getByText("Confirmada").first()).toBeVisible();
  await expect(page.getByText("Crédito confirmado na L2")).toBeVisible();
  await expect(page.getByText("Confirmando")).toBeVisible();

  await page.getByRole("button", { name: "Verificar crédito sem abrir a carteira" }).click();
  await expect(page.getByRole("heading", { name: "Criar operação na OP Sepolia" })).toBeVisible();
  await expect(page.locator("section.confirmation-summary + section.action-preview")).toBeVisible();
  await page.getByRole("button", { name: "Trocar para OP Sepolia" }).click();

  await page.getByRole("button", { name: "Revisar e abrir a carteira" }).click();
  await expect(page.getByRole("heading", { name: "Aprovar operação fictícia" })).toBeVisible();
  const actionButton = await page.locator("section.action-preview .action-primary button").boundingBox();
  const reviewPanel = await page.locator("section.action-preview .transaction-review").boundingBox();
  expect(actionButton).not.toBeNull();
  expect(reviewPanel).not.toBeNull();
  expect(actionButton!.x + actionButton!.width).toBeLessThan(reviewPanel!.x);
  await page.getByRole("button", { name: "Revisar e abrir a carteira" }).click();
  await expect(page.getByRole("heading", { name: "Aprovar valor exato de MockUSD" })).toBeVisible();

  const tokenApproval = page.locator("section.action-preview").filter({
    has: page.getByRole("heading", { name: "Aprovar valor exato de MockUSD" }),
  });
  await expect(tokenApproval).toContainText(REGISTRY);
  await expect(tokenApproval).toContainText("19.800000 MockUSD de teste");
  await page.getByRole("button", { name: "Revisar e abrir a carteira" }).click();

  const exactApprovalData =
    "0x095ea7b3" +
    "0000000000000000000000003000000000000000000000000000000000000003" +
    "00000000000000000000000000000000000000000000000000000000012e1fc0";
  const walletTransactions = await page.evaluate(() =>
    (
      window as typeof window & {
        __walletRequests: Array<{ method: string; params?: unknown }>;
      }
    ).__walletRequests.filter((request) => request.method === "eth_sendTransaction"),
  );
  expect(walletTransactions).toContainEqual({
    method: "eth_sendTransaction",
    params: [{ from: PAYER, data: exactApprovalData, to: MOCK_USD, value: "0x0" }],
  });

  await expect(page.getByRole("heading", { name: "Liquidar MockUSD de teste" })).toBeVisible();
  await page.getByRole("button", { name: "Revisar e abrir a carteira" }).click();
  await expect(page.getByRole("heading", { name: "Exibir payout local simulado" })).toBeVisible();
  await page.getByRole("button", { name: "Exibir resultado simulado" }).click();

  const completion = page.locator("section.confirmation-summary + section.completion-card");
  await expect(completion.getByRole("heading", { name: "MockUSD entregue à carteira beneficiária" })).toBeVisible();
  await expect(completion).toContainText("19.800000 MockUSD");
  await expect(completion).toContainText(BENEFICIARY);
  await expect(completion).toContainText("Ele não criou nem converteu MockUSD");
  await expect(completion).toContainText("Não há resgate, câmbio ou envio bancário neste MVP");
  await expect(completion).toContainText(MOCK_USD);
  await expect(completion.getByRole("link", { name: "Ver a transferência de MockUSD no explorador" }))
    .toHaveAttribute("href", `https://sepolia-optimism.etherscan.io/tx/${TRANSACTION_HASHES[4]}`);
  await expect(page.getByText("Liquidação confirmada na L2")).toBeVisible();
  await expect(page.getByText("Payout local simulado")).toBeVisible();
});

test("pays 5 MUSD with existing L2 funds and skips the optional L1 deposit", async ({ page }) => {
  await installInjectedWallet(page);
  await installMockRpc(page);
  await installMockApi(page);

  await page.goto("/");
  await page.getByLabel("Carteira pagadora de teste").fill(PAYER);
  await page.getByLabel("Carteira beneficiária de teste").fill(BENEFICIARY);
  await page.getByLabel("Valor fictício em BRL").fill("25,26");
  await page.getByRole("button", { name: "Gerar cotação simulada" }).click();
  await expect(page.getByText("5.000000 MockUSD", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Aprovar cenário fictício" }).click();
  await page.getByRole("button", { name: "Conferir saldo sem abrir a carteira" }).click();
  await expect(page.getByRole("heading", { name: "Criar operação na OP Sepolia" })).toBeVisible();
  await page.getByRole("button", { name: "Conectar carteira" }).click();

  await page.getByRole("button", { name: "Revisar e abrir a carteira" }).click();
  await expect(page.getByText("A solicitação foi rejeitada na carteira.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revisar e abrir a carteira" }).click();
  await expect(page.getByRole("heading", { name: "Aprovar operação fictícia" })).toBeVisible();
  await page.getByRole("button", { name: "Revisar e abrir a carteira" }).click();
  await page.getByRole("button", { name: "Revisar e abrir a carteira" }).click();
  await page.getByRole("button", { name: "Revisar e abrir a carteira" }).click();
  await expect(page.getByRole("heading", { name: "Exibir payout local simulado" })).toBeVisible();
  await page.getByRole("button", { name: "Exibir resultado simulado" }).click();
  await expect(page.getByRole("heading", { name: "MockUSD entregue à carteira beneficiária" })).toBeVisible();

  const walletTransactions = await page.evaluate(() =>
    (window as typeof window & { __walletRequests: Array<{ method: string; params?: unknown }> })
      .__walletRequests.filter((request) => request.method === "eth_sendTransaction"),
  );
  expect(walletTransactions).toHaveLength(5);
  expect(walletTransactions.every((request) =>
    (request.params as Array<{ to: string }>)[0].to.toLowerCase() !== "0xfbb0621e0b23b5478b630bd55a5f21f67730b0f1"
  )).toBe(true);
  await page.getByRole("button", { name: "Mostrar MUSD na MetaMask" }).click();
  await expect(page.getByText(/MUSD adicionado à MetaMask/)).toBeVisible();
  await page.getByRole("button", { name: "Criar pagamento inverso com as carteiras trocadas" }).click();
  await expect(page.getByLabel("Carteira pagadora de teste")).toHaveValue(BENEFICIARY);
  await expect(page.getByLabel("Carteira beneficiária de teste")).toHaveValue(PAYER);
  await expect(page.getByLabel("Valor fictício em BRL")).toHaveValue("25,26");
});

test("shows the required and available MUSD for an amount above the payer balance", async ({ page }) => {
  await installInjectedWallet(page);
  await installMockRpc(page);
  await installMockApi(page);

  await page.goto("/");
  await page.getByLabel("Carteira pagadora de teste").fill(PAYER);
  await page.getByLabel("Carteira beneficiária de teste").fill(BENEFICIARY);
  await page.getByLabel("Valor fictício em BRL").fill("120,00");
  await page.getByRole("button", { name: "Gerar cotação simulada" }).click();
  await expect(page.getByText("Saldo de MUSD insuficiente para esta cotação.")).toBeVisible();
  await expect(page.getByText(/Disponível na pagadora.*19\.800000 MUSD.*Necessário.*23\.760000 MUSD/)).toBeVisible();
  await page.getByRole("button", { name: "Aprovar cenário fictício" }).click();
  await page.getByRole("button", { name: "Conferir saldo sem abrir a carteira" }).click();
  await expect(page.locator("section.action-preview").getByRole("alert")).toContainText("Saldo de MockUSD insuficiente");
  const walletTransactions = await page.evaluate(() =>
    (window as typeof window & { __walletRequests: Array<{ method: string }> })
      .__walletRequests.filter((request) => request.method === "eth_sendTransaction"),
  );
  expect(walletTransactions).toHaveLength(0);
});

test("restores the saved scenario from its URL without starting another deposit", async ({ page }) => {
  await installInjectedWallet(page);
  await installMockRpc(page);
  await installMockApi(page, "created");

  await page.goto("/?scenario=scenario-e2e-001");
  await expect(page.getByText("scenario-e2e-001")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aprovar operação fictícia" })).toBeVisible();

  await page.reload();
  await expect(page.getByText("scenario-e2e-001")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aprovar operação fictícia" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Depositar ETH de teste" })).toHaveCount(0);
});

test("refreshes a stale step when a confirmed transaction has advanced the server", async ({ page }) => {
  await installMockRpc(page);
  const scenario = await installMockApi(page, "l2-ready");

  await page.goto("/?scenario=scenario-e2e-001");
  await expect(page.getByRole("heading", { name: "Criar operação na OP Sepolia" })).toBeVisible();

  scenario.stage = "created";
  scenario.updatedAt = "2026-10-04T12:01:00.000Z";
  scenario.transactions.push({
    stage: "payment-create",
    chainId: 11155420,
    hash: TRANSACTION_HASHES[0],
    status: "confirmed",
    blockNumber: "101",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Aprovar operação fictícia" })).toBeVisible();
});
