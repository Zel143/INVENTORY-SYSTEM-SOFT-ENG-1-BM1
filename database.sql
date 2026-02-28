-- ======================================
-- STOCKSENSE PostgreSQL DATABASE SCHEMA
-- Three-Table Architecture
-- ======================================

-- Drop views first (they depend on tables)
DROP VIEW IF EXISTS low_stock_items;
DROP VIEW IF EXISTS recent_transactions;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS allocation_logs CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ======================================
-- USERS TABLE - Authentication & Roles
-- ======================================
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'staff')),
    display_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Insert default users (password: "admin" and "staff" hashed with bcrypt)
-- For production, these passwords should be properly hashed
INSERT INTO users (id, email, username, password_hash, role, display_name) VALUES
('admin_001', 'admin@stocksense.com', 'admin', 'admin', 'admin', 'System Administrator'),
('staff_001', 'staff@stocksense.com', 'staff', 'staff', 'staff', 'Warehouse Staff');

-- ======================================
-- INVENTORY TABLE - Stock Levels
-- ======================================
CREATE TABLE inventory (
    code TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    vendor TEXT,
    current_stock INTEGER NOT NULL DEFAULT 0,
    allocated_stock INTEGER NOT NULL DEFAULT 0,
    min_threshold INTEGER NOT NULL DEFAULT 5,
    max_ceiling INTEGER NOT NULL DEFAULT 20,
    date_delivered DATE,
    warranty_start DATE,
    warranty_end DATE,
    storage_location TEXT,
    image TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK(current_stock >= 0),
    CHECK(allocated_stock >= 0),
    CHECK(min_threshold >= 0),
    CHECK(max_ceiling >= min_threshold),
    -- ALLOCATION GUARDRAIL: Database-level safety net
    -- Ensures current_stock can never fall below allocated_stock
    -- This prevents contract breaches where reserved parts are consumed
    CHECK(current_stock >= allocated_stock)
);

-- Insert default inventory items
INSERT INTO inventory (code, description, vendor, current_stock, allocated_stock, min_threshold, max_ceiling, date_delivered, warranty_start, warranty_end, storage_location, image) VALUES
('MCH-001', 'Forklift', 'Toyota', 5, 0, 5, 15, '2025-01-15', '2025-01-15', '2030-01-01', 'Bin-A1', 'https://cdn-icons-png.flaticon.com/512/2821/2821867.png'),
('MCH-002', 'Pallet Jack', 'Uline', 2, 0, 5, 10, '2024-05-20', '2024-05-20', '2027-05-20', 'Bin-B3', 'https://cdn-icons-png.flaticon.com/512/3229/3229986.png'),
('EQP-104', 'Conveyor Belt', 'Bosch', 4, 0, 5, 8, '2025-11-15', '2025-11-15', '2028-11-15', 'Bin-C2', 'https://cdn-icons-png.flaticon.com/512/1541/1541484.png'),
('STR-201', 'Shelving Unit', 'IKEA', 1, 0, 5, 20, '2024-06-10', '2024-06-10', '2026-06-10', 'Bin-D5', 'https://cdn-icons-png.flaticon.com/512/3143/3143160.png');

-- ======================================
-- TRANSACTIONS TABLE - Immutable Audit Trail
-- ======================================
CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT,
    quantity_change INTEGER NOT NULL,
    previous_stock INTEGER,
    new_stock INTEGER,
    transaction_type TEXT CHECK(transaction_type IN ('addition', 'dispatch', 'allocation', 'deallocation')),
    destination TEXT,
    purpose TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES inventory(code),
    FOREIGN KEY (actor_id) REFERENCES users(id)
);

-- Create index for faster queries
CREATE INDEX idx_transactions_item ON transactions(item_id);
CREATE INDEX idx_transactions_timestamp ON transactions(timestamp DESC);
CREATE INDEX idx_transactions_actor ON transactions(actor_id);

-- ======================================
-- ALLOCATION_LOGS TABLE - MA Tracking
-- ======================================
CREATE TABLE allocation_logs (
    id TEXT PRIMARY KEY,
    request_id TEXT UNIQUE NOT NULL,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    quantity_allocated INTEGER NOT NULL,
    destination TEXT,
    purpose TEXT,
    status TEXT CHECK(status IN ('pending', 'approved', 'rejected', 'completed')),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by TEXT,
    notes TEXT,
    FOREIGN KEY (item_id) REFERENCES inventory(code),
    FOREIGN KEY (requested_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Create index for faster queries
CREATE INDEX idx_allocation_item ON allocation_logs(item_id);
CREATE INDEX idx_allocation_status ON allocation_logs(status);

-- ======================================
-- TRIGGER FUNCTIONS - Maintain Data Integrity
-- ======================================

-- Function: Update inventory.updated_at automatically
CREATE OR REPLACE FUNCTION fn_update_inventory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_updated_at
    BEFORE UPDATE ON inventory
    FOR EACH ROW EXECUTE FUNCTION fn_update_inventory_timestamp();

-- Function: Block any modification of the transaction audit trail
CREATE OR REPLACE FUNCTION fn_prevent_transaction_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Transactions cannot be % - immutable audit trail', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_transaction_delete
    BEFORE DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION fn_prevent_transaction_modification();

CREATE TRIGGER trg_prevent_transaction_update
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION fn_prevent_transaction_modification();

-- ======================================
-- VIEWS - Convenience Queries
-- ======================================

-- View: Low stock items
CREATE VIEW low_stock_items AS
SELECT 
    code,
    description,
    vendor,
    current_stock,
    min_threshold,
    (min_threshold - current_stock) as shortage,
    storage_location,
    image
FROM inventory
WHERE current_stock <= min_threshold
ORDER BY (min_threshold - current_stock) DESC;

-- View: Recent transactions with user details
CREATE VIEW recent_transactions AS
SELECT 
    t.id,
    t.item_id,
    t.item_name,
    t.actor_id,
    u.display_name as actor_name,
    t.quantity_change,
    t.previous_stock,
    t.new_stock,
    t.transaction_type,
    t.destination,
    t.purpose,
    t.timestamp
FROM transactions t
LEFT JOIN users u ON t.actor_id = u.id
ORDER BY t.timestamp DESC;

-- ======================================
-- DATABASE INFO
-- ======================================
-- Schema Version: 2.0
-- Migrated: 2026-02-28
-- Compatible with: Node.js + Express + pg (node-postgres)
-- Database: PostgreSQL 13+
-- ======================================
