// ======================================
// DATABASE INITIALIZATION SCRIPT
// Run this once to set up the SQLite database
// ======================================

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'stocksense.db');
const sqlPath = path.join(__dirname, 'database.sql');

// Delete existing database if it exists
if (fs.existsSync(dbPath)) {
    console.log('🗑️  Removing existing database...');
    fs.unlinkSync(dbPath);
}

console.log('📦 Creating new database...');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Read SQL schema file
console.log('📄 Reading schema file...');
const schema = fs.readFileSync(sqlPath, 'utf8');

// Execute schema (split by semicolons and filter empty statements)
console.log('⚙️  Creating tables...');
const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

for (const statement of statements) {
    try {
        db.exec(statement);
    } catch (error) {
        console.error('Error executing statement:', error.message);
        console.error('Statement:', statement.substring(0, 100) + '...');
    }
}

// Verify tables were created
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('\n✅ Database initialized successfully!');
console.log('📊 Tables created:');
tables.forEach(table => {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
    console.log(`   • ${table.name.padEnd(20)} (${count.count} rows)`);
});

db.close();

console.log('\n🎉 Ready to start server! Run: npm start');
