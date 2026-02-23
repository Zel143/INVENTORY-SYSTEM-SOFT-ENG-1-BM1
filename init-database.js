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

// Execute entire schema in one call so trigger bodies (which contain
// semicolons) are parsed correctly by SQLite instead of being split.
console.log('⚙️  Creating tables...');
try {
    db.exec(schema);
} catch (error) {
    console.error('Schema execution failed:', error.message);
    process.exit(1);
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
