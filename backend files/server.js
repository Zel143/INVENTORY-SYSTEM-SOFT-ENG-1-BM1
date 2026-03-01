require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { pool, initDB } = require('./database');

const app = express();
const PORT = 3000;

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

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend files')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'stocksense-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 2 * 60 * 60 * 1000,  // 2 hours (TC-19)
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// ===================== AUTH HELPERS =====================
const loginAttempts = new Map();  // username → count  (TC-10 lockout)
const MAX_ATTEMPTS = 5;

function requireAuth(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
}

// ===================== AUTH ROUTES =====================

// TC-16: Session check used by app.js on every page load
app.get('/api/session', (req, res) => {
    if (req.session.user) {
        res.json({ authenticated: true, user: req.session.user });
    } else {
        res.json({ authenticated: false });
    }
});

// TC-7 / TC-8 / TC-9 / TC-10 / TC-11 / TC-12: Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    // TC-7: Empty guard
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    // TC-10: Lockout check
    const attempts = loginAttempts.get(username) || 0;
    if (attempts >= MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'Account locked due to too many failed attempts. Try again later.' });
    }

    try {
        // TC-11: Exact case match
        const user = (await pool.query('SELECT * FROM users WHERE username = $1', [username])).rows[0];

        // TC-12: bcrypt comparison prevents SQL injection / timing attacks
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            const newCount = attempts + 1;
            loginAttempts.set(username, newCount);
            const remaining = MAX_ATTEMPTS - newCount;
            return res.status(401).json({
                error: `Invalid credentials. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
            });
        }

        // Success — reset lockout counter
        loginAttempts.delete(username);
        req.session.user = {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            role: user.role
        };

        // TC-8/9: Return role so frontend can route correctly
        res.json({ success: true, user: req.session.user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// TC-20: Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// TC-N: Register (for signup.html)
app.post('/api/register', async (req, res) => {
    const { full_name, email, password } = req.body;
    if (!full_name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    try {
        const hash = bcrypt.hashSync(password, 10);
        await pool.query(
            'INSERT INTO users (username, full_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
            [username, full_name, email, hash, 'staff']
        );
        res.status(201).json({ success: true, message: 'Account created. You can now log in.', username });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Email already registered' });
        res.status(500).json({ error: err.message });
    }
});

// ===================== INVENTORY ROUTES =====================

// TC-21: Load inventory
app.get('/api/inventory', requireAuth, async (req, res) => {
    try {
        const items = (await pool.query('SELECT * FROM inventory ORDER BY code')).rows;
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Single item
app.get('/api/inventory/:code', requireAuth, async (req, res) => {
    try {
        const item = (await pool.query('SELECT * FROM inventory WHERE code = $1', [req.params.code])).rows[0];
        if (!item) return res.status(404).json({ error: 'Item not found' });
        res.json(item);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// TC-41 / TC-42 / TC-43 / TC-44 / TC-45 / TC-46 / TC-50: Add item (admin only)
app.post('/api/inventory', requireAdmin, async (req, res) => {
    const { code, name, description, vendor, delivery_date,
            current_stock, max_ceiling, min_threshold,
            warranty_start, warranty_end } = req.body;

    if (!code) return res.status(400).json({ error: 'Item code is required' });
    if (!name) return res.status(400).json({ error: 'Description/name is required' });

    const qty   = parseInt(current_stock) || 0;
    const ceil  = parseInt(max_ceiling)   || 999;
    const thresh= parseInt(min_threshold) || 0;

    if (qty < 0) return res.status(400).json({ error: 'Stock quantity cannot be negative' });

    // TC-50: Warranty date validation
    if (warranty_start && warranty_end && warranty_end < warranty_start) {
        return res.status(400).json({ error: 'Warranty end date must be after warranty start date' });
    }

    try {
        await pool.query(`
            INSERT INTO inventory (code, name, description, vendor, delivery_date, current_stock, allocated_stock, max_ceiling, min_threshold, warranty_start, warranty_end)
            VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10)
        `, [code, name, description || '', vendor || '', delivery_date || null,
            qty, ceil, thresh, warranty_start || null, warranty_end || null]);

        broadcast('inventory:added', { code });
        res.status(201).json({ success: true, message: 'Item added successfully' });
    } catch (err) {
        // TC-45: Duplicate SKU
        if (err.code === '23505') return res.status(400).json({ error: `Item code ${code} already exists` });
        // TC-46: Negative stock CHECK constraint
        if (err.code === '23514') return res.status(400).json({ error: 'Stock quantity cannot be negative' });
        res.status(500).json({ error: err.message });
    }
});

// TC-62 / TC-63 / TC-64 / TC-65 / TC-66 / TC-69 / TC-70 / TC-72: Dispatch or Restock
app.put('/api/inventory/:code', requireAuth, async (req, res) => {
    const { quantity_change, destination, purpose } = req.body;
    const qty = parseInt(quantity_change);

    // TC-69 / TC-71
    if (!qty || qty === 0) {
        return res.status(400).json({ error: 'Quantity must be a non-zero number' });
    }

    // TC-66: Destination required for dispatch
    if (qty < 0) {
        const trimmedDest = (destination || '').trim();
        if (!trimmedDest) {
            return res.status(400).json({ error: 'Destination is required for dispatch' });
        }
    }

    // TC-72 Fix: use 'addition' not 'restock'
    const txType = qty > 0 ? 'addition' : 'dispatch';

    // PostgreSQL transaction with row-level lock (TC-63 / TC-64)
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const item = (await client.query(
            'SELECT * FROM inventory WHERE code = $1 FOR UPDATE',
            [req.params.code]
        )).rows[0];

        if (!item) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Item not found' });
        }

        const new_stock = item.current_stock + qty;

        // TC-63: Prevent stock going negative
        if (new_stock < 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Insufficient stock' });
        }

        // TC-64 / TC-65: Allocation breach guard
        if (new_stock < item.allocated_stock) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'Allocation Breach',
                details: {
                    available: item.current_stock - item.allocated_stock,
                    allocated: item.allocated_stock,
                    requested: Math.abs(qty)
                }
            });
        }

        await client.query(
            'UPDATE inventory SET current_stock = $1 WHERE code = $2',
            [new_stock, req.params.code]
        );

        await client.query(`
            INSERT INTO transactions (inventory_code, transaction_type, quantity_change, actor_id, actor_name, destination, purpose)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [req.params.code, txType, qty,
            req.session.user.id, req.session.user.username,
            destination || null, purpose || null]);

        const updated = (await client.query(
            'SELECT * FROM inventory WHERE code = $1', [req.params.code]
        )).rows[0];

        await client.query('COMMIT');
        broadcast('inventory:updated', { code: req.params.code });
        res.json({ success: true, item: updated });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// TC-56: Delete item (admin only)
app.delete('/api/inventory/:code', requireAdmin, async (req, res) => {
    try {
        const item = (await pool.query('SELECT * FROM inventory WHERE code = $1', [req.params.code])).rows[0];
        if (!item) return res.status(404).json({ error: 'Item not found' });

        // TC-58: Log deletion to audit trail BEFORE removing the item
        await pool.query(`
            INSERT INTO transactions (inventory_code, transaction_type, quantity_change, actor_id, actor_name, purpose)
            VALUES ($1, 'deletion', $2, $3, $4, 'Item permanently deleted')
        `, [item.code, -item.current_stock, req.session.user.id, req.session.user.username]);

        await pool.query('DELETE FROM inventory WHERE code = $1', [req.params.code]);
        broadcast('inventory:updated', { code: req.params.code, deleted: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// TC-52 / TC-53 / TC-54: Edit item metadata (admin only)
app.put('/api/inventory/:code/details', requireAdmin, async (req, res) => {
    const { name, description, vendor, delivery_date, max_ceiling, min_threshold,
            warranty_start, warranty_end, allocated_stock } = req.body;

    const ceil   = parseInt(max_ceiling)    || 999;
    const thresh = parseInt(min_threshold)  || 0;
    const alloc  = allocated_stock !== undefined ? parseInt(allocated_stock) : undefined;

    // TC-50: Warranty date cross-check
    if (warranty_start && warranty_end && warranty_end < warranty_start) {
        return res.status(400).json({ error: 'Warranty end date must be after warranty start date' });
    }

    try {
        // Fetch current stock so we can validate allocation
        const current = (await pool.query('SELECT * FROM inventory WHERE code = $1', [req.params.code])).rows[0];
        if (!current) return res.status(404).json({ error: 'Item not found' });

        const newAlloc = alloc !== undefined ? alloc : current.allocated_stock;
        if (newAlloc < 0)                           return res.status(400).json({ error: 'Allocated stock cannot be negative' });
        if (newAlloc > current.current_stock)       return res.status(400).json({ error: 'Allocated stock cannot exceed physical stock' });

        await pool.query(`
            UPDATE inventory SET
                name            = COALESCE($1, name),
                description     = COALESCE($2, description),
                vendor          = COALESCE($3, vendor),
                delivery_date   = COALESCE($4, delivery_date),
                max_ceiling     = $5,
                min_threshold   = $6,
                warranty_start  = $7,
                warranty_end    = $8,
                allocated_stock = $9
            WHERE code = $10
        `, [name || null, description || null, vendor || null, delivery_date || null,
            ceil, thresh, warranty_start || null, warranty_end || null,
            newAlloc, req.params.code]);

        const updated = (await pool.query('SELECT * FROM inventory WHERE code = $1', [req.params.code])).rows[0];
        broadcast('inventory:updated', { code: req.params.code });
        res.json({ success: true, item: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== TRANSACTIONS ROUTES =====================

// TC-81 / TC-82 / TC-90: History (admin only)
app.get('/api/transactions', requireAdmin, async (req, res) => {
    const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
    const page   = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    try {
        const rows = (await pool.query(`
            SELECT t.*, i.name AS item_name
            FROM transactions t
            LEFT JOIN inventory i ON t.inventory_code = i.code
            ORDER BY t.timestamp DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset])).rows;

        const total = parseInt((await pool.query('SELECT COUNT(*) AS count FROM transactions')).rows[0].count);
        res.json({ transactions: rows, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Per-item history
app.get('/api/transactions/item/:code', requireAuth, async (req, res) => {
    try {
        const rows = (await pool.query(
            'SELECT * FROM transactions WHERE inventory_code = $1 ORDER BY timestamp DESC LIMIT 50',
            [req.params.code]
        )).rows;
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== STATS & ALERTS =====================

// TC-21: Dashboard metric cards
app.get('/api/stats', requireAuth, async (req, res) => {
    try {
        const total_skus      = parseInt((await pool.query('SELECT COUNT(*) AS c FROM inventory')).rows[0].c);
        const total_allocated = parseInt((await pool.query('SELECT COALESCE(SUM(allocated_stock), 0) AS c FROM inventory')).rows[0].c);
        const low_stock       = parseInt((await pool.query('SELECT COUNT(*) AS c FROM inventory WHERE min_threshold > 0 AND current_stock <= min_threshold')).rows[0].c);
        const over_stock      = parseInt((await pool.query('SELECT COUNT(*) AS c FROM inventory WHERE max_ceiling > 0 AND current_stock > max_ceiling')).rows[0].c);
        res.json({ total_skus, total_allocated, low_stock, over_stock });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// TC-31: Low-stock alerts
app.get('/api/low-stock', requireAuth, async (req, res) => {
    try {
        const items = (await pool.query(`
            SELECT * FROM inventory
            WHERE min_threshold > 0 AND current_stock <= min_threshold
            ORDER BY current_stock ASC
        `)).rows;
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== SSE =====================

// TC-40: Real-time inventory push
app.get('/api/events', requireAuth, (req, res) => {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    res.write('event: connected\ndata: {}\n\n');
    sseClients.add(res);

    // Keep-alive ping every 25s
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
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`\n✅  StockSense is running → http://localhost:${PORT}`);
        console.log(`    Database: PostgreSQL (localhost:5432/stocksense)`);
        console.log(`    Login with:  admin / admin   (Administrator)`);
        console.log(`                 staff / staff   (Staff User)\n`);
    });
}).catch(err => {
    console.error('❌  Failed to initialize database:', err.message);
    console.error('    Make sure PostgreSQL is running and .env credentials are correct.');
    process.exit(1);
});
