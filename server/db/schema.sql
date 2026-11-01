-- DeFi Opportunity Scout: research, payment audit trail and spend control.
-- Amounts are in uUSDC (6 decimals). Hashes and addresses are stored lower-case.

CREATE TABLE IF NOT EXISTS research_requests (
  id                UUID PRIMARY KEY,
  user_id           TEXT NOT NULL,
  idempotency_key   UUID NOT NULL,
  fingerprint       CHAR(64) NOT NULL,
  opportunity_id    TEXT NOT NULL,
  topics            JSONB NOT NULL,
  status            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS telegraph_payments (
  id                     UUID PRIMARY KEY,
  research_request_id    UUID NOT NULL REFERENCES research_requests(id),
  intent                 TEXT NOT NULL,
  miner_id               TEXT,
  miner_registration_id  TEXT,
  target_url             TEXT NOT NULL,
  request_body_sha256    CHAR(64) NOT NULL,
  scheme                 TEXT,
  network                TEXT,
  asset                  TEXT,
  pay_to                 TEXT,
  authorization_nonce    TEXT UNIQUE,
  valid_before           BIGINT,
  payment_payload_sha256 CHAR(64),
  quoted_amount_uusdc    NUMERIC(30, 0),
  charged_amount_uusdc   NUMERIC(30, 0),
  tx_hash                TEXT,
  receipt_hash           TEXT UNIQUE,
  receipt_json           JSONB,
  payment_response_json  JSONB,
  signal_hash            TEXT UNIQUE,
  signal_verified        BOOLEAN NOT NULL DEFAULT false,
  settlement_status      TEXT NOT NULL DEFAULT 'not_started',
  finality_status        TEXT NOT NULL DEFAULT 'none',
  result_status          TEXT NOT NULL DEFAULT 'none',
  status                 TEXT NOT NULL,
  error_code             TEXT,
  requested_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  quoted_at              TIMESTAMPTZ,
  signed_at              TIMESTAMPTZ,
  responded_at           TIMESTAMPTZ,
  settled_included_at    TIMESTAMPTZ,
  finalized_at           TIMESTAMPTZ,
  UNIQUE (research_request_id, intent)
);

CREATE TABLE IF NOT EXISTS research_results (
  payment_id             UUID PRIMARY KEY REFERENCES telegraph_payments(id),
  result_shape           TEXT NOT NULL,
  shaped_result          JSONB,
  field_status           JSONB,
  raw_result_sha256      CHAR(64),
  request_schema_version INTEGER,
  response_format_version INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id          BIGSERIAL PRIMARY KEY,
  payment_id  UUID REFERENCES telegraph_payments(id),
  request_id  UUID REFERENCES research_requests(id),
  from_status TEXT,
  to_status   TEXT NOT NULL,
  detail      JSONB,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spend_reservations (
  payment_id   UUID PRIMARY KEY REFERENCES telegraph_payments(id),
  user_id      TEXT NOT NULL,
  amount_uusdc NUMERIC(30, 0) NOT NULL CHECK (amount_uusdc > 0),
  day          DATE NOT NULL,
  state        TEXT NOT NULL CHECK (state IN ('reserved', 'spent', 'released'))
);

CREATE TABLE IF NOT EXISTS system_flags (
  name  TEXT PRIMARY KEY,
  value BOOLEAN NOT NULL
);

INSERT INTO system_flags (name, value) VALUES ('payments_kill_switch', true) ON CONFLICT (name) DO NOTHING;
