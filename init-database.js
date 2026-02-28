// ======================================
// DATABASE INITIALIZATION SCRIPT
// Run once to create all tables and seed default data
// Usage: node init-database.js
// ======================================

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    host:     process.env.PG_HOST     || 'localhost',
    port:     parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stocksense',
    user:     process.env.PG_USER     || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
});

const sqlPath = path.join(__dirname, 'database.sql');

(async () => {
    const client = await pool.connect().catch(err => {
        console.error('❌ Cannot connect to PostgreSQL:', err.message);
        console.error('\n   Make sure PostgreSQL is running and that the database exists:');
        console.error('   psql -U postgres -c "CREATE DATABASE stocksense;"\n');
        process.exit(1);
    });

    try {
        console.log('📄 Reading schema file...');
        const schema = fs.readFileSync(sqlPath, 'utf8');

        console.log('⚙️  Creating tables...');
        await client.query(schema);

        console.log('\n✅ Database initialized successfully!\n📊 Tables created:');
        const { rows: tables } = await client.query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
             ORDER BY table_name`
        );
        for (const { table_name } of tables) {
            const { rows: [{ count }] } = await client.query(
                `SELECT COUNT(*)::int AS count FROM "${table_name}"`
            );
            console.log(`   • ${table_name.padEnd(20)} (${count} rows)`);
        }

        console.log('\n🎉 Ready to start server!  Run: npm start\n');
    } catch (error) {
        console.error('❌ Schema execution failed:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
})();
