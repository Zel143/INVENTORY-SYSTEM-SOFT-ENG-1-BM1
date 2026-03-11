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
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15-minute rolling window — auto-resets (TC-10)

const resetCodes = new Map();    // email → { code, expires }  (password reset)

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

    try {
        // TC-10: DB-persisted lockout — survives server restarts
        const now = new Date();
        const windowStart = new Date(now - LOCKOUT_WINDOW_MS);

        // Fetch or auto-expire the persisted record
        const laRow = (await pool.query(
            `SELECT * FROM login_attempts WHERE username = $1`, [username]
        )).rows[0];

        if (laRow) {
            // If the window has expired, reset the record
            if (laRow.first_attempt < windowStart) {
                await pool.query(
                    `UPDATE login_attempts SET attempt_count = 0, first_attempt = $1 WHERE username = $2`,
                    [now, username]
                );
            } else if (laRow.attempt_count >= MAX_ATTEMPTS) {
                const lockedUntil = new Date(laRow.first_attempt.getTime() + LOCKOUT_WINDOW_MS);
                const waitMins = Math.ceil((lockedUntil - now) / 60000);
                return res.status(429).json({
                    error: `Account locked. Too many failed attempts. Try again in ${waitMins} minute${waitMins !== 1 ? 's' : ''}.`
                });
            }
        }

        // TC-11: Exact case match; also accept email as login identifier
        const user = (await pool.query('SELECT * FROM users WHERE (username = $1 OR email = $1) AND is_active = 1', [username])).rows[0];

        // TC-12: bcrypt comparison prevents SQL injection / timing attacks
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            // Upsert attempt counter
            await pool.query(`
                INSERT INTO login_attempts (username, attempt_count, first_attempt)
                VALUES ($1, 1, $2)
                ON CONFLICT (username) DO UPDATE
                  SET attempt_count = CASE
                        WHEN login_attempts.first_attempt < $3 THEN 1
                        ELSE login_attempts.attempt_count + 1
                      END,
                      first_attempt = CASE
                        WHEN login_attempts.first_attempt < $3 THEN $2
                        ELSE login_attempts.first_attempt
                      END
            `, [username, now, windowStart]);

            const updated = (await pool.query(
                'SELECT attempt_count FROM login_attempts WHERE username = $1', [username]
            )).rows[0];
            const remaining = MAX_ATTEMPTS - (updated ? updated.attempt_count : 1);

            if (remaining <= 0) {
                return res.status(429).json({
                    error: 'Account locked. Too many failed attempts. Try again in 15 minutes.'
                });
            }
            return res.status(401).json({
                error: `Invalid credentials. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
            });
        }

        // Success — reset lockout counter
        await pool.query('DELETE FROM login_attempts WHERE username = $1', [username]);
        req.session.user = {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            email: user.email,
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
    const { full_name, username: rawUsername, email, password, role: rawRole } = req.body;
    if (!full_name || !email || !password) {
        return res.status(400).json({ error: 'Full name, email, and password are required' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    // Use supplied username or derive from email
    const username = rawUsername
        ? rawUsername.trim().toLowerCase()
        : email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
        return res.status(400).json({ error: 'Username must be 3–30 characters (letters, numbers, underscore only)' });
    }
    // Only 'staff' or 'admin' allowed; default to 'staff'
    const role = (rawRole === 'admin') ? 'admin' : 'staff';
    try {
        const hash = bcrypt.hashSync(password, 10);
        await pool.query(
            'INSERT INTO users (username, full_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
            [username, full_name, email, hash, role]
        );
        res.status(201).json({ success: true, message: 'Account created. You can now log in.', username, role });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Username or email already taken' });
        res.status(500).json({ error: err.message });
    }
});

// Password Reset — Step 1: generate 6-digit code (15-min TTL)
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        const user = (await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()])).rows[0];
        if (!user) {
            // Vague on purpose — prevents email enumeration
            return res.json({ success: true, message: 'If that email is registered, a code has been sent.' });
        }

        const code    = String(Math.floor(100000 + Math.random() * 900000));
        const expires = Date.now() + 15 * 60 * 1000;  // 15 minutes
        resetCodes.set(email.toLowerCase(), { code, expires });

        // In production wire a real email service here.
        // In development we return the code directly so testers can use it.
        const isDev = process.env.NODE_ENV !== 'production';
        console.log(`[Password Reset] Code for ${email}: ${code}  (expires in 15 min)`);

        res.json({
            success: true,
            message: 'Access code generated.',
            ...(isDev ? { dev_code: code } : {})
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Password Reset — Step 2: verify code
app.post('/api/verify-reset-code', (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

    const entry = resetCodes.get(email.toLowerCase());
    if (!entry) {
        return res.status(400).json({ error: 'No reset code found. Please request a new one.' });
    }
    if (Date.now() > entry.expires) {
        resetCodes.delete(email.toLowerCase());
        return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
    }
    if (entry.code !== String(code).trim()) {
        return res.status(400).json({ error: 'Incorrect code. Please try again.' });
    }

    resetCodes.delete(email.toLowerCase());  // single-use
    res.json({ success: true, message: 'Code verified. You may now log in.' });
});

// Admin — list all locked / failed-attempt accounts (TC-10 recovery)
app.get('/api/admin/lockouts', requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const windowStart = new Date(now - LOCKOUT_WINDOW_MS);
        const rows = (await pool.query(
            `SELECT * FROM login_attempts WHERE first_attempt >= $1 ORDER BY attempt_count DESC`,
            [windowStart]
        )).rows;

        const list = rows.map(r => {
            const lockedUntil = new Date(r.first_attempt.getTime() + LOCKOUT_WINDOW_MS);
            const waitMins = Math.max(0, Math.ceil((lockedUntil - now) / 60000));
            return {
                username: r.username,
                attempts: r.attempt_count,
                locked: r.attempt_count >= MAX_ATTEMPTS,
                lockedUntil: r.attempt_count >= MAX_ATTEMPTS ? lockedUntil.toISOString() : null,
                minutesRemaining: r.attempt_count >= MAX_ATTEMPTS ? waitMins : null
            };
        });
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin — clear a specific account's lockout counter
app.delete('/api/admin/lockout/:username', requireAdmin, async (req, res) => {
    const { username } = req.params;
    try {
        const result = await pool.query('DELETE FROM login_attempts WHERE username = $1', [username]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: `No lockout record found for '${username}'` });
        }
        res.json({ success: true, message: `Lockout cleared for '${username}'` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== INVENTORY ROUTES =====================

// TC-21: Load inventory — supports ?search=, ?vendor=, ?low_stock=true
app.get('/api/inventory', requireAuth, async (req, res) => {
    const { search, vendor, low_stock, stock_health, category } = req.query;
    const conditions = [];
    const params = [];

    if (search) {
        params.push(`%${search}%`);
        const idx = params.length;
        conditions.push(`(name ILIKE $${idx} OR code ILIKE $${idx} OR description ILIKE $${idx} OR category ILIKE $${idx})`);
    }
    if (vendor) {
        params.push(`%${vendor}%`);
        conditions.push(`vendor ILIKE $${params.length}`);
    }
    if (low_stock === 'true') {
        conditions.push(`(min_threshold > 0 AND current_stock <= min_threshold)`);
    }
    if (category) {
        params.push(`%${category}%`);
        conditions.push(`category ILIKE $${params.length}`);
    }
    if (stock_health === 'low') {
        conditions.push(`(min_threshold > 0 AND current_stock <= min_threshold)`);
    } else if (stock_health === 'over') {
        conditions.push(`(max_ceiling > 0 AND current_stock > max_ceiling)`);
    } else if (stock_health === 'out') {
        conditions.push(`current_stock = 0`);
    } else if (stock_health === 'normal') {
        conditions.push(`(current_stock > 0 AND (min_threshold = 0 OR current_stock > min_threshold) AND (max_ceiling = 0 OR current_stock <= max_ceiling))`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    try {
        const items = (await pool.query(
            `SELECT * FROM inventory ${where} ORDER BY code`,
            params
        )).rows;
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
            warranty_start, warranty_end, image, category, storage_location } = req.body;

    if (!code) return res.status(400).json({ error: 'Item code (SKU) is required' });
    if (!name) return res.status(400).json({ error: 'Part name is required' });

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
            INSERT INTO inventory (code, name, description, vendor, delivery_date, current_stock, allocated_stock, max_ceiling, min_threshold, warranty_start, warranty_end, image, category, storage_location)
            VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10, $11, $12, $13)
        `, [code, name, description || '', vendor || '', delivery_date || null,
            qty, ceil, thresh, warranty_start || null, warranty_end || null, image || null,
            category || '', storage_location || '']);

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
            INSERT INTO transactions (inventory_code, item_name, transaction_type, quantity_change, actor_id, actor_name, destination, purpose)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [req.params.code, item.name, txType, qty,
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

        // TC-58: Log deletion to audit trail BEFORE removing the item
        await client.query(`
            INSERT INTO transactions (inventory_code, item_name, transaction_type, quantity_change, actor_id, actor_name, purpose)
            VALUES ($1, $2, 'deletion', $3, $4, $5, 'Item permanently deleted')
        `, [item.code, item.name, -item.current_stock, req.session.user.id, req.session.user.username]);

        await client.query('DELETE FROM inventory WHERE code = $1', [req.params.code]);
        await client.query('COMMIT');
        broadcast('inventory:updated', { code: req.params.code, deleted: true });
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// TC-52 / TC-53 / TC-54: Edit item metadata (admin only)
app.put('/api/inventory/:code/details', requireAdmin, async (req, res) => {
    const { name, description, vendor, delivery_date, max_ceiling, min_threshold,
            warranty_start, warranty_end, allocated_stock, image, category, storage_location } = req.body;

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
                name             = COALESCE($1, name),
                description      = COALESCE($2, description),
                vendor           = COALESCE($3, vendor),
                delivery_date    = COALESCE($4, delivery_date),
                max_ceiling      = $5,
                min_threshold    = $6,
                warranty_start   = $7,
                warranty_end     = $8,
                allocated_stock  = $9,
                image            = COALESCE($10, image),
                category         = COALESCE($11, category),
                storage_location = COALESCE($12, storage_location)
            WHERE code = $13
        `, [name || null, description || null, vendor || null, delivery_date || null,
            ceil, thresh, warranty_start || null, warranty_end || null,
            newAlloc, image || null, category || null, storage_location || null, req.params.code]);

        const updated = (await pool.query('SELECT * FROM inventory WHERE code = $1', [req.params.code])).rows[0];
        broadcast('inventory:updated', { code: req.params.code });
        res.json({ success: true, item: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Allocate stock — reserves units without changing physical stock
app.post('/api/inventory/:code/allocate', requireAuth, async (req, res) => {
    const qty = parseInt(req.body.quantity);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });

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

        const newAlloc = item.allocated_stock + qty;
        if (newAlloc > item.current_stock) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Cannot allocate ${qty} units — only ${item.current_stock - item.allocated_stock} available`
            });
        }

        await client.query(
            'UPDATE inventory SET allocated_stock = $1 WHERE code = $2',
            [newAlloc, req.params.code]
        );
        await client.query(`
            INSERT INTO transactions (inventory_code, item_name, transaction_type, quantity_change, actor_id, actor_name, purpose)
            VALUES ($1, $2, 'allocation', $3, $4, $5, $6)
        `, [req.params.code, item.name, qty,
            req.session.user.id, req.session.user.username,
            req.body.purpose || null]);

        const updated = (await client.query('SELECT * FROM inventory WHERE code = $1', [req.params.code])).rows[0];
        await client.query('COMMIT');
        broadcast('inventory:updated', { code: req.params.code });
        res.json({ success: true, item: updated });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Deallocate stock — releases previously reserved units
app.post('/api/inventory/:code/deallocate', requireAuth, async (req, res) => {
    const qty = parseInt(req.body.quantity);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'Quantity must be a positive number' });

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

        const newAlloc = item.allocated_stock - qty;
        if (newAlloc < 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Cannot deallocate ${qty} units — only ${item.allocated_stock} currently allocated`
            });
        }

        await client.query(
            'UPDATE inventory SET allocated_stock = $1 WHERE code = $2',
            [newAlloc, req.params.code]
        );
        await client.query(`
            INSERT INTO transactions (inventory_code, item_name, transaction_type, quantity_change, actor_id, actor_name, purpose)
            VALUES ($1, $2, 'deallocation', $3, $4, $5, $6)
        `, [req.params.code, item.name, -qty,
            req.session.user.id, req.session.user.username,
            req.body.purpose || null]);

        const updated = (await client.query('SELECT * FROM inventory WHERE code = $1', [req.params.code])).rows[0];
        await client.query('COMMIT');
        broadcast('inventory:updated', { code: req.params.code });
        res.json({ success: true, item: updated });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
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

// ===================== QUICK STOCK INCREMENT/DECREMENT =====================
// Staff can update stock levels using +/- buttons on the dashboard
app.post('/api/inventory/:code/quick-update', requireAuth, async (req, res) => {
    const delta = parseInt(req.body.delta);
    if (!delta || delta === 0) return res.status(400).json({ error: 'Delta must be non-zero' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const item = (await client.query(
            'SELECT * FROM inventory WHERE code = $1 FOR UPDATE', [req.params.code]
        )).rows[0];
        if (!item) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Item not found' }); }

        const newStock = item.current_stock + delta;
        if (newStock < 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Stock cannot go below zero' }); }
        if (newStock < item.allocated_stock) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cannot reduce below allocated stock' });
        }

        await client.query('UPDATE inventory SET current_stock = $1 WHERE code = $2', [newStock, req.params.code]);
        await client.query(`
            INSERT INTO transactions (inventory_code, item_name, transaction_type, quantity_change, actor_id, actor_name, purpose)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [req.params.code, item.name, delta > 0 ? 'addition' : 'dispatch', delta,
            req.session.user.id, req.session.user.username, 'Quick stock update']);

        const updated = (await client.query('SELECT * FROM inventory WHERE code = $1', [req.params.code])).rows[0];
        await client.query('COMMIT');
        broadcast('inventory:updated', { code: req.params.code });
        res.json({ success: true, item: updated });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: err.message });
    } finally { client.release(); }
});

