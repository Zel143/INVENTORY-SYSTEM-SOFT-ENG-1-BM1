// ============================================================
// StockSense Inventory Management System — Backend Server
// Tech: Node.js + Express + Supabase (PostgreSQL via pg driver)
// Version: 2.0  |  Group 3 - BM1
// ============================================================

'use strict';

require('dotenv').config();

const express        = require('express');
const session        = require('express-session');
const bcrypt         = require('bcrypt');
const { Pool }       = require('pg');
const path           = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// DATABASE (Supabase / PostgreSQL)
// Use the DIRECT connection string from Supabase → Settings →
// Database → Connection string → URI (NOT the pooler URL,
// because we need transaction support with FOR UPDATE locks).
// ============================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(c => { console.log('✅  Database connected'); c.release(); })
    .catch(err => { console.error('❌  Database connection failed:', err.message); process.exit(1); });

// ============================================================
// IN-MEMORY LOGIN ATTEMPT COUNTER  (TC-10)
// Maps lowercase username → attempt count.
// Resets to 0 on successful login.
// ============================================================
const loginAttempts = {};

// ============================================================
// SSE CLIENTS  (TC-40 — real-time push)
// ============================================================
const sseClients = [];

function broadcast(event, data) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(c => {
        try { c.res.write(message); } catch (_) {}
    });
}

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static frontend files from project root
app.use(express.static(path.join(__dirname)));

// Session  (TC-19 — 2-hour expiry, TC-16 — cookie-based auth)
app.use(session({
    secret:            process.env.SESSION_SECRET || 'stocksense-change-me-in-production',
    resave:            false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'strict',
        maxAge:   2 * 60 * 60 * 1000   // 2 hours
    }
}));

// ---- Auth guards ----
function requireAuth(req, res, next) {
    if (!req.session.user)
        return res.status(401).json({ error: 'Unauthorized — please log in' });
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user)
        return res.status(401).json({ error: 'Unauthorized — please log in' });
    if (req.session.user.role !== 'admin')
        return res.status(403).json({ error: 'Forbidden — Admin access required' });
    next();
}

// ============================================================
// AUTH ROUTES
// ============================================================

