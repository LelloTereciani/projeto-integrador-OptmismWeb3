PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS payment_scenarios (
  id TEXT PRIMARY KEY NOT NULL,
  payment_id TEXT NOT NULL UNIQUE CHECK (
    substr(payment_id, 1, 2) = '0x'
    AND length(payment_id) = 66
    AND substr(payment_id, 3) NOT GLOB '*[^0-9a-f]*'
  ),
  stage TEXT NOT NULL CHECK (stage IN (
    'draft',
    'quoted',
    'commercially-approved',
    'l1-submitted',
    'l2-credit-pending',
    'l2-credited',
    'created',
    'approved',
    'token-approved',
    'settlement-submitted',
    'settled',
    'payout-simulated'
  )),
  payer_address TEXT NOT NULL CHECK (
    substr(payer_address, 1, 2) = '0x'
    AND length(payer_address) = 42
    AND substr(payer_address, 3) NOT GLOB '*[^0-9A-Fa-f]*'
  ),
  beneficiary_address TEXT NOT NULL CHECK (
    substr(beneficiary_address, 1, 2) = '0x'
    AND length(beneficiary_address) = 42
    AND substr(beneficiary_address, 3) NOT GLOB '*[^0-9A-Fa-f]*'
  ),
  brl_amount_cents TEXT NOT NULL CHECK (length(brl_amount_cents) > 0 AND brl_amount_cents NOT GLOB '*[^0-9]*'),
  rate_bps TEXT NOT NULL CHECK (length(rate_bps) > 0 AND rate_bps NOT GLOB '*[^0-9]*'),
  fee_bps TEXT NOT NULL CHECK (length(fee_bps) > 0 AND fee_bps NOT GLOB '*[^0-9]*'),
  fee_amount_cents TEXT NOT NULL CHECK (length(fee_amount_cents) > 0 AND fee_amount_cents NOT GLOB '*[^0-9]*'),
  mock_usd_amount TEXT NOT NULL CHECK (length(mock_usd_amount) > 0 AND mock_usd_amount NOT GLOB '*[^0-9]*'),
  terms_hash TEXT NOT NULL CHECK (
    substr(terms_hash, 1, 2) = '0x'
    AND length(terms_hash) = 66
    AND substr(terms_hash, 3) NOT GLOB '*[^0-9a-f]*'
  ),
  fictional_metadata TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  commercially_approved_at TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS payment_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id TEXT NOT NULL REFERENCES payment_scenarios(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN (
    'l1-deposit',
    'l2-deposit-credit',
    'payment-create',
    'payment-approve',
    'token-approve',
    'payment-settle'
  )),
  chain_id INTEGER NOT NULL CHECK (chain_id IN (11155111, 11155420)),
  transaction_hash TEXT NOT NULL CHECK (
    substr(transaction_hash, 1, 2) = '0x'
    AND length(transaction_hash) = 66
    AND substr(transaction_hash, 3) NOT GLOB '*[^0-9A-Fa-f]*'
  ),
  status TEXT NOT NULL CHECK (status IN ('submitted', 'pending', 'confirmed', 'reverted', 'unavailable')),
  block_number TEXT,
  observed_at TEXT NOT NULL,
  CHECK (
    (stage = 'l1-deposit' AND chain_id = 11155111)
    OR (stage <> 'l1-deposit' AND chain_id = 11155420)
  ),
  UNIQUE (scenario_id, stage, transaction_hash)
) STRICT;

CREATE INDEX IF NOT EXISTS payment_transactions_scenario_id_index
  ON payment_transactions (scenario_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_l1_deposit_hash_unique
  ON payment_transactions (transaction_hash)
  WHERE stage = 'l1-deposit';