// ===================== USER PROFILE =====================
app.get('/api/profile', requireAuth, async (req, res) => {
    try {
        const user = (await pool.query(
            'SELECT id, username, full_name, email, role, is_active, created_at FROM users WHERE id = $1',
            [req.session.user.id]
        )).rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== ADMIN: USER MANAGEMENT =====================
// List all users
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = (await pool.query(
            'SELECT id, username, full_name, email, role, is_active, created_at FROM users ORDER BY id'
        )).rows;
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a user (admin creates warehouse personnel)
app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const { full_name, username: rawUsername, email, password, role: rawRole } = req.body;
    if (!full_name || !email || !password) {
        return res.status(400).json({ error: 'Full name, email, and password are required' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const username = rawUsername ? rawUsername.trim().toLowerCase()
        : email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
        return res.status(400).json({ error: 'Username must be 3–30 characters (letters, numbers, underscore only)' });
    }
    const role = (rawRole === 'admin') ? 'admin' : 'staff';
    try {
        const hash = bcrypt.hashSync(password, 10);
        await pool.query(
            'INSERT INTO users (username, full_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
            [username, full_name, email, hash, role]
        );
        res.status(201).json({ success: true, message: 'User created successfully', username, role });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Username or email already taken' });
        res.status(500).json({ error: err.message });
    }
});

// Deactivate a user account (revoke access without deleting audit data)
app.put('/api/admin/users/:id/deactivate', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (userId === req.session.user.id) {
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }
    try {
        const result = await pool.query('UPDATE users SET is_active = 0 WHERE id = $1', [userId]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, message: 'User deactivated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reactivate a user account
app.put('/api/admin/users/:id/activate', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const result = await pool.query('UPDATE users SET is_active = 1 WHERE id = $1', [userId]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, message: 'User activated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a user account (admin only)
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (userId === req.session.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    try {
        const result = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== REPORTS =====================
// Summarized inventory report filtered by date range and/or category
app.get('/api/reports/inventory', requireAdmin, async (req, res) => {
    const { start_date, end_date, category } = req.query;
    const conditions = [];
    const params = [];

    if (category) {
        params.push(`%${category}%`);
        conditions.push(`i.category ILIKE $${params.length}`);
    }

    const txConditions = [];
    const txParams = [];
    if (start_date) {
        txParams.push(start_date);
        txConditions.push(`t.timestamp >= $${txParams.length}`);
    }
    if (end_date) {
        txParams.push(end_date + 'T23:59:59Z');
        txConditions.push(`t.timestamp <= $${txParams.length}`);
    }

    try {
        // Inventory summary
        const invWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const items = (await pool.query(`
            SELECT code, name, category, current_stock, allocated_stock, min_threshold, max_ceiling,
                   CASE WHEN current_stock = 0 THEN 'out-of-stock'
                        WHEN min_threshold > 0 AND current_stock <= min_threshold THEN 'low'
                        WHEN max_ceiling > 0 AND current_stock > max_ceiling THEN 'over'
                        ELSE 'normal' END AS stock_health
            FROM inventory i ${invWhere}
            ORDER BY code
        `, params)).rows;

        // Transaction summary within date range
        const allTxConditions = [...txConditions];
        const allTxParams = [...txParams];
        if (category) {
            allTxParams.push(`%${category}%`);
            allTxConditions.push(`i.category ILIKE $${allTxParams.length}`);
        }
        const txWhere = allTxConditions.length ? `WHERE ${allTxConditions.join(' AND ')}` : '';
        const txSummary = (await pool.query(`
            SELECT t.transaction_type, COUNT(*) AS count, COALESCE(SUM(ABS(t.quantity_change)), 0) AS total_qty
            FROM transactions t
            LEFT JOIN inventory i ON t.inventory_code = i.code
            ${txWhere}
            GROUP BY t.transaction_type
        `, allTxParams)).rows;

        const totalItems = items.length;
        const lowStock = items.filter(i => i.stock_health === 'low').length;
        const outOfStock = items.filter(i => i.stock_health === 'out-of-stock').length;
        const overStock = items.filter(i => i.stock_health === 'over').length;

        res.json({
            summary: { totalItems, lowStock, outOfStock, overStock },
            items,
            transactions: txSummary,
            filters: { start_date, end_date, category }
        });
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
async function startServer() {
    app.listen(PORT, () => {
        console.log(`\n✅  StockSense HTTP server running → http://localhost:${PORT}`);
        console.log(`    Database: SQLite (local)`);
        console.log(`    Attempting DB init…\n`);
    });

    try {
        await initDB();
        console.log(`✅  Database ready. Login with:  admin / admin   |   staff / staff\n`);
    } catch (err) {
        console.error(`❌  DB init failed: ${err.message}`);
        console.error('    → Check that stocksense.db is accessible in the backend files/ directory\n');
    }
}

startServer();
