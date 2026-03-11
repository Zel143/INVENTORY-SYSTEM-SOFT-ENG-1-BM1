'use strict';
require('dotenv').config();
const bcrypt   = require('bcryptjs');
const path     = require('path');
const Database = require('better-sqlite3');

// Seed data — inserted on first run if the inventory table is empty
const SEED_INVENTORY = [
    ['SKU-101', 'Industrial Motor',  '6.01 mg pwctt',    'Siemens',       '2025-01-10', 52,  30,  100, 10,  null, '2024-01-01'],
    ['SKU-205', 'Hydraulic Pump',    '60rt heavy duty',  'Parker',        '2025-05-20', 180, 120, 300, 50,  null, '2026-12-01'],
    ['SKU-308', 'Conveyor Belt',     '10.0m industrial', 'ConveyorPro',   null,         400, 100, 600, 100, null, '2027-05-20'],
    ['SKU-412', 'Control Panel',     '3-phase 440V',     'ABB',           '2025-08-15', 12,  8,   50,  5,   null, '2028-01-01'],
    ['SKU-519', 'Pressure Valve',    'DN50 stainless',   'Bosch Rexroth', '2025-03-01', 8,   0,   60,  10,  null, '2025-06-30'],
];

// =====================================================================
//  SQLITE DATABASE  (local file — no external service required)
// =====================================================================
const DB_PATH = path.join(__dirname, 'stocksense.db');
const db      = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ===================== SCHEMA =====================
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL UNIQUE,
        full_name     TEXT    NOT NULL,
        email         TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        role          TEXT    NOT NULL DEFAULT 'staff' CHECK(role IN ('admin','staff')),
        created_at    TEXT    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS inventory (
        code            TEXT    PRIMARY KEY,
        name            TEXT    NOT NULL,
        description     TEXT    DEFAULT '',
        vendor          TEXT    DEFAULT '',
        delivery_date   TEXT,
        current_stock   INTEGER NOT NULL DEFAULT 0 CHECK(current_stock >= 0),
        allocated_stock INTEGER NOT NULL DEFAULT 0 CHECK(allocated_stock >= 0),
        max_ceiling     INTEGER NOT NULL DEFAULT 999,
        min_threshold   INTEGER NOT NULL DEFAULT 0,
        warranty_start  TEXT,
        warranty_end    TEXT,
        image           TEXT,
        created_at      TEXT    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS transactions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        inventory_code   TEXT,
        item_name        TEXT,
        transaction_type TEXT    NOT NULL,
        quantity_change  INTEGER NOT NULL,
        actor_id         INTEGER,
        actor_name       TEXT,
        destination      TEXT,
        purpose          TEXT,
        timestamp        TEXT    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS login_attempts (
        username      TEXT    PRIMARY KEY,
        attempt_count INTEGER NOT NULL DEFAULT 1,
        first_attempt TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
`);

// ===================== PG-COMPATIBILITY ADAPTER =====================
// server.js uses PostgreSQL-style $1/$2 placeholders and ILIKE.
// This layer converts them to SQLite equivalents transparently.

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function serializeParam(v) {
    if (v instanceof Date) return v.toISOString();
    if (v === undefined)   return null;
    return v;
}

function pgToSqlite(sql, params = []) {
    const expanded = [];
    const converted = sql
        .replace(/\$(\d+)/g, (_, n) => {
            expanded.push(serializeParam(params[parseInt(n, 10) - 1]));
            return '?';
        })
        .replace(/\s+FOR\s+UPDATE\b/gi, '')
        .replace(/\bILIKE\b/gi, 'LIKE');
    return { sql: converted, params: expanded };
}

function processRow(row) {
    if (!row) return row;
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        out[k] = (typeof v === 'string' && ISO_RE.test(v)) ? new Date(v) : v;
    }
    return out;
}

function runQuery(sql, params = []) {
    try {
        const { sql: s, params: p } = pgToSqlite(sql, params);
        const stmt  = db.prepare(s);
        const upper = s.trimStart().toUpperCase();
        if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
            const rows = stmt.all(...p).map(processRow);
            return { rows, rowCount: rows.length };
        }
        const info = stmt.run(...p);
        return { rows: [], rowCount: info.changes };
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed'))  err.code = '23505';
        if (err.message && err.message.includes('CHECK constraint failed'))   err.code = '23514';
        throw err;
    }
}

// pg-compatible pool interface (used by server.js)
const pool = {
    query: (sql, params = []) => Promise.resolve(runQuery(sql, params)),
    connect: () => Promise.resolve({
        query: (sql, params = []) => {
            const t = sql.trim().toUpperCase();
            if (t === 'BEGIN')    { try { db.prepare('BEGIN').run();    } catch (_) {} return Promise.resolve({ rows: [] }); }
            if (t === 'COMMIT')   { try { db.prepare('COMMIT').run();   } catch (_) {} return Promise.resolve({ rows: [] }); }
            if (t === 'ROLLBACK') { try { db.prepare('ROLLBACK').run(); } catch (_) {} return Promise.resolve({ rows: [] }); }
            return Promise.resolve(runQuery(sql, params));
        },
        release: () => {}
    })
};

// ===================== INIT =====================
async function initDB() {
    const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    if (!adminExists) {
        const adminHash = bcrypt.hashSync('admin', 10);
        const staffHash = bcrypt.hashSync('staff', 10);
        db.prepare('INSERT INTO users (username,full_name,email,password_hash,role) VALUES (?,?,?,?,?)').run('admin', 'Administrator', 'admin@stocksense.com', adminHash, 'admin');
        db.prepare('INSERT INTO users (username,full_name,email,password_hash,role) VALUES (?,?,?,?,?)').run('staff', 'Staff User',     'staff@stocksense.com', staffHash, 'staff');
        console.log('[DB] Default users seeded: admin/admin and staff/staff');
    }
    const count = db.prepare('SELECT COUNT(*) AS c FROM inventory').get().c;
    if (count === 0) {
        const ins = db.prepare(`
            INSERT INTO inventory (code,name,description,vendor,delivery_date,current_stock,allocated_stock,max_ceiling,min_threshold,warranty_start,warranty_end)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
        db.transaction(() => { for (const row of SEED_INVENTORY) ins.run(...row); })();
        console.log('[DB] Sample inventory seeded (5 items)');
    }
    console.log(`[DB] SQLite ready → ${DB_PATH}`);
}

module.exports = { pool, initDB };
