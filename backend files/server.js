'use strict';
require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const os       = require('os');
const { db, initDB } = require('./database');

function getLanIP() {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

const app  = express();
const PORT = process.env.PORT || 3000;

// ===================== SSE CLIENTS =====================
const sseClients = new Set();

function broadcast(event, data = {}) {
    for (const client of sseClients) {
        try { client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
        catch (_) { sseClients.delete(client); }
    }
}

// ===================== MIDDLEWARE =====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend files')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'stocksense-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 2 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// ===================== AUTH HELPERS =====================
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 15 * 60 * 1000;
const resetCodes   = new Map();

function requireAuth(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user)                     return res.status(401).json({ error: 'Not authenticated' });
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
}

// ===================== AUTH ROUTES =====================

app.get('/api/session', (req, res) => {
    if (req.session.user) {
        res.json({ authenticated: true, user: req.session.user });
    } else {
        res.json({ authenticated: false });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ error: 'Username and password required' });

    const now         = Date.now();
    const windowStart = new Date(now - LOCKOUT_MS).toISOString();

    const la = db.prepare('SELECT * FROM login_attempts WHERE username = ?').get(username);
    if (la) {
        const firstAttempt = new Date(la.first_attempt).getTime();
        if (la.first_attempt < windowStart) {
            db.prepare(`UPDATE login_attempts SET attempt_count = 0, first_attempt = datetime('now') WHERE username = ?`).run(username);
        } else if (la.attempt_count >= MAX_ATTEMPTS) {
            const lockedUntil = firstAttempt + LOCKOUT_MS;
            const waitMins    = Math.ceil((lockedUntil - now) / 60000);
            return res.status(429).json({
                error: `Account locked. Too many failed attempts. Try again in ${waitMins} minute${waitMins !== 1 ? 's' : ''}.`
            });
        }
    }

    const user = db.prepare(
        'SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1'
    ).get(username, username.toLowerCase());

    if (!user || !bcrypt.compareSync(password, user.password)) {
        const existing = db.prepare('SELECT * FROM login_attempts WHERE username = ?').get(username);
        let newCount;
        if (!existing) {
            db.prepare(`INSERT INTO login_attempts (username, attempt_count, first_attempt) VALUES (?, 1, datetime('now'))`).run(username);
            newCount = 1;
        } else {
            if (existing.first_attempt < windowStart) {
                db.prepare(`UPDATE login_attempts SET attempt_count = 1, first_attempt = datetime('now') WHERE username = ?`).run(username);
                newCount = 1;
            } else {
                newCount = existing.attempt_count + 1;
                db.prepare('UPDATE login_attempts SET attempt_count = ? WHERE username = ?').run(newCount, username);
            }
        }
        const remaining = MAX_ATTEMPTS - newCount;
        if (remaining <= 0)
            return res.status(429).json({ error: 'Account locked. Too many failed attempts. Try again in 15 minutes.' });
        return res.status(401).json({
            error: `Invalid credentials. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
        });
    }

    db.prepare('DELETE FROM login_attempts WHERE username = ?').run(username);
    req.session.user = {
        id:        user.id,
        username:  user.username,
        full_name: user.full_name,
        email:     user.email,
        role:      user.role
    };
    res.json({ success: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

app.post('/api/register', (req, res) => {
    const { full_name, username: rawUsername, email, password, role: rawRole } = req.body;
    if (!full_name || !email || !password)
        return res.status(400).json({ error: 'Full name, email, and password are required' });
    if (password.length < 8)
        return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const username = rawUsername
        ? rawUsername.trim().toLowerCase()
        : email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!/^[a-z0-9_]{3,30}$/.test(username))
        return res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, underscore only)' });

    const role = rawRole === 'admin' ? 'admin' : 'staff';
    try {
        const hash = bcrypt.hashSync(password, 10);
        db.prepare('INSERT INTO users (username, password, full_name, email, role) VALUES (?,?,?,?,?)').run(
            username, hash, full_name, email.toLowerCase(), role
        );
        res.status(201).json({ success: true, message: 'Account created. You can now log in.', username, role });
    } catch {
        res.status(400).json({ error: 'Username or email already taken' });
    }
});

app.post('/api/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = db.prepare('SELECT id FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase());
    if (!user) return res.json({ success: true, message: 'If that email is registered, a code has been sent.' });

    const code    = String(Math.floor(100000 + Math.random() * 900000));
    const expires = Date.now() + 15 * 60 * 1000;
    resetCodes.set(email.toLowerCase(), { code, expires });
    console.log(`[Password Reset] Code for ${email}: ${code}  (expires in 15 min)`);

    const isDev = process.env.NODE_ENV !== 'production';
    res.json({ success: true, message: 'Access code generated.', ...(isDev ? { dev_code: code } : {}) });
});

app.post('/api/verify-reset-code', (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

    const entry = resetCodes.get(email.toLowerCase());
    if (!entry) return res.status(400).json({ error: 'No reset code found. Please request a new one.' });
    if (Date.now() > entry.expires) {
        resetCodes.delete(email.toLowerCase());
        return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
    }
    if (entry.code !== String(code).trim())
        return res.status(400).json({ error: 'Incorrect code. Please try again.' });

    resetCodes.delete(email.toLowerCase());
    res.json({ success: true, message: 'Code verified. You may now log in.' });
});

app.get('/api/admin/lockouts', requireAdmin, (req, res) => {
    const now         = Date.now();
    const windowStart = new Date(now - LOCKOUT_MS).toISOString();
    const rows = db.prepare('SELECT * FROM login_attempts WHERE first_attempt >= ?').all(windowStart);
    const list = rows.map(r => {
        const fa          = new Date(r.first_attempt).getTime();
        const lockedUntil = fa + LOCKOUT_MS;
        const waitMins    = Math.max(0, Math.ceil((lockedUntil - now) / 60000));
        return {
            username:         r.username,
            attempts:         r.attempt_count,
            locked:           r.attempt_count >= MAX_ATTEMPTS,
            lockedUntil:      r.attempt_count >= MAX_ATTEMPTS ? new Date(lockedUntil).toISOString() : null,
            minutesRemaining: r.attempt_count >= MAX_ATTEMPTS ? waitMins : null
        };
    }).sort((a, b) => b.attempts - a.attempts);
    res.json(list);
});

app.delete('/api/admin/lockout/:username', requireAdmin, (req, res) => {
    const info = db.prepare('DELETE FROM login_attempts WHERE username = ?').run(req.params.username);
    if (!info.changes) return res.status(404).json({ error: `No lockout record found for '${req.params.username}'` });
    res.json({ success: true, message: `Lockout cleared for '${req.params.username}'` });
});

// ===================== INVENTORY ROUTES =====================

app.get('/api/inventory', requireAuth, (req, res) => {
    const { search, vendor, low_stock, stock_health, category } = req.query;
    let items = db.prepare('SELECT * FROM inventory ORDER BY code ASC').all();

    if (search) {
        const s = search.toLowerCase();
        items = items.filter(i =>
            (i.code        || '').toLowerCase().includes(s) ||
            (i.name        || '').toLowerCase().includes(s) ||
            (i.description || '').toLowerCase().includes(s) ||
            (i.category    || '').toLowerCase().includes(s)
        );
    }
    if (vendor) {
        const v = vendor.toLowerCase();
        items = items.filter(i => (i.vendor || '').toLowerCase().includes(v));
    }
    if (low_stock === 'true')
        items = items.filter(i => i.min_threshold > 0 && i.current_stock <= i.min_threshold);
    if (category) {
        const c = category.toLowerCase();
        items = items.filter(i => (i.category || '').toLowerCase().includes(c));
    }
    if (stock_health === 'low')
        items = items.filter(i => i.min_threshold > 0 && i.current_stock <= i.min_threshold);
    else if (stock_health === 'over')
        items = items.filter(i => i.max_ceiling > 0 && i.current_stock > i.max_ceiling);
    else if (stock_health === 'out')
        items = items.filter(i => i.current_stock === 0);
    else if (stock_health === 'normal')
        items = items.filter(i =>
            i.current_stock > 0 &&
            (i.min_threshold === 0 || i.current_stock > i.min_threshold) &&
            (i.max_ceiling   === 0 || i.current_stock <= i.max_ceiling)
        );

    res.json(items);
});

app.get('/api/inventory/:code', requireAuth, (req, res) => {
    const item = db.prepare('SELECT * FROM inventory WHERE code = ?').get(req.params.code);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
});

app.post('/api/inventory', requireAdmin, (req, res) => {
    const { code, name, description, vendor, delivery_date,
            current_stock, max_ceiling, min_threshold,
            warranty_start, warranty_end, image, category, storage_location } = req.body;

    if (!code) return res.status(400).json({ error: 'Item code (SKU) is required' });
    if (!name) return res.status(400).json({ error: 'Part name is required' });

    const qty    = parseInt(current_stock) || 0;
    const ceil   = parseInt(max_ceiling)   || 999;
    const thresh = parseInt(min_threshold) || 0;

    if (qty < 0) return res.status(400).json({ error: 'Stock quantity cannot be negative' });
    if (warranty_start && warranty_end && warranty_end < warranty_start)
        return res.status(400).json({ error: 'Warranty end date must be after warranty start date' });

    try {
        db.prepare(`
            INSERT INTO inventory
              (code, name, description, vendor, delivery_date, current_stock, allocated_stock,
               max_ceiling, min_threshold, warranty_start, warranty_end, image, category, storage_location)
            VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?,?)
        `).run(code, name, description || '', vendor || '', delivery_date || null,
               qty, ceil, thresh, warranty_start || null, warranty_end || null,
               image || null, category || '', storage_location || '');

        broadcast('inventory:added', { code });
        res.status(201).json({ success: true, message: 'Item added successfully' });
    } catch {
        res.status(400).json({ error: `Item code ${code} already exists` });
    }
});

app.put('/api/inventory/:code', requireAuth, (req, res) => {
    const { quantity_change, destination, purpose } = req.body;
    const qty = parseInt(quantity_change);

    if (!qty || qty === 0)
        return res.status(400).json({ error: 'Quantity must be a non-zero number' });
    if (qty < 0 && !(destination || '').trim())
        return res.status(400).json({ error: 'Destination is required for dispatch' });

    const txType = qty > 0 ? 'addition' : 'dispatch';
    const item   = db.prepare('SELECT * FROM inventory WHERE code = ?').get(req.params.code);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const newStock = item.current_stock + qty;
    if (newStock < 0)
        return res.status(400).json({ error: 'Insufficient stock' });
    if (newStock < item.allocated_stock)
        return res.status(400).json({
            error: 'Allocation Breach',
            details: {
                available: item.current_stock - item.allocated_stock,
                allocated: item.allocated_stock,
                requested: Math.abs(qty)
            }
        });

    db.transaction(() => {
        db.prepare('UPDATE inventory SET current_stock = ? WHERE code = ?').run(newStock, req.params.code);
        db.prepare(`
            INSERT INTO transactions
              (inventory_code, item_name, transaction_type, quantity_change, actor_id, actor_name, destination, purpose)
            VALUES (?,?,?,?,?,?,?,?)
        `).run(req.params.code, item.name, txType, qty,
               req.session.user.id, req.session.user.username,
               destination || null, purpose || null);
    })();

    broadcast('inventory:updated', { code: req.params.code });
    res.json({ success: true, item: { ...item, current_stock: newStock } });
});

app.delete('/api/inventory/:code', requireAdmin, (req, res) => {
    const item = db.prepare('SELECT * FROM inventory WHERE code = ?').get(req.params.code);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    db.transaction(() => {
        db.prepare(`
            INSERT INTO transactions
              (inventory_code, item_name, transaction_type, quantity_change, actor_id, actor_name, purpose)
            VALUES (?,?,?,?,?,?,?)
        `).run(item.code, item.name, 'deletion', -item.current_stock,
               req.session.user.id, req.session.user.username, 'Item permanently deleted');
        db.prepare('DELETE FROM inventory WHERE code = ?').run(req.params.code);
    })();

    broadcast('inventory:updated', { code: req.params.code, deleted: true });
    res.json({ success: true });
});

app.put('/api/inventory/:code/details', requireAdmin, (req, res) => {
    const { name, description, vendor, delivery_date, max_ceiling, min_threshold,
            warranty_start, warranty_end, allocated_stock, image, category, storage_location } = req.body;

    const ceil   = parseInt(max_ceiling)   || 999;
    const thresh = parseInt(min_threshold) || 0;

    if (warranty_start && warranty_end && warranty_end < warranty_start)
        return res.status(400).json({ error: 'Warranty end date must be after warranty start date' });

    const current = db.prepare('SELECT * FROM inventory WHERE code = ?').get(req.params.code);
    if (!current) return res.status(404).json({ error: 'Item not found' });

    const newAlloc = allocated_stock !== undefined ? parseInt(allocated_stock) : current.allocated_stock;
    if (newAlloc < 0)                     return res.status(400).json({ error: 'Allocated stock cannot be negative' });
    if (newAlloc > current.current_stock) return res.status(400).json({ error: 'Allocated stock cannot exceed physical stock' });

    db.prepare(`
        UPDATE inventory SET
          name = COALESCE(?, name), description = COALESCE(?, description),
          vendor = COALESCE(?, vendor), delivery_date = COALESCE(?, delivery_date),
          max_ceiling = ?, min_threshold = ?,
          warranty_start = ?, warranty_end = ?, allocated_stock = ?,
          image = COALESCE(?, image), category = COALESCE(?, category),
          storage_location = COALESCE(?, storage_location)
        WHERE code = ?
    `).run(name || null, description || null, vendor || null, delivery_date || null,
           ceil, thresh, warranty_start || null, warranty_end || null, newAlloc,
           image || null, category || null, storage_location || null, req.params.code);

    broadcast('inventory:updated', { code: req.params.code });
    res.json({ success: true, item: db.prepare('SELECT * FROM inventory WHERE code = ?').get(req.params.code) });
});

app.post('/api/inventory/:code/allocate', requireAuth, (req, res) => {
    const qty = parseInt(req.body.quantity);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });

    const item = db.prepare('SELECT * FROM inventory WHERE code = ?').get(req.params.code);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const newAlloc = item.allocated_stock + qty;
    if (newAlloc > item.current_stock)
        return res.status(400).json({
            error: `Cannot allocate ${qty} units - only ${item.current_stock - item.allocated_stock} available`
        });

    db.transaction(() => {
        db.prepare('UPDATE inventory SET allocated_stock = ? WHERE code = ?').run(newAlloc, req.params.code);
        db.prepare(`
            INSERT INTO transactions
              (inventory_code, item_name, transaction_type, quantity_change, actor_id, actor_name, purpose)
            VALUES (?,?,?,?,?,?,?)
        `).run(req.params.code, item.name, 'allocation', qty,
               req.session.user.id, req.session.user.username, req.body.purpose || null);
    })();

    broadcast('inventory:updated', { code: req.params.code });
    res.json({ success: true, item: { ...item, allocated_stock: newAlloc } });
});

app.post('/api/inventory/:code/deallocate', requireAuth, (req, res) => {
    const qty = parseInt(req.body.quantity);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });

    const item = db.prepare('SELECT * FROM inventory WHERE code = ?').get(req.params.code);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const newAlloc = item.allocated_stock - qty;
    if (newAlloc < 0)
        return res.status(400).json({
            error: `Cannot deallocate ${qty} units - only ${item.allocated_stock} currently allocated`
        });

    db.transaction(() => {
        db.prepare('UPDATE inventory SET allocated_stock = ? WHERE code = ?').run(newAlloc, req.params.code);
        db.prepare(`
            INSERT INTO transactions
              (inventory_code, item_name, transaction_type, quantity_change, actor_id, actor_name, purpose)
            VALUES (?,?,?,?,?,?,?)
        `).run(req.params.code, item.name, 'deallocation', -qty,
               req.session.user.id, req.session.user.username, req.body.purpose || null);
    })();

    broadcast('inventory:updated', { code: req.params.code });
    res.json({ success: true, item: { ...item, allocated_stock: newAlloc } });
});

// ===================== TRANSACTIONS ROUTES =====================

app.get('/api/transactions', requireAdmin, (req, res) => {
    const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
    const page   = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    const total = db.prepare('SELECT COUNT(*) AS cnt FROM transactions').get().cnt;
    const rows  = db.prepare('SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ? OFFSET ?').all(limit, offset);
    res.json({ transactions: rows, total, page, limit, pages: Math.ceil(total / limit) });
});

app.get('/api/transactions/item/:code', requireAuth, (req, res) => {
    const rows = db.prepare(
        'SELECT * FROM transactions WHERE inventory_code = ? ORDER BY timestamp DESC LIMIT 50'
    ).all(req.params.code);
    res.json(rows);
});

// ===================== STATS & ALERTS =====================

app.get('/api/stats', requireAuth, (req, res) => {
    const total_skus      = db.prepare('SELECT COUNT(*) AS cnt FROM inventory').get().cnt;
    const total_allocated = db.prepare('SELECT SUM(allocated_stock) AS s FROM inventory').get().s || 0;
    const low_stock       = db.prepare('SELECT COUNT(*) AS cnt FROM inventory WHERE min_threshold > 0 AND current_stock <= min_threshold').get().cnt;
    const over_stock      = db.prepare('SELECT COUNT(*) AS cnt FROM inventory WHERE max_ceiling > 0 AND current_stock > max_ceiling').get().cnt;
    res.json({ total_skus, total_allocated, low_stock, over_stock });
});

app.get('/api/low-stock', requireAuth, (req, res) => {
    const items = db.prepare(
        'SELECT * FROM inventory WHERE min_threshold > 0 AND current_stock <= min_threshold ORDER BY current_stock ASC'
    ).all();
    res.json(items);
});

// ===================== QUICK STOCK UPDATE =====================
app.post('/api/inventory/:code/quick-update', requireAuth, (req, res) => {
    const delta = parseInt(req.body.delta);
    if (!delta || delta === 0) return res.status(400).json({ error: 'Delta must be non-zero' });

    const item = db.prepare('SELECT * FROM inventory WHERE code = ?').get(req.params.code);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const newStock = item.current_stock + delta;
    if (newStock < 0)                    return res.status(400).json({ error: 'Stock cannot go below zero' });
    if (newStock < item.allocated_stock) return res.status(400).json({ error: 'Cannot reduce below allocated stock' });

    db.transaction(() => {
        db.prepare('UPDATE inventory SET current_stock = ? WHERE code = ?').run(newStock, req.params.code);
        db.prepare(`
            INSERT INTO transactions
              (inventory_code, item_name, transaction_type, quantity_change, actor_id, actor_name, purpose)
            VALUES (?,?,?,?,?,?,?)
        `).run(req.params.code, item.name, delta > 0 ? 'addition' : 'dispatch', delta,
               req.session.user.id, req.session.user.username, 'Quick stock update');
    })();

    broadcast('inventory:updated', { code: req.params.code });
    res.json({ success: true, item: { ...item, current_stock: newStock } });
});

// ===================== USER PROFILE =====================
app.get('/api/profile', requireAuth, (req, res) => {
    const user = db.prepare('SELECT id, username, full_name, email, role, created_at FROM users WHERE id = ?').get(req.session.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
});

// ===================== ADMIN: USER MANAGEMENT =====================
app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = db.prepare('SELECT id, username, full_name, email, role, is_active, created_at FROM users ORDER BY username').all();
    res.json(users);
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
    const { full_name, username: rawUsername, email, password, role: rawRole } = req.body;
    if (!full_name || !email || !password)
        return res.status(400).json({ error: 'Full name, email, and password are required' });
    if (password.length < 8)
        return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const username = rawUsername
        ? rawUsername.trim().toLowerCase()
        : email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!/^[a-z0-9_]{3,30}$/.test(username))
        return res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, underscore only)' });

    const role = rawRole === 'admin' ? 'admin' : 'staff';
    try {
        const hash = bcrypt.hashSync(password, 10);
        db.prepare('INSERT INTO users (username, password, full_name, email, role) VALUES (?,?,?,?,?)').run(
            username, hash, full_name, email.toLowerCase(), role
        );
        res.status(201).json({ success: true, message: 'User created successfully', username, role });
    } catch {
        res.status(400).json({ error: 'Username or email already taken' });
    }
});

app.put('/api/admin/users/:id/deactivate', requireAdmin, (req, res) => {
    if (String(req.params.id) === String(req.session.user.id))
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
    const info = db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'User deactivated' });
});

app.put('/api/admin/users/:id/activate', requireAdmin, (req, res) => {
    const info = db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'User activated' });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
    if (String(req.params.id) === String(req.session.user.id))
        return res.status(400).json({ error: 'Cannot delete your own account' });
    const info = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'User deleted' });
});

// ===================== REPORTS =====================
app.get('/api/reports/inventory', requireAdmin, (req, res) => {
    const { start_date, end_date, category } = req.query;

    let items = db.prepare('SELECT * FROM inventory ORDER BY code ASC').all();
    if (category) {
        const c = category.toLowerCase();
        items = items.filter(i => (i.category || '').toLowerCase().includes(c));
    }

    const itemsWithHealth = items.map(i => ({
        code:            i.code,
        name:            i.name,
        category:        i.category,
        current_stock:   i.current_stock,
        allocated_stock: i.allocated_stock,
        min_threshold:   i.min_threshold,
        max_ceiling:     i.max_ceiling,
        stock_health: i.current_stock === 0                                             ? 'out-of-stock'
            : i.min_threshold > 0 && i.current_stock <= i.min_threshold ? 'low'
            : i.max_ceiling   > 0 && i.current_stock >  i.max_ceiling   ? 'over'
            : 'normal'
    }));

    let txs = db.prepare('SELECT * FROM transactions ORDER BY timestamp DESC').all();
    if (start_date) {
        const from = new Date(start_date);
        txs = txs.filter(t => new Date(t.timestamp) >= from);
    }
    if (end_date) {
        const to = new Date(end_date + 'T23:59:59Z');
        txs = txs.filter(t => new Date(t.timestamp) <= to);
    }
    if (category) {
        const invCodes = new Set(itemsWithHealth.map(i => i.code));
        txs = txs.filter(t => invCodes.has(t.inventory_code));
    }

    const byType = {};
    for (const tx of txs) {
        if (!byType[tx.transaction_type])
            byType[tx.transaction_type] = { transaction_type: tx.transaction_type, count: 0, total_qty: 0 };
        byType[tx.transaction_type].count++;
        byType[tx.transaction_type].total_qty += Math.abs(tx.quantity_change || 0);
    }

    res.json({
        summary: {
            totalItems: itemsWithHealth.length,
            lowStock:   itemsWithHealth.filter(i => i.stock_health === 'low').length,
            outOfStock: itemsWithHealth.filter(i => i.stock_health === 'out-of-stock').length,
            overStock:  itemsWithHealth.filter(i => i.stock_health === 'over').length
        },
        items:        itemsWithHealth,
        transactions: Object.values(byType),
        filters:      { start_date, end_date, category }
    });
});

// ===================== SSE =====================
app.get('/api/events', requireAuth, (req, res) => {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    res.write('event: connected\ndata: {}\n\n');
    sseClients.add(res);

    const ping = setInterval(() => {
        try { res.write(': ping\n\n'); }
        catch (_) { clearInterval(ping); sseClients.delete(res); }
    }, 25000);

    req.on('close', () => {
        clearInterval(ping);
        sseClients.delete(res);
    });
});

// ===================== START =====================
initDB();
app.listen(PORT, '0.0.0.0', () => {
    const lanIP = getLanIP();
    console.log(`\nâœ…  StockSense HTTP server running`);
    console.log(`    Local:    http://localhost:${PORT}`);
    console.log(`    Network:  http://${lanIP}:${PORT}  <- share this with other devices`);
    console.log(`    Database: SQLite (local)\n`);

    // Auto-open browser to localhost
    const url = `http://localhost:${PORT}`;
    const { exec } = require('child_process');
    const cmd = process.platform === 'win32' ? `start ${url}`
              : process.platform === 'darwin' ? `open ${url}`
              : `xdg-open ${url}`;
    exec(cmd);
});

