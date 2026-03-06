// ============================================================
// StockSense — Database Seeder
// Creates the initial admin and staff accounts with
// properly bcrypt-hashed passwords.
//
// Usage:
//   node seed.js
//
// Prerequisites:
//   - .env file must exist with DATABASE_URL set
//   - supabase/schema.sql must already be run in Supabase
// ============================================================

'use strict';

require('dotenv').config();

const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Default accounts — change passwords before using in production
const USERS = [
    { username: 'admin', password: 'admin', role: 'admin' },
    { username: 'staff', password: 'staff', role: 'staff' }
];

async function seed() {
    console.log('🌱  StockSense database seeder starting...\n');

    const client = await pool.connect();
    try {
        for (const user of USERS) {
            console.log(`   Hashing password for "${user.username}"...`);
            const hash = await bcrypt.hash(user.password, 10);

            const result = await client.query(
                `INSERT INTO users (username, password_hash, role)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (username)
                 DO UPDATE SET password_hash = EXCLUDED.password_hash,
                               role          = EXCLUDED.role
                 RETURNING username, role`,
                [user.username, hash, user.role]
            );

            const row = result.rows[0];
            console.log(`   ✅  User "${row.username}" (${row.role}) — inserted / updated`);
        }

        console.log('\n✅  Seeding complete!\n');
        console.log('   Default credentials:');
        console.log('     Admin  → username: admin  | password: admin');
        console.log('     Staff  → username: staff  | password: staff');
        console.log('\n   ⚠️  Change these passwords before deploying to production.\n');

    } catch (err) {
        console.error('\n❌  Seeding failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
