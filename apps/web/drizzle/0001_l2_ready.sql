PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

CREATE TABLE payment_scenarios_new (
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
    'l2-ready',
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

INSERT INTO payment_scenarios_new
SELECT id, payment_id, stage, payer_address, beneficiary_address,
  brl_amount_cents, rate_bps, fee_bps, fee_amount_cents,
  mock_usd_amount, terms_hash, fictional_metadata, created_at,
  updated_at, commercially_approved_at
FROM payment_scenarios;

DROP TABLE payment_scenarios;
ALTER TABLE payment_scenarios_new RENAME TO payment_scenarios;

COMMIT;
PRAGMA foreign_keys = ON;
