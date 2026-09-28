-- ============================================================
-- BhuDrishti — PostgreSQL Schema
-- Run once: psql -U postgres -d bhudrishti -f schema.sql
-- ============================================================

-- Enable UUID support
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(30)  NOT NULL DEFAULT 'citizen'
                             CHECK (role IN ('citizen', 'field_officer', 'district_admin', 'superadmin')),
  district      VARCHAR(100),
  phone         VARCHAR(20),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Predictions ───────────────────────────────────────────────────────────────
-- Stores every ML risk prediction made via the Flask API
CREATE TABLE IF NOT EXISTS predictions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  district        VARCHAR(100),
  latitude        NUMERIC(9,6),
  longitude       NUMERIC(9,6),

  -- Input features snapshot
  slope           NUMERIC(6,2),
  elevation       NUMERIC(8,2),
  curvature       NUMERIC(7,3),
  aspect          NUMERIC(6,2),
  precipitation   NUMERIC(7,2),
  ndvi            NUMERIC(5,3),
  soil_moisture   NUMERIC(5,3),
  soil_type       SMALLINT,
  lulc            SMALLINT,
  dist_road       NUMERIC(10,2),
  dist_fault      NUMERIC(10,2),

  -- Model output
  risk_label      SMALLINT    NOT NULL CHECK (risk_label BETWEEN 0 AND 3),
  risk_category   VARCHAR(20) NOT NULL CHECK (risk_category IN ('Low','Moderate','High','Critical')),
  confidence      NUMERIC(5,3),
  prob_low        NUMERIC(5,3),
  prob_moderate   NUMERIC(5,3),
  prob_high       NUMERIC(5,3),
  prob_critical   NUMERIC(5,3),

  source          VARCHAR(30) NOT NULL DEFAULT 'manual'
                              CHECK (source IN ('manual','automated','forecast')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_district   ON predictions(district);
CREATE INDEX IF NOT EXISTS idx_predictions_created_at ON predictions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_risk       ON predictions(risk_category);

-- ── Alerts ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id   UUID        REFERENCES predictions(id) ON DELETE SET NULL,
  district        VARCHAR(100) NOT NULL,
  latitude        NUMERIC(9,6),
  longitude       NUMERIC(9,6),
  risk_category   VARCHAR(20) NOT NULL CHECK (risk_category IN ('Low','Moderate','High','Critical')),
  message         TEXT        NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','acknowledged','resolved')),
  sms_sent        BOOLEAN     NOT NULL DEFAULT FALSE,
  sms_sent_at     TIMESTAMPTZ,
  recipients      TEXT[],               -- phone numbers / authority contacts
  acknowledged_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_district   ON alerts(district);
CREATE INDEX IF NOT EXISTS idx_alerts_status     ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);

-- ── Field Reports ─────────────────────────────────────────────────────────────
-- Submitted by citizens / field officers via the app
CREATE TABLE IF NOT EXISTS field_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES users(id) ON DELETE SET NULL,
  district      VARCHAR(100),
  latitude      NUMERIC(9,6),
  longitude     NUMERIC(9,6),
  report_type   VARCHAR(40) NOT NULL
                            CHECK (report_type IN (
                              'crack','blocked_road','landslide_occurred',
                              'flooding','infrastructure_damage','other'
                            )),
  description   TEXT,
  severity      VARCHAR(20) NOT NULL DEFAULT 'unknown'
                            CHECK (severity IN ('low','medium','high','unknown')),
  image_url     TEXT,
  verified      BOOLEAN     NOT NULL DEFAULT FALSE,
  verified_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_reports_district   ON field_reports(district);
CREATE INDEX IF NOT EXISTS idx_field_reports_created_at ON field_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_reports_verified   ON field_reports(verified);

-- ── Auto-update updated_at on users ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
