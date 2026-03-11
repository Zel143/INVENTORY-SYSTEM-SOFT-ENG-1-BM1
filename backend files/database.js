'use strict';
require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'stocksense.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT    NOT NULL UNIQUE,
      password     TEXT    NOT NULL,
      full_name    TEXT    NOT NULL DEFAULT '',
      email        TEXT    DEFAULT '',
      role         TEXT    NOT NULL DEFAULT 'staff' CHECK(role IN ('admin','staff')),
      is_active    INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      code             TEXT    NOT NULL UNIQUE,
      name             TEXT    NOT NULL,
      description      TEXT    DEFAULT '',
      category         TEXT    DEFAULT '',
      vendor           TEXT    DEFAULT '',
      storage_location TEXT    DEFAULT '',
      delivery_date    TEXT    DEFAULT NULL,
      current_stock    INTEGER NOT NULL DEFAULT 0,
      allocated_stock  INTEGER NOT NULL DEFAULT 0,
      min_threshold    INTEGER NOT NULL DEFAULT 0,
      max_ceiling      INTEGER NOT NULL DEFAULT 999,
      warranty_start   TEXT    DEFAULT NULL,
      warranty_end     TEXT    DEFAULT NULL,
      image            TEXT    DEFAULT NULL,
      created_at       TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_code   TEXT    NOT NULL,
      item_name        TEXT    NOT NULL DEFAULT '',
      transaction_type TEXT    NOT NULL,
      quantity_change  INTEGER NOT NULL,
      actor_id         TEXT    DEFAULT NULL,
      actor_name       TEXT    DEFAULT NULL,
      destination      TEXT    DEFAULT NULL,
      purpose          TEXT    DEFAULT NULL,
      timestamp        TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      username      TEXT    NOT NULL PRIMARY KEY,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      first_attempt TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default users if not present
  const existing = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!existing) {
    const adminHash = bcrypt.hashSync('admin', 10);
    const staffHash = bcrypt.hashSync('staff', 10);
    db.prepare('INSERT INTO users (username, password, full_name, email, role) VALUES (?,?,?,?,?)').run(
      'admin', adminHash, 'Administrator', 'admin@stocksense.com', 'admin'
    );
    db.prepare('INSERT INTO users (username, password, full_name, email, role) VALUES (?,?,?,?,?)').run(
      'staff', staffHash, 'Staff User', 'staff@stocksense.com', 'staff'
    );
    console.log('[DB] Default users seeded — admin/admin  |  staff/staff');
  }

  console.log('[DB] SQLite initialised at', DB_PATH);
}

module.exports = { db, initDB };