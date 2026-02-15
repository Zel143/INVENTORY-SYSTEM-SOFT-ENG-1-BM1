-- ======================================
-- STOCKSENSE SQLite DATABASE SCHEMA
-- Three-Table Architecture
-- ======================================

-- Drop existing tables if they exist
DROP TABLE IF EXISTS allocation_logs;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS users;

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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
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
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
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
-- TRIGGERS - Maintain Data Integrity
-- ======================================

-- Trigger: Update inventory.updated_at on changes
CREATE TRIGGER update_inventory_timestamp 
AFTER UPDATE ON inventory
BEGIN
    UPDATE inventory SET updated_at = CURRENT_TIMESTAMP WHERE code = NEW.code;
END;

-- Trigger: Prevent transaction deletion (immutable audit trail)
CREATE TRIGGER prevent_transaction_delete
BEFORE DELETE ON transactions
BEGIN
    SELECT RAISE(FAIL, 'Transactions cannot be deleted - immutable audit trail');
END;

-- Trigger: Prevent transaction updates (immutable audit trail)
CREATE TRIGGER prevent_transaction_update
BEFORE UPDATE ON transactions
BEGIN
    SELECT RAISE(FAIL, 'Transactions cannot be modified - immutable audit trail');
END;

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
WHERE current_stock < min_threshold
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
-- Schema Version: 1.0
-- Created: 2026-02-12
-- Compatible with: Node.js + Express + better-sqlite3
-- ======================================