// POST /api/login  (TC-7 through TC-13)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password)
        return res.status(400).json({ error: 'Username and password required' });

    const attemptKey = username.toLowerCase();

    try {
        // TC-11: exact case-sensitive username match via PostgreSQL
        const result = await pool.query(
            'SELECT id, username, password_hash, role FROM users WHERE username = $1',
            [username]
        );
        const user = result.rows[0];

        // TC-12: parameterized query — injection-safe (no concatenation)
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            loginAttempts[attemptKey] = (loginAttempts[attemptKey] || 0) + 1;
            const remaining = Math.max(0, 5 - loginAttempts[attemptKey]);
            return res.status(401).json({ error: 'Invalid credentials', remaining });
        }

        loginAttempts[attemptKey] = 0;   // reset on success

        req.session.user = { id: user.id, username: user.username, role: user.role };
        req.session.save(err => {
            if (err) return res.status(500).json({ error: 'Session error' });
            res.json({ success: true, user: { username: user.username, role: user.role } });
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/logout  (TC-20)
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// GET /api/session  (TC-16)
app.get('/api/session', (req, res) => {
    if (req.session && req.session.user)
        return res.json({ authenticated: true, user: req.session.user });
    res.json({ authenticated: false });
});

// ============================================================
// INVENTORY ROUTES
// ============================================================

// GET /api/inventory  (TC-21 — load all items)
app.get('/api/inventory', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM inventory ORDER BY code ASC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Inventory fetch error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/inventory  (TC-42 through TC-51 — add new item, admin only)
app.post('/api/inventory', requireAdmin, async (req, res) => {
    const {
        code, name, vendor,
        current_stock, allocated_stock,
        min_threshold, max_ceiling,
        warranty_start, warranty_end,
        delivery_date, image
    } = req.body;

    // TC-43: code required
    if (!code || !String(code).trim())
        return res.status(400).json({ error: 'Item code is required' });

    // TC-44: name required
    if (!name || !String(name).trim())
        return res.status(400).json({ error: 'Description/name is required' });

    // TC-46: no negative stock
    const stock = parseInt(current_stock) || 0;
    if (stock < 0)
        return res.status(400).json({ error: 'Stock cannot be negative' });

    // TC-50: warranty date order
    if (warranty_start && warranty_end &&
        new Date(warranty_end) < new Date(warranty_start))
        return res.status(400).json({
            error: 'Warranty end date must be after warranty start date'
        });

    try {
        const result = await pool.query(
            `INSERT INTO inventory
                (code, name, vendor,
                 current_stock, allocated_stock,
                 min_threshold, max_ceiling,
                 warranty_start, warranty_end,
                 delivery_date, image)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING *`,
            [
                String(code).trim(),
                String(name).trim(),
                vendor  || null,
                stock,
                parseInt(allocated_stock) || 0,
                parseInt(min_threshold)   || 0,
                max_ceiling ? parseInt(max_ceiling) : null,
                warranty_start  || null,
                warranty_end    || null,
                delivery_date   || null,
                image           || null
            ]
        );

        broadcast('inventory:added', { code: result.rows[0].code });
        res.status(201).json(result.rows[0]);

    } catch (err) {
        // TC-45: unique constraint violation
        if (err.code === '23505')
            return res.status(400).json({
                error: `Item code ${code} already exists`
            });
        console.error('Add inventory error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/inventory/:code  (TC-62 through TC-76 — dispatch / restock)
app.put('/api/inventory/:code', requireAuth, async (req, res) => {
    const { code }                     = req.params;
    const { quantity_change, destination, purpose } = req.body;

    // TC-69: zero quantity rejected
    const qtyChange = parseInt(quantity_change);
    if (!qtyChange || qtyChange === 0)
        return res.status(400).json({ error: 'Quantity must be a non-zero number' });

    // TC-66: destination required for dispatch
    if (qtyChange < 0 && (!destination || !String(destination).trim()))
        return res.status(400).json({
            error: 'Destination is required for dispatch'
        });

    // TC-74: SELECT FOR UPDATE prevents race conditions
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const itemRes = await client.query(
            'SELECT * FROM inventory WHERE code = $1 FOR UPDATE',
            [code]
        );
        const item = itemRes.rows[0];
        if (!item) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Item not found' });
        }

        const newStock = item.current_stock + qtyChange;

        // TC-63: overdraft protection
        if (newStock < 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Insufficient stock' });
        }

        // TC-64/65: allocation guardrail
        if (newStock < item.allocated_stock) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error:   'Allocation Breach',
                details: {
                    current:   item.current_stock,
                    allocated: item.allocated_stock,
                    available: item.current_stock - item.allocated_stock,
                    requested: Math.abs(qtyChange)
                }
            });
        }

        await client.query(
            'UPDATE inventory SET current_stock = $1 WHERE code = $2',
            [newStock, code]
        );

        // TC-72: transaction_type must be 'addition' or 'dispatch' (not 'restock')
        const txType = qtyChange > 0 ? 'addition' : 'dispatch';

        await client.query(
            `INSERT INTO transactions
                 (inventory_code, item_name, transaction_type,
                  quantity_change, destination, purpose, actor_name)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
                code,
                item.name,
                txType,
                qtyChange,
                destination ? String(destination).trim() : null,
                purpose     ? String(purpose).trim()     : null,
                req.session.user.username   // TC-80: actor identity
            ]
        );

        await client.query('COMMIT');

        const updated = await pool.query(
            'SELECT * FROM inventory WHERE code = $1', [code]
        );
        broadcast('inventory:updated', { code });
        res.json(updated.rows[0]);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Stock update error:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// PUT /api/inventory/:code/details  (TC-52 through TC-54 — edit metadata, admin only)
app.put('/api/inventory/:code/details', requireAdmin, async (req, res) => {
    const { code } = req.params;
    const {
        name, vendor,
        min_threshold, max_ceiling,
        allocated_stock,
        warranty_start, warranty_end,
        delivery_date, image
    } = req.body;

    // TC-50 (edit): warranty date validation
    if (warranty_start && warranty_end &&
        new Date(warranty_end) < new Date(warranty_start))
        return res.status(400).json({
            error: 'Warranty end date must be after warranty start date'
        });

    try {
        const itemRes = await pool.query(
            'SELECT * FROM inventory WHERE code = $1', [code]
        );
        const item = itemRes.rows[0];
        if (!item) return res.status(404).json({ error: 'Item not found' });

        // TC-53: allocated_stock cannot exceed current_stock
        const newAlloc = allocated_stock !== undefined
            ? parseInt(allocated_stock)
            : item.allocated_stock;
        if (newAlloc > item.current_stock)
            return res.status(400).json({
                error: 'Allocated stock cannot exceed current stock'
            });

        const result = await pool.query(
            `UPDATE inventory SET
                name             = COALESCE($1,  name),
                vendor           = COALESCE($2,  vendor),
                min_threshold    = COALESCE($3,  min_threshold),
                max_ceiling      = COALESCE($4,  max_ceiling),
                allocated_stock  = COALESCE($5,  allocated_stock),
                warranty_start   = COALESCE($6,  warranty_start),
                warranty_end     = COALESCE($7,  warranty_end),
                delivery_date    = COALESCE($8,  delivery_date),
                image            = COALESCE($9,  image)
             WHERE code = $10
             RETURNING *`,
            [
                name          || null,
                vendor        || null,
                min_threshold !== undefined ? parseInt(min_threshold) : null,
                max_ceiling   !== undefined ? parseInt(max_ceiling)   : null,
                newAlloc,
                warranty_start || null,
                warranty_end   || null,
                delivery_date  || null,
                image          || null,
                code
            ]
        );

        broadcast('inventory:updated', { code });
        res.json(result.rows[0]);

    } catch (err) {
        console.error('Edit details error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/inventory/:code  (TC-56 through TC-58 — admin only)
app.delete('/api/inventory/:code', requireAdmin, async (req, res) => {
    const { code } = req.params;
    const client   = await pool.connect();

    try {
        await client.query('BEGIN');

        const itemRes = await client.query(
            'SELECT * FROM inventory WHERE code = $1', [code]
        );
        const item = itemRes.rows[0];
        if (!item) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Item not found' });
        }

        // TC-58: log deletion BEFORE removing the row
        await client.query(
            `INSERT INTO transactions
                 (inventory_code, item_name, transaction_type,
                  quantity_change, destination, purpose, actor_name)
             VALUES ($1,$2,'deletion',$3,NULL,'Item deleted by admin',$4)`,
            [code, item.name, -item.current_stock, req.session.user.username]
        );

        await client.query('DELETE FROM inventory WHERE code = $1', [code]);
        await client.query('COMMIT');

        broadcast('inventory:updated', { code, deleted: true });
        res.json({ success: true, message: `Item ${code} deleted` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Delete error:', err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// ============================================================
// ALERT ROUTES
// ============================================================

// GET /api/low-stock  (TC-31 — items at or below threshold)
app.get('/api/low-stock', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM inventory
             WHERE min_threshold > 0
               AND current_stock <= min_threshold
             ORDER BY current_stock ASC`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/stats  (TC-98 — dashboard stats widget)
app.get('/api/stats', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                COUNT(*)                                                         AS total_skus,
                COALESCE(SUM(allocated_stock), 0)                               AS total_allocated,
                COUNT(*) FILTER (WHERE min_threshold > 0
                                   AND current_stock <= min_threshold)           AS low_stock,
                COUNT(*) FILTER (WHERE max_ceiling IS NOT NULL
                                   AND current_stock > max_ceiling)              AS over_stock
             FROM inventory`
        );
        const r = result.rows[0];
        res.json({
            total_skus:      parseInt(r.total_skus),
            total_allocated: parseInt(r.total_allocated),
            low_stock:       parseInt(r.low_stock),
            over_stock:      parseInt(r.over_stock)
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================
// TRANSACTION / HISTORY ROUTES
// ============================================================

// GET /api/transactions  (TC-81/82/90 — paginated, admin only)
app.get('/api/transactions', requireAdmin, async (req, res) => {
    const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
    const page   = Math.max(parseInt(req.query.page)   || 1,  1);
    const offset = (page - 1) * limit;

    try {
        const countRes = await pool.query('SELECT COUNT(*) FROM transactions');
        const total    = parseInt(countRes.rows[0].count);

        const result   = await pool.query(
            `SELECT * FROM transactions
             ORDER BY timestamp DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.json({
            transactions: result.rows,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/transactions/item/:code  (TC-68 — per-item history)
app.get('/api/transactions/item/:code', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM transactions
             WHERE inventory_code = $1
             ORDER BY timestamp DESC`,
            [req.params.code]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================
// REAL-TIME: Server-Sent Events  (TC-40)
// ============================================================
app.get('/api/events', requireAuth, (req, res) => {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    const client = { id: Date.now(), res };
    sseClients.push(client);

    // Initial heartbeat
    res.write('event: connected\ndata: {"status":"connected"}\n\n');

    // Heartbeat every 30 s to keep the connection alive
    const heartbeat = setInterval(() => {
        try { res.write(':keep-alive\n\n'); } catch (_) {}
    }, 30000);

    req.on('close', () => {
        clearInterval(heartbeat);
        const idx = sseClients.findIndex(c => c.id === client.id);
        if (idx !== -1) sseClients.splice(idx, 1);
    });
});

// ============================================================
// SPA FALLBACK — serve index.html for all non-API routes
// ============================================================
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
    console.log(`\n🚀  StockSense v2.0 running at http://localhost:${PORT}`);
    console.log(`   Admin login : admin / admin`);
    console.log(`   Staff login : staff / staff\n`);
});
