import { readFileSync } from "node:fs";
import { join } from "node:path";

import BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const paymentScenarios = sqliteTable(
  "payment_scenarios",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id").notNull(),
    stage: text("stage").notNull(),
    payerAddress: text("payer_address").notNull(),
    beneficiaryAddress: text("beneficiary_address").notNull(),
    brlAmountCents: text("brl_amount_cents").notNull(),
    rateBps: text("rate_bps").notNull(),
    feeBps: text("fee_bps").notNull(),
    feeAmountCents: text("fee_amount_cents").notNull(),
    mockUsdAmount: text("mock_usd_amount").notNull(),
    termsHash: text("terms_hash").notNull(),
    fictionalMetadata: text("fictional_metadata").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    commerciallyApprovedAt: text("commercially_approved_at"),
  },
  (table) => [uniqueIndex("payment_scenarios_payment_id_unique").on(table.paymentId)],
);

export const paymentTransactions = sqliteTable("payment_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scenarioId: text("scenario_id")
    .notNull()
    .references(() => paymentScenarios.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  chainId: integer("chain_id").notNull(),
  transactionHash: text("transaction_hash").notNull(),
  status: text("status").notNull(),
  blockNumber: text("block_number"),
  observedAt: text("observed_at").notNull(),
});

const schema = { paymentScenarios, paymentTransactions };

export interface PaymentDatabase {
  client: BetterSqlite3.Database;
  orm: BetterSQLite3Database<typeof schema>;
  close(): void;
}

export function createPaymentDatabase(
  filename = process.env.PAYMENT_DB_PATH ?? join(process.cwd(), "payment-demo.sqlite"),
): PaymentDatabase {
  const client = new BetterSqlite3(filename);
  client.pragma("foreign_keys = ON");
  const migration = readFileSync(new URL("../../../drizzle/0000_initial.sql", import.meta.url), "utf8");
  client.exec(migration);
  const storedSchema = client.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'payment_scenarios'")
    .get() as { sql: string };
  if (!storedSchema.sql.includes("'l2-ready'")) {
    const upgrade = readFileSync(new URL("../../../drizzle/0001_l2_ready.sql", import.meta.url), "utf8");
    client.exec(upgrade);
    if ((client.pragma("foreign_key_check") as unknown[]).length > 0) {
      throw new Error("Payment database migration left invalid foreign keys");
    }
  }

  return {
    client,
    orm: drizzle(client, { schema }),
    close: () => client.close(),
  };
}
