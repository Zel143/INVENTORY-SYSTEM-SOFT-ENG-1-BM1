-- ============================================================
-- StockSense Inventory Management System
-- Supabase / PostgreSQL Database Schema
-- Version: 2.0  |  Group 3 - BM1
-- ============================================================
-- HOW TO USE:
--   1. Open your Supabase project → SQL Editor
--   2. Paste this entire file and click "Run"
--   3. Run seed.js locally to create admin/staff users
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: users
-- Stores login credentials and roles.
-- Passwords are stored as bcrypt hashes (see seed.js).
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50)  UNIQUE NOT NULL,
    full_name     TEXT         NOT NULL DEFAULT '',
    email         TEXT,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(10)  NOT NULL DEFAULT 'staff'
                      CHECK (role IN ('admin', 'staff')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- Migration: add columns for existing deployments
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- ============================================================
-- TABLE: inventory
-- Stores all warehouse items. Core table for StockSense.
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
    id               SERIAL       PRIMARY KEY,
    code             VARCHAR(50)  UNIQUE NOT NULL,          -- SKU / Item Code (e.g. MCH-001)
    name             VARCHAR(255) NOT NULL,                 -- Item name
    description      TEXT         DEFAULT '',               -- Additional item details
    vendor           VARCHAR(255),                         -- Supplier name
    current_stock    INTEGER      NOT NULL DEFAULT 0,       -- Physical units on hand
    allocated_stock  INTEGER      NOT NULL DEFAULT 0,       -- Units reserved / committed
    min_threshold    INTEGER      NOT NULL DEFAULT 0,       -- Safety / low-stock floor
    max_ceiling      INTEGER,                               -- Overstock ceiling cap (NULL = no cap)
    warranty_start   DATE,                                  -- Warranty start date
    warranty_end     DATE,                                  -- Warranty end / expiry date (used for alerts)
    delivery_date    DATE,                                  -- Last delivery date
    image            TEXT,                                  -- Icon / image URL
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Constraints (enforce data integrity — mirrors UAT TC-46, TC-50)
    CONSTRAINT chk_current_stock_non_negative
        CHECK (current_stock    >= 0),
    CONSTRAINT chk_allocated_stock_non_negative
        CHECK (allocated_stock  >= 0),
    CONSTRAINT chk_min_threshold_non_negative
        CHECK (min_threshold    >= 0),
    CONSTRAINT chk_allocated_lte_current
        CHECK (allocated_stock  <= current_stock),
    CONSTRAINT chk_warranty_order
        CHECK (
            warranty_end   IS NULL OR
            warranty_start IS NULL OR
            warranty_end   >= warranty_start
        )
);
-- Migration: add columns for existing deployments
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

-- ============================================================
-- TABLE: transactions
-- Immutable audit trail of all stock movements.
-- TC-84: A trigger prevents any DELETE on this table.
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id               SERIAL      PRIMARY KEY,
    inventory_code   VARCHAR(50) NOT NULL,                  -- References inventory.code (kept even after item deletion)
    item_name        VARCHAR(255),                          -- Snapshot of item name at time of transaction
    transaction_type VARCHAR(20) NOT NULL
                         CHECK (transaction_type IN
                             ('addition', 'dispatch', 'deletion', 'allocation', 'deallocation', 'adjustment')),
    quantity_change  INTEGER     NOT NULL,                  -- Signed: + for in, - for out
    destination      VARCHAR(255),                         -- Where dispatched / source for additions
    purpose          VARCHAR(255),                         -- Work Order ref or general reason
    actor_id         INTEGER,                              -- User ID from server session
    actor_name       VARCHAR(50),                          -- Username from server session (TC-80)
    timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW()    -- Auto-stamped at server INSERT time
);
-- Migration: add columns for existing deployments
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS actor_id INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS item_name TEXT;

-- ============================================================
-- INDEXES  (performance for large datasets — TC-90)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_inventory_code
    ON inventory (code);

CREATE INDEX IF NOT EXISTS idx_inventory_low_stock
    ON inventory (current_stock, min_threshold)
    WHERE min_threshold > 0;

CREATE INDEX IF NOT EXISTS idx_inventory_overstock
    ON inventory (current_stock, max_ceiling)
    WHERE max_ceiling IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_code
    ON transactions (inventory_code);

