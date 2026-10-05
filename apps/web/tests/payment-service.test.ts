import { describe, expect, it } from "vitest";

import { createPaymentDatabase } from "../src/lib/server/db";
import { createPaymentService } from "../src/lib/server/payment-service";

const PAYER = "0x1111111111111111111111111111111111111111";
const BENEFICIARY = "0x2222222222222222222222222222222222222222";

function validInput() {
  return {
    payerAddress: PAYER,
    beneficiaryAddress: BENEFICIARY,
    brlAmountCents: 10_000n,
    quotedRateBps: 1n,
    feeBps: 9_999n,
  };
}

describe("payment persistence schema", () => {
  it("creates only the restricted payment persistence schema", () => {
    const database = createPaymentDatabase(":memory:");

    const tables = database.client
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>;
    const scenarioColumns = database.client
      .prepare("PRAGMA table_info(payment_scenarios)")
      .all() as Array<{ name: string }>;

    expect(tables.map(({ name }) => name)).toEqual(["payment_scenarios", "payment_transactions"]);
    expect(scenarioColumns.map(({ name }) => name)).toEqual([
      "id",
      "payment_id",
      "stage",
      "payer_address",
      "beneficiary_address",
      "brl_amount_cents",
      "rate_bps",
      "fee_bps",
      "fee_amount_cents",
      "mock_usd_amount",
      "terms_hash",
      "fictional_metadata",
      "created_at",
      "updated_at",
      "commercially_approved_at",
    ]);
    expect(scenarioColumns.map(({ name }) => name).join(" ")).not.toMatch(
      /account|bank|cnpj|company|customer|email|invoice|key|name|pix|signature/i,
    );

    database.close();
  });

  it("rejects transaction evidence stored on the wrong network", () => {
    const database = createPaymentDatabase(":memory:");
    const created = createPaymentService(database).createScenario(validInput());

    expect(() =>
      database.client
        .prepare(
          `INSERT INTO payment_transactions
            (scenario_id, stage, chain_id, transaction_hash, status, block_number, observed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          created.id,
          "l1-deposit",
          11155420,
          `0x${"b".repeat(64)}`,
          "confirmed",
          "456",
          "2026-10-04T12:00:00.000Z",
        ),
    ).toThrow(/check constraint/i);

    database.close();
  });
});

describe("payment service", () => {
  it("creates and reloads a fictional scenario from SQLite", () => {
    const database = createPaymentDatabase(":memory:");
    const created = createPaymentService(database).createScenario(validInput());
    const reloaded = createPaymentService(database).getScenario(created.id);

    expect(reloaded).toEqual(created);
    expect(reloaded).toMatchObject({
      stage: "quoted",
      scenarioType: "fictional-testnet",
      payer: PAYER,
      beneficiary: BENEFICIARY,
      quote: {
        brlAmount: "100.00",
        feeAmount: "1.00",
        mockUsdAmount: 19_800_000n,
      },
      transactions: [],
    });
    expect(reloaded.paymentId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(reloaded.termsHash).toMatch(/^0x[0-9a-f]{64}$/);

    database.close();
  });

  it("generates a unique payment ID while hashing identical canonical terms identically", () => {
    const database = createPaymentDatabase(":memory:");
    const service = createPaymentService(database);

    const first = service.createScenario(validInput());
    const second = service.createScenario(validInput());

    expect(first.id).not.toBe(second.id);
    expect(first.paymentId).not.toBe(second.paymentId);
    expect(first.termsHash).toBe(second.termsHash);
    database.close();
  });

  it("ignores client rate and fee claims in favor of server configuration", () => {
    const database = createPaymentDatabase(":memory:");
    const service = createPaymentService(database);

    const first = service.createScenario(validInput());
    const second = service.createScenario({
      ...validInput(),
      quotedRateBps: 999_999_999n,
      feeBps: 0n,
    });

    expect(first.quote).toEqual(second.quote);
    expect(first.termsHash).toBe(second.termsHash);
    database.close();
  });

  it("requires an explicit one-time commercial approval", () => {
    const database = createPaymentDatabase(":memory:");
    const service = createPaymentService(database);
    const created = service.createScenario(validInput());

    expect(service.getScenario(created.id).stage).toBe("quoted");
    expect(service.approveCommercial(created.id).stage).toBe("commercially-approved");
    expect(() => service.approveCommercial(created.id)).toThrow(/already commercially approved/i);
    database.close();
  });

  it("preserves existing transaction evidence during commercial approval", () => {
    const database = createPaymentDatabase(":memory:");
    const service = createPaymentService(database);
    const created = service.createScenario(validInput());

    database.client
      .prepare(
        `INSERT INTO payment_transactions
          (scenario_id, stage, chain_id, transaction_hash, status, block_number, observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        created.id,
        "l1-deposit",
        11155111,
        `0x${"a".repeat(64)}`,
        "confirmed",
        "123",
        "2026-10-04T12:00:00.000Z",
      );

    const approved = service.approveCommercial(created.id);

    expect(approved.transactions).toEqual([
      {
        stage: "l1-deposit",
        chainId: 11155111,
        hash: `0x${"a".repeat(64)}`,
        status: "confirmed",
        blockNumber: "123",
      },
    ]);
    database.close();
  });

  it.each([
    ["payer", { payerAddress: "0x1234" }],
    ["beneficiary", { beneficiaryAddress: "not-an-address" }],
    ["zero address", { beneficiaryAddress: `0x${"0".repeat(40)}` }],
    ["same wallet", { beneficiaryAddress: PAYER }],
  ])("rejects an invalid %s", (_label, override) => {
    const database = createPaymentDatabase(":memory:");
    const service = createPaymentService(database);

    expect(() => service.createScenario({ ...validInput(), ...override })).toThrow(/address|wallet/i);
    database.close();
  });

  it.each([
    ["paymentLabel", "Customer invoice 123"],
    ["bankAccount", "0001-9"],
    ["pixKey", "customer@example.com"],
  ])("rejects unsupported real-world field %s", (field, value) => {
    const database = createPaymentDatabase(":memory:");
    const service = createPaymentService(database);

    expect(() => service.createScenario({ ...validInput(), [field]: value })).toThrow(
      new RegExp(`unsupported.*${field}`, "i"),
    );
    database.close();
  });

  it("rejects retrieval and approval of a missing scenario", () => {
    const database = createPaymentDatabase(":memory:");
    const service = createPaymentService(database);

    expect(() => service.getScenario("missing")).toThrow(/not found/i);
    expect(() => service.approveCommercial("missing")).toThrow(/not found/i);
    database.close();
  });
});
