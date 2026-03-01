require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// ===================== CONNECTION POOL =====================
const pool = new Pool({
    host:     process.env.PG_HOST     || 'localhost',
    port:     parseInt(process.env.PG_PORT) || 5432,
    database: process.env.PG_DATABASE || 'stocksense',
    user:     process.env.PG_USER     || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
});

// ===================== INIT (async) =====================
async function initDB() {
    const client = await pool.connect();
    try {
        // ---- SCHEMA ----
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                full_name TEXT NOT NULL,
                email TEXT,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'staff')) DEFAULT 'staff',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS inventory (
                id SERIAL PRIMARY KEY,
                code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                vendor TEXT DEFAULT '',
                delivery_date TEXT,
                current_stock INTEGER NOT NULL DEFAULT 0 CHECK(current_stock >= 0),
                allocated_stock INTEGER NOT NULL DEFAULT 0 CHECK(allocated_stock >= 0),
                max_ceiling INTEGER DEFAULT 999,
                min_threshold INTEGER DEFAULT 0,
                warranty_start TEXT,
                warranty_end TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                inventory_code TEXT NOT NULL,
                transaction_type TEXT NOT NULL CHECK(transaction_type IN ('addition', 'dispatch', 'allocation', 'deallocation')),
                quantity_change INTEGER NOT NULL,
                actor_id INTEGER,
                actor_name TEXT,
                destination TEXT,
                purpose TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // ---- IMMUTABLE AUDIT TRIGGERS ----
        await client.query(`
            CREATE OR REPLACE FUNCTION prevent_transaction_changes()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'Transactions cannot be modified - immutable audit trail';
            END;
            $$ LANGUAGE plpgsql;
        `);

        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_transaction_delete') THEN
                    CREATE TRIGGER trg_prevent_transaction_delete
                    BEFORE DELETE ON transactions
                    FOR EACH ROW EXECUTE FUNCTION prevent_transaction_changes();
                END IF;
            END $$;
        `);

        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_transaction_update') THEN
                    CREATE TRIGGER trg_prevent_transaction_update
                    BEFORE UPDATE ON transactions
                    FOR EACH ROW EXECUTE FUNCTION prevent_transaction_changes();
                END IF;
            END $$;
        `);

        // ---- SEED USERS ----
        const adminExists = (await client.query('SELECT id FROM users WHERE username = $1', ['admin'])).rows[0];
        if (!adminExists) {
            const adminHash = bcrypt.hashSync('admin', 10);
            const staffHash = bcrypt.hashSync('staff', 10);

            await client.query(
                'INSERT INTO users (username, full_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
                ['admin', 'Administrator', 'admin@stocksense.com', adminHash, 'admin']
            );
            await client.query(
                'INSERT INTO users (username, full_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
                ['staff', 'Staff User', 'staff@stocksense.com', staffHash, 'staff']
            );
            console.log('[DB] Default users created: admin/admin and staff/staff');
        }

        // ---- SEED INVENTORY ----
        const itemCount = parseInt((await client.query('SELECT COUNT(*) AS count FROM inventory')).rows[0].count);
        if (itemCount === 0) {
            const seedItems = [
                ['SKU-101', 'Industrial Motor',  '6.01 mg pwctt',   'Siemens',      '2025-01-10', 52,  30,  100, 10,  null, '2024-01-01'],
                ['SKU-205', 'Hydraulic Pump',    '60rt heavy duty', 'Parker',       '2025-05-20', 180, 120, 300, 50,  null, '2026-12-01'],
                ['SKU-308', 'Conveyor Belt',     '10.0m industrial','ConveyorPro',  null,         400, 100, 600, 100, null, '2027-05-20'],
                ['SKU-412', 'Control Panel',     '3-phase 440V',    'ABB',          '2025-08-15', 12,  8,   50,  5,   null, '2028-01-01'],
                ['SKU-519', 'Pressure Valve',    'DN50 stainless',  'Bosch Rexroth','2025-03-01', 8,   0,   60,  10,  null, '2025-06-30'],
            ];

            for (const item of seedItems) {
                await client.query(
                    `INSERT INTO inventory (code, name, description, vendor, delivery_date, current_stock, allocated_stock, max_ceiling, min_threshold, warranty_start, warranty_end)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                    item
                );
            }
            console.log('[DB] Sample inventory data seeded (5 items)');
        }

        console.log('[DB] PostgreSQL connected and schema ready (port 5432)');
    } finally {
        client.release();
    }
}

module.exports = { pool, initDB };