CREATE INDEX IF NOT EXISTS idx_transactions_timestamp
    ON transactions (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_actor
    ON transactions (actor_name);

CREATE INDEX IF NOT EXISTS idx_users_username
    ON users (username);

-- ============================================================
-- TABLE: login_attempts
-- Persists failed login counters so lockout survives server
-- restarts. Rows are deleted on successful login.
-- ============================================================
CREATE TABLE IF NOT EXISTS login_attempts (
    username      VARCHAR(50)  PRIMARY KEY,
    attempt_count INTEGER      NOT NULL DEFAULT 1,
    first_attempt TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_first
    ON login_attempts (first_attempt);

-- ============================================================
-- FUNCTION: fn_update_timestamp
-- Auto-updates the updated_at column on every row change.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ============================================================
-- FUNCTION: fn_prevent_transaction_modification
-- Enforces the immutable audit trail requirement (TC-84).
-- ============================================================
CREATE OR REPLACE FUNCTION fn_prevent_transaction_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'Transactions cannot be DELETE - immutable audit trail';
END;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at on inventory changes
DROP TRIGGER IF EXISTS trg_inventory_updated_at ON inventory;
CREATE TRIGGER trg_inventory_updated_at
    BEFORE UPDATE ON inventory
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- Auto-update updated_at on user changes
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- Block all DELETE operations on transactions (TC-84)
DROP TRIGGER IF EXISTS trg_prevent_transaction_delete ON transactions;
CREATE TRIGGER trg_prevent_transaction_delete
    BEFORE DELETE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_transaction_modification();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Disabled — all access is controlled by the Express backend
-- using the SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- ============================================================
ALTER TABLE users        DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory    DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- SEED DATA: Inventory
-- Mirrors the 10 default items from the original app.js.
-- Fields mapped:
--   quantity  -> current_stock
--   safety    -> min_threshold
--   maxStock  -> max_ceiling
--   warranty  -> warranty_start
--   expiryDate-> warranty_end  (used for expiry alerts)
-- ============================================================
INSERT INTO inventory
    (code, name, description, vendor, current_stock, min_threshold, max_ceiling,
     warranty_start, warranty_end, image)
VALUES
    -- EXPIRED / EXPIRING ITEMS
    ('MCH-001', 'Forklift',          '',  'Toyota',    5,  5, 10,
     '2020-02-20', '2026-02-25',
     'https://cdn-icons-png.flaticon.com/512/2821/2821867.png'),

    ('MCH-002', 'Pallet Jack',       '',  'Uline',     2,  5,  8,
     '2021-05-20', '2026-03-01',
     'https://cdn-icons-png.flaticon.com/512/3229/3229986.png'),

    -- OVERSTOCK ITEMS
    ('EQP-104', 'Conveyor Belt',     '',  'Bosch',    15,  5, 12,
     '2022-11-15', '2027-11-15',
     'https://cdn-icons-png.flaticon.com/512/1541/1541484.png'),

    ('STR-201', 'Shelving Unit',     '',  'IKEA',      8,  5,  6,
     '2021-06-10', '2026-06-10',
     'https://cdn-icons-png.flaticon.com/512/3143/3143160.png'),

    -- LOW STOCK ALERTS
    ('TOOL-301', 'Safety Gloves',    '',  '3M',        2, 10, 50,
     '2022-12-01', '2026-12-01',
     'https://cdn-icons-png.flaticon.com/512/1598/1598964.png'),

    ('TOOL-302', 'Hard Hat',         '',  'MSA',       0,  5, 25,
     '2022-08-15', '2027-08-15',
     'https://cdn-icons-png.flaticon.com/512/1598/1598965.png'),

    -- EDGE CASES (multiple alert conditions)
    ('PART-401', 'Conveyor Rollers', '',  'Rexnord',  13,  8, 12,
     '2021-02-28', '2026-02-28',
     'https://cdn-icons-png.flaticon.com/512/1541/1541485.png'),

    ('PART-402', 'Pallet Wrap',      '',  'Uline',     1,  3, 20,
     '2021-01-15', '2026-01-15',
     'https://cdn-icons-png.flaticon.com/512/3229/3229987.png'),

    -- NORMAL / OVERSTOCK ONLY
    ('EQP-501', 'Barcode Scanner',   '',  'Zebra',     7,  5,  8,
     '2023-03-10', '2028-03-10',
     'https://cdn-icons-png.flaticon.com/512/1541/1541486.png'),

    ('TOOL-601', 'Torque Wrench',    '',  'Craftsman', 25,  5, 20,
     '2021-07-22', '2026-07-22',
     'https://cdn-icons-png.flaticon.com/512/1598/1598966.png')

ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- NOTE: User accounts (admin / staff) are NOT seeded here
-- because passwords must be bcrypt-hashed by the application.
-- Run:  node seed.js
-- That script will insert the two default accounts securely.
-- ============================================================

-- ============================================================
-- FUNCTIONS: stocksense_exec / stocksense_exec_tx
-- Required by the @supabase/supabase-js HTTPS adapter in
-- database.js so the backend works on networks that block
-- raw PostgreSQL TCP traffic (ports 5432/6543).
--
-- HOW TO DEPLOY:
--   Supabase Dashboard → SQL Editor → paste & run this block.
-- ============================================================

-- Single parameterised statement → returns rows as jsonb array
-- Handles both row-returning queries (SELECT/WITH) and DDL/DML.
CREATE OR REPLACE FUNCTION stocksense_exec(
    p_sql    text,
    p_params text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec      record;
    arr      jsonb := '[]'::jsonb;
    sql_cmd  text;
BEGIN
    -- Determine execution strategy based on first SQL keyword
    sql_cmd := upper(split_part(trim(regexp_replace(p_sql, '\s+', ' ', 'g')), ' ', 1));

    IF sql_cmd IN ('SELECT', 'WITH', 'TABLE') OR p_sql ~* '\mRETURNING\M' THEN
        -- Row-returning query: open as cursor to collect rows
        FOR rec IN EXECUTE p_sql USING
            p_params[1],  p_params[2],  p_params[3],  p_params[4],
            p_params[5],  p_params[6],  p_params[7],  p_params[8],
            p_params[9],  p_params[10], p_params[11]
        LOOP
            arr := arr || to_jsonb(rec);
        END LOOP;
    ELSE
        -- DDL or DML without RETURNING: plain execute (no cursor)
        EXECUTE p_sql USING
            p_params[1],  p_params[2],  p_params[3],  p_params[4],
            p_params[5],  p_params[6],  p_params[7],  p_params[8],
            p_params[9],  p_params[10], p_params[11];
    END IF;

    RETURN arr;
EXCEPTION
    WHEN others THEN RAISE;
END;
$$;

-- Multiple statements in one atomic transaction → returns rows of last statement
CREATE OR REPLACE FUNCTION stocksense_exec_tx(
    p_statements jsonb   -- [{ "sql": "...", "params": ["v1", ...] }, ...]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    stmt    record;
    rec     record;
    arr     jsonb := '[]'::jsonb;
    p       text[];
    sql_txt text;
    sql_cmd text;
BEGIN
    FOR stmt IN SELECT value FROM jsonb_array_elements(p_statements)
    LOOP
        arr     := '[]'::jsonb;
        sql_txt := (stmt.value)->>'sql';
        sql_cmd := upper(split_part(trim(regexp_replace(sql_txt, '\s+', ' ', 'g')), ' ', 1));

        SELECT array_agg(v::text) INTO p
            FROM jsonb_array_elements_text((stmt.value)->'params') AS v;
        IF p IS NULL THEN p := '{}'; END IF;

        IF sql_cmd IN ('SELECT', 'WITH', 'TABLE') OR sql_txt ~* '\mRETURNING\M' THEN
            FOR rec IN EXECUTE sql_txt USING
                p[1],  p[2],  p[3],  p[4],
                p[5],  p[6],  p[7],  p[8],
                p[9],  p[10], p[11]
            LOOP
                arr := arr || to_jsonb(rec);
            END LOOP;
        ELSE
            EXECUTE sql_txt USING
                p[1],  p[2],  p[3],  p[4],
                p[5],  p[6],  p[7],  p[8],
                p[9],  p[10], p[11];
        END IF;
    END LOOP;
    RETURN arr;
END;
$$;
