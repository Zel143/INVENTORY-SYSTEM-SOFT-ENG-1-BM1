'use strict';
require('dotenv').config();
const bcrypt = require('bcryptjs');
const path   = require('path');

const USE_POSTGRES = !!process.env.DATABASE_URL;

// Shared seed data (used by both modes)
const SEED_INVENTORY = [
    ['SKU-101', 'Industrial Motor',  '6.01 mg pwctt',    'Siemens',       '2025-01-10', 52,  30,  100, 10,  null, '2024-01-01'],
    ['SKU-205', 'Hydraulic Pump',    '60rt heavy duty',  'Parker',        '2025-05-20', 180, 120, 300, 50,  null, '2026-12-01'],
    ['SKU-308', 'Conveyor Belt',     '10.0m industrial', 'ConveyorPro',   null,         400, 100, 600, 100, null, '2027-05-20'],
    ['SKU-412', 'Control Panel',     '3-phase 440V',     'ABB',           '2025-08-15', 12,  8,   50,  5,   null, '2028-01-01'],
    ['SKU-519', 'Pressure Valve',    'DN50 stainless',   'Bosch Rexroth', '2025-03-01', 8,   0,   60,  10,  null, '2025-06-30'],
];

// =====================================================================
//  POSTGRESQL / SUPABASE MODE  (DATABASE_URL set in .env)
//  Uses @supabase/supabase-js over HTTPS (port 443) so it works even
//  when the network blocks raw PostgreSQL TCP traffic (ports 5432/6543).
// =====================================================================
if (USE_POSTGRES) {
    const { createClient } = require('@supabase/supabase-js');

    const SUPABASE_URL = process.env.SUPABASE_URL
        || `https://${(process.env.DATABASE_URL.match(/postgres\.([\w]+)@/) || [])[1]}.supabase.co`;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_KEY || SUPABASE_KEY === 'your_service_role_key_here') {
        console.error('[DB] ❌  SUPABASE_SERVICE_ROLE_KEY is not set in .env');
        console.error('    → Go to: Supabase Dashboard → Project Settings → API → service_role (secret)');
        console.error('    → Copy that key and paste it into backend files/.env\n');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false }
    });

    // ===================== PG-COMPATIBILITY ADAPTER =====================
    // Translates pg pool.query(sql, [$1, $2, ...]) → supabase REST/RPC calls
    // so server.js needs zero changes.

    function pgParamToNamed(sql, params = []) {
        // Replace $1, $2 ... with positional array for rendering in error messages
        let i = 0;
        return sql.replace(/\$\d+/g, () => {
            const v = params[i++];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
            return String(v);
        });
    }

    // Core: run arbitrary SQL via a Supabase stored function (created in initDB)
    async function execSQL(sql, params = []) {
        const { data, error } = await supabase.rpc('stocksense_exec', {
            p_sql:    sql,
            p_params: params.map(v => (v === null || v === undefined) ? null : String(v))
        });
        if (error) {
            const err = new Error(error.message || error.hint || JSON.stringify(error));
            // Map common Postgres error codes
            if (error.code === '23505' || (error.message || '').includes('duplicate key')) err.code = '23505';
            if (error.code === '23514' || (error.message || '').includes('violates check')) err.code = '23514';
            throw err;
        }
        // data is an array of row objects (or [] for non-SELECT)
        const rows = Array.isArray(data) ? data : [];
        return { rows, rowCount: rows.length };
    }

    // Transaction state: Supabase REST is stateless, so we batch BEGIN/COMMIT blocks
    // and execute the whole batch as a single RPC call with explicit transaction wrapping.
    class FakeClient {
        constructor() { this._ops = []; this._inTx = false; }

        async query(sql, params = []) {
            const upper = sql.trim().toUpperCase();
            if (upper === 'BEGIN')    { this._inTx = true;  this._ops = []; return { rows: [] }; }
            if (upper === 'COMMIT')   { return this._flush(); }
            if (upper === 'ROLLBACK') { this._ops = []; this._inTx = false; return { rows: [] }; }
            if (this._inTx) {
                this._ops.push({ sql, params });
                // Return a placeholder — the actual result comes on COMMIT
                return { rows: [] };
            }
            return execSQL(sql, params);
        }

        async _flush() {
            if (this._ops.length === 0) { this._inTx = false; return { rows: [] }; }
            const { data, error } = await supabase.rpc('stocksense_exec_tx', {
                p_statements: this._ops.map(op => ({
                    sql:    op.sql,
                    params: op.params.map(v => (v === null || v === undefined) ? null : String(v))
                }))
            });
            this._ops = [];
            this._inTx = false;

            if (error) {
                const err = new Error(error.message || JSON.stringify(error));
                if (error.code === '23505' || (error.message || '').includes('duplicate key')) err.code = '23505';
                if (error.code === '23514' || (error.message || '').includes('violates check')) err.code = '23514';
                throw err;
            }

            // data is the result rows of the LAST statement in the transaction
            const rows = Array.isArray(data) ? data : [];
            return { rows, rowCount: rows.length };
        }

        release() {}
    }

    // pg-compatible pool
    const pool = {
        query:   (sql, params = []) => execSQL(sql, params),
        connect: ()                  => Promise.resolve(new FakeClient())
    };

    // ===================== INIT =====================
    async function initDB() {
        // Step 1: Verify the stocksense_exec helper function exists in Supabase.
        // This function must be deployed once via the Supabase SQL Editor before the app starts.
        let probeRes, probeBody;
        try {
            probeRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/stocksense_exec`, {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'apikey':        SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                },
                body: JSON.stringify({ p_sql: 'SELECT 1 AS ok', p_params: [] })
            });
            probeBody = await probeRes.json().catch(() => ({}));
        } catch (networkErr) {
            throw new Error(`Cannot reach Supabase at ${SUPABASE_URL}. Check your network or SUPABASE_URL in .env.\n${networkErr.message}`);
        }

        if (!probeRes.ok) {
            const code = probeBody?.code || '';
            const msg  = probeBody?.message || '';
            if (code === 'PGRST202' || msg.includes('does not exist') || msg.includes('stocksense_exec')) {
                // Functions not yet deployed — fail fast with clear instructions
                const setupErr = new Error(
                    'Supabase is reachable but the helper functions are not deployed yet.\n' +
                    '→ Go to https://supabase.com/dashboard → SQL Editor\n' +
                    '→ Paste and run the two CREATE FUNCTION blocks at the bottom of  spec/supabase/schema.sql\n' +
                    '→ Then restart the server.'
                );
                setupErr.SETUP_REQUIRED = true;
                throw setupErr;
            }
            // Some other HTTP error (wrong key, RLS, etc.)
            throw new Error(`Supabase probe failed (HTTP ${probeRes.status}): ${msg || JSON.stringify(probeBody)}`);
        }

        // Step 2: Create application tables (idempotent)
        await execSQL(`
            CREATE TABLE IF NOT EXISTS users (
                id            SERIAL       PRIMARY KEY,
                username      VARCHAR(30)  NOT NULL UNIQUE,
                full_name     TEXT         NOT NULL DEFAULT '',
                email         TEXT         NOT NULL UNIQUE,
                password_hash TEXT         NOT NULL,
                role          VARCHAR(10)  NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
                created_at    TIMESTAMPTZ  DEFAULT NOW()
            )
        `, []);
        await execSQL(`
            CREATE TABLE IF NOT EXISTS inventory (
                code            TEXT    PRIMARY KEY,
                name            TEXT    NOT NULL,
                description     TEXT    DEFAULT '',
                vendor          TEXT    DEFAULT '',
                delivery_date   DATE,
                current_stock   INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
                allocated_stock INTEGER NOT NULL DEFAULT 0 CHECK (allocated_stock >= 0),
                max_ceiling     INTEGER NOT NULL DEFAULT 999,
                min_threshold   INTEGER NOT NULL DEFAULT 0,
                warranty_start  DATE,
                warranty_end    DATE,
                image           TEXT,
                created_at      TIMESTAMPTZ DEFAULT NOW()
            )
        `, []);
        await execSQL(`
            CREATE TABLE IF NOT EXISTS transactions (
                id               SERIAL  PRIMARY KEY,
                inventory_code   TEXT,
                item_name        TEXT,
                transaction_type TEXT    NOT NULL,
                quantity_change  INTEGER NOT NULL,
                actor_id         INTEGER,
                actor_name       TEXT,
                destination      TEXT,
                purpose          TEXT,
                timestamp        TIMESTAMPTZ DEFAULT NOW()
            )
        `, []);
        await execSQL(`
            CREATE TABLE IF NOT EXISTS login_attempts (
                username      TEXT        PRIMARY KEY,
                attempt_count INTEGER     NOT NULL DEFAULT 1,
                first_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `, []);

        // Seed default users
        const adminRows = (await execSQL('SELECT id FROM users WHERE username = $1', ['admin'])).rows;
        if (adminRows.length === 0) {
            const adminHash = bcrypt.hashSync('admin', 10);
            const staffHash = bcrypt.hashSync('staff', 10);
            await execSQL(
                'INSERT INTO users (username,full_name,email,password_hash,role) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
                ['admin', 'Administrator', 'admin@stocksense.com', adminHash, 'admin']
            );
            await execSQL(
                'INSERT INTO users (username,full_name,email,password_hash,role) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
                ['staff', 'Staff User', 'staff@stocksense.com', staffHash, 'staff']
            );
            console.log('[DB] Default users seeded: admin/admin and staff/staff');
        }

        // Seed sample inventory
        const invCount = parseInt((await execSQL('SELECT COUNT(*) AS c FROM inventory', [])).rows[0]?.c || 0, 10);
        if (invCount === 0) {
            for (const row of SEED_INVENTORY) {
                await execSQL(
                    `INSERT INTO inventory
                        (code,name,description,vendor,delivery_date,current_stock,allocated_stock,max_ceiling,min_threshold,warranty_start,warranty_end)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                     ON CONFLICT DO NOTHING`,
                    row
                );
            }
            console.log('[DB] Sample inventory seeded (5 items)');
        }

        console.log('[DB] PostgreSQL (Supabase / HTTPS) ready');
    }

    module.exports = { pool, initDB };

// =====================================================================
//  SQLITE MODE  (local fallback — no DATABASE_URL needed)
// =====================================================================
} else {
    const Database = require('better-sqlite3');
    const DB_PATH  = path.join(__dirname, 'stocksense.db');
    const db       = new Database(DB_PATH);
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
    // Converts PostgreSQL $1/$2/... → SQLite ?, strips FOR UPDATE, maps ILIKE → LIKE

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

    // pg-compatible pool
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
}
