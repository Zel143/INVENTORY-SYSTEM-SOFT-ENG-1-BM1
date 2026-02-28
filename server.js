// ======================================
// STOCKSENSE - POSTGRESQL BACKEND SERVER
// Express API with Role-Based Access Control
// ======================================

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================
// DATABASE — PostgreSQL Connection Pool
// ======================================
const pool = new Pool({
    host:     process.env.PG_HOST     || 'localhost',
    port:     parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stocksense',
    user:     process.env.PG_USER     || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

// Helper — run a query and return all rows
async function query(text, params) {
    const result = await pool.query(text, params);
    return result.rows;
}

// Helper — run a query and return the first row (or null)
async function queryOne(text, params) {
    const result = await pool.query(text, params);
    return result.rows[0] || null;
}

// Verify connection on startup
pool.connect()
    .then(client => {
        console.log('✅ PostgreSQL connected:', process.env.PG_DATABASE || 'stocksense');
        client.release();
    })
    .catch(err => {
        console.error('❌ PostgreSQL connection failed:', err.message);
        console.error('   Ensure PostgreSQL is running and run: node init-database.js');
        process.exit(1);
    });

// ======================================
// SSE — Real-Time Broadcast to connected dashboards
// ======================================
const sseClients = new Set();

function broadcast(type, payload = {}) {
    if (sseClients.size === 0) return;
    const data = `data: ${JSON.stringify({ type, ...payload })}\n\n`;
    sseClients.forEach(res => {
        try { res.write(data); } catch { sseClients.delete(res); }
    });
}

// ======================================
// MIDDLEWARE
// ======================================

// Allow requests from the built-in server (same-origin) and both forms of
// VS Code Live Server (127.0.0.1:5500 and localhost:5500)
const ALLOWED_ORIGINS = new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
]);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (same-origin / curl / Postman)
        if (!origin || ALLOWED_ORIGINS.has(origin)) {
            callback(null, origin || true);
        } else {
            callback(new Error(`CORS: origin not allowed — ${origin}`));
        }
    },
    credentials: true
}));
app.use(express.json());
app.use(express.static(__dirname)); // Serve HTML files

// Failed login attempt tracking (UAT ID 20)
const loginAttempts = new Map(); // Format: { username: { count, lastAttempt } }
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

// Session management (UAT ID 17: 2-hour session expiration)
app.use(session({
    secret: 'stocksense-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,   // http is fine for local dev
        httpOnly: true,
        sameSite: 'none', // allow cross-origin requests (e.g. Live Server on 5500 → API on 3000)
        maxAge: 2 * 60 * 60 * 1000 // 2 hours (UAT ID 17)
    }
}));

// ======================================
// AUTHENTICATION MIDDLEWARE
// ======================================
function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// ======================================
// SSE ENDPOINT — subscribe to real-time inventory events
// ======================================
app.get('/api/events', requireAuth, (req, res) => {
    res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
});

// ======================================
// AUTHENTICATION ROUTES
// ======================================

// POST /api/login - User login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Check for account lockout (UAT ID 20)
        const attempts = loginAttempts.get(username);
        if (attempts) {
            const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
            if (attempts.count >= MAX_LOGIN_ATTEMPTS && timeSinceLastAttempt < LOCKOUT_DURATION) {
                const remainingTime = Math.ceil((LOCKOUT_DURATION - timeSinceLastAttempt) / 60000);
                return res.status(429).json({ 
                    error: `Account locked. Too many failed attempts. Try again in ${remainingTime} minutes.` 
                });
            }
            // Reset if lockout period expired
            if (timeSinceLastAttempt >= LOCKOUT_DURATION) {
                loginAttempts.delete(username);
            }
        }

        const user = await queryOne(
            'SELECT * FROM users WHERE username = $1 AND password_hash = $2',
            [username, password]
        );

        if (!user) {
            // Increment failed attempt counter (UAT ID 20)
            const currentAttempts = loginAttempts.get(username) || { count: 0, lastAttempt: 0 };
            loginAttempts.set(username, {
                count: currentAttempts.count + 1,
                lastAttempt: Date.now()
            });
            
            const attemptsLeft = MAX_LOGIN_ATTEMPTS - (currentAttempts.count + 1);
            if (attemptsLeft > 0) {
                return res.status(401).json({ 
                    error: `Invalid credentials. ${attemptsLeft} attempts remaining.` 
                });
            } else {
                return res.status(429).json({ 
                    error: 'Account locked. Too many failed attempts. Try again in 15 minutes.' 
                });
            }
        }

        // Clear failed attempts on successful login
        loginAttempts.delete(username);

        await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        // Set session with login timestamp (UAT ID 17)
        req.session.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            display_name: user.display_name,
            loginTime: Date.now()
        };

        res.json({ 
            success: true, 
            user: req.session.user
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// POST /api/logout - User logout
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true });
    });
});

// POST /api/register - Register a new staff account
app.post('/api/register', async (req, res) => {
    try {
        const { full_name, email, password } = req.body;

        if (!full_name || !email || !password) {
            return res.status(400).json({ error: 'Full name, email, and password are required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        // Derive a username from the email (part before @)
        const username = email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase();

        const existing = await queryOne(
            'SELECT id FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );
        if (existing) {
            return res.status(400).json({ error: 'An account with that email or username already exists' });
        }

        const id = uuidv4();
        await pool.query(
            `INSERT INTO users (id, email, username, password_hash, role, display_name)
             VALUES ($1, $2, $3, $4, 'staff', $5)`,
            [id, email, username, password, full_name]
        );

        res.json({ success: true, username });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// GET /api/session - Check session status
app.get('/api/session', (req, res) => {
    if (req.session.user) {
        res.json({ 
            authenticated: true, 
            user: req.session.user 
        });
    } else {
        res.json({ authenticated: false });
    }
});

// ======================================
// INVENTORY ROUTES
// ======================================

// GET /api/inventory - Get all inventory items
app.get('/api/inventory', requireAuth, async (req, res) => {
    try {
        const items = await query('SELECT * FROM inventory ORDER BY code');
        res.json(items);
    } catch (error) {
        console.error('Get inventory error:', error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

// GET /api/inventory/:code - Get single item
app.get('/api/inventory/:code', requireAuth, async (req, res) => {
    try {
        const item = await queryOne('SELECT * FROM inventory WHERE code = $1', [req.params.code]);
        if (!item) return res.status(404).json({ error: 'Item not found' });
        res.json(item);
    } catch (error) {
        console.error('Get item error:', error);
        res.status(500).json({ error: 'Failed to fetch item' });
    }
});

// GET /api/inventory/low-stock - Get low stock items
app.get('/api/low-stock', requireAuth, async (req, res) => {
    try {
        const items = await query(
            'SELECT * FROM inventory WHERE current_stock <= min_threshold ORDER BY code'
        );
        res.json(items);
    } catch (error) {
        console.error('Get low stock error:', error);
        res.status(500).json({ error: 'Failed to fetch low stock items' });
    }
});

// POST /api/inventory - Create new item (Admin only)
app.post('/api/inventory', requireAdmin, async (req, res) => {
    try {
        const { code, description, vendor, current_stock, allocated_stock, min_threshold,
                max_ceiling, date_delivered, warranty_start, warranty_end, storage_location,
                image } = req.body;

        if (!code || !description) {
            return res.status(400).json({ error: 'Code and description required' });
        }

        // Warranty date order validation
        if (warranty_start && warranty_end && warranty_end < warranty_start) {
            return res.status(400).json({ error: 'Warranty end date must be after warranty start date' });
        }

        await pool.query(
            `INSERT INTO inventory (code, description, vendor, current_stock, allocated_stock,
                                   min_threshold, max_ceiling, date_delivered, warranty_start,
                                   warranty_end, storage_location, image)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [code, description, vendor || null,
             current_stock || 0, allocated_stock || 0,
             min_threshold || 5, max_ceiling || 20,
             date_delivered || null, warranty_start || null,
             warranty_end || null, storage_location || null, image || null]
        );

        broadcast('inventory:added', { code });
        res.json({ success: true, code });
    } catch (error) {
        if (error.code === '23505') { // PostgreSQL unique_violation
            return res.status(400).json({ error: `Item code "${req.body.code}" already exists.` });
        }
        console.error('Create item error:', error);
        res.status(500).json({ error: 'Failed to create item' });
    }
});

// PUT /api/inventory/:code - Update stock levels
app.put('/api/inventory/:code', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const { code } = req.params;
        const { transaction_type, destination, purpose } = req.body;
        const user = req.session.user;

        // ── Guardrail 1: quantity must be a finite, non-zero number ──────────
        const quantity_change = Number(req.body.quantity_change);
        if (!Number.isFinite(quantity_change) || quantity_change === 0) {
            client.release();
            return res.status(400).json({ error: 'Quantity must be a non-zero number' });
        }

        // ── Guardrail 2: destination required for stock-removal operations ───
        const trimmedDestination = (destination || '').trim();
        if (quantity_change < 0 && !trimmedDestination) {
            client.release();
            return res.status(400).json({ error: 'Destination is required for dispatch / stock-removal operations' });
        }
        if (transaction_type === 'dispatch' && !trimmedDestination) {
            client.release();
            return res.status(400).json({ error: 'Destination is required for dispatch' });
        }

        // Lock the row for update (prevents race conditions on concurrent dispatches)
        await client.query('BEGIN');
        const item = (await client.query(
            'SELECT * FROM inventory WHERE code = $1 FOR UPDATE',
            [code]
        )).rows[0];

        if (!item) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Item not found' });
        }

        const previous_stock = item.current_stock;
        const new_stock = previous_stock + quantity_change;

        if (new_stock < 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Insufficient stock' });
        }

        // ======================================
        // ALLOCATION GUARDRAIL - Hard Constraint
        // ======================================
        // Prevent transactions that would breach reserved stock
        // Business Rule: allocated_stock represents parts reserved for
        // Maintenance Agreements (MAs) and cannot be used for walk-in repairs
        if (new_stock < item.allocated_stock) {
            await client.query('ROLLBACK');
            const available_stock = item.current_stock - item.allocated_stock;
            return res.status(400).json({
                error: 'Allocation Breach',
                message: `Transaction Denied: ${item.allocated_stock} units are reserved for Maintenance Agreements. Only ${available_stock} units available for dispatch.`,
                details: {
                    current_stock: item.current_stock,
                    allocated_stock: item.allocated_stock,
                    available_for_use: available_stock,
                    requested_change: quantity_change,
                    would_result_in: new_stock
                }
            });
        }

        // Apply update + write immutable audit record atomically
        await client.query(
            'UPDATE inventory SET current_stock = $1, updated_at = CURRENT_TIMESTAMP WHERE code = $2',
            [new_stock, code]
        );

        const transactionId = uuidv4();
        await client.query(
            `INSERT INTO transactions (id, item_id, item_name, actor_id, actor_name,
                                      quantity_change, previous_stock, new_stock,
                                      transaction_type, destination, purpose)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [transactionId, code, item.description, user.id, user.display_name,
             quantity_change, previous_stock, new_stock, transaction_type,
             trimmedDestination || null, purpose || null]
        );

        await client.query('COMMIT');

        // Push real-time update to all connected dashboard users
        broadcast('inventory:updated', { code, new_stock, previous_stock, quantity_change });
        res.json({ success: true, transactionId, new_stock });

    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Update stock error:', error);
        res.status(500).json({ error: 'Failed to update stock' });
    } finally {
        client.release();
    }
});

// PUT /api/inventory/:code/thresholds - Update thresholds (Admin only)
app.put('/api/inventory/:code/thresholds', requireAdmin, async (req, res) => {
    try {
        const { code } = req.params;
        const { min_threshold, max_ceiling } = req.body;

        if (min_threshold < 0 || max_ceiling < min_threshold) {
            return res.status(400).json({ error: 'Invalid threshold values' });
        }

        await pool.query(
            'UPDATE inventory SET min_threshold = $1, max_ceiling = $2, updated_at = CURRENT_TIMESTAMP WHERE code = $3',
            [min_threshold, max_ceiling, code]
        );

        broadcast('inventory:updated', { code });
        res.json({ success: true });
    } catch (error) {
        console.error('Update thresholds error:', error);
        res.status(500).json({ error: 'Failed to update thresholds' });
    }
});

// ======================================
// TRANSACTION ROUTES
// ======================================

// GET /api/transactions - Get transaction history (Admin only)
app.get('/api/transactions', requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const transactions = await query(
            `SELECT t.*, u.display_name as actor_name
             FROM transactions t
             LEFT JOIN users u ON t.actor_id = u.id
             ORDER BY t.timestamp DESC
             LIMIT $1`,
            [limit]
        );
        res.json(transactions);
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// GET /api/transactions/item/:code - Get item transaction history
app.get('/api/transactions/item/:code', requireAuth, async (req, res) => {
    try {
        const transactions = await query(
            `SELECT t.*, u.display_name as actor_name
             FROM transactions t
             LEFT JOIN users u ON t.actor_id = u.id
             WHERE t.item_id = $1
             ORDER BY t.timestamp DESC`,
            [req.params.code]
        );
        res.json(transactions);
    } catch (error) {
        console.error('Get item transactions error:', error);
        res.status(500).json({ error: 'Failed to fetch item transactions' });
    }
});

// ======================================
// ALLOCATION LOGS ROUTES (Admin only)
// ======================================

// GET /api/allocations - Get all allocation logs
app.get('/api/allocations', requireAdmin, async (req, res) => {
    try {
        const allocations = await query('SELECT * FROM allocation_logs ORDER BY requested_at DESC');
        res.json(allocations);
    } catch (error) {
        console.error('Get allocations error:', error);
        res.status(500).json({ error: 'Failed to fetch allocations' });
    }
});

// POST /api/allocations - Create allocation request
app.post('/api/allocations', requireAuth, async (req, res) => {
    try {
        const { item_id, quantity_allocated, destination, purpose } = req.body;
        const user = req.session.user;

        const item = await queryOne('SELECT * FROM inventory WHERE code = $1', [item_id]);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        const id = uuidv4();
        const request_id = `MA-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`;

        await pool.query(
            `INSERT INTO allocation_logs (id, request_id, item_id, item_name, requested_by,
                                         quantity_allocated, destination, purpose, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
            [id, request_id, item_id, item.description, user.id,
             quantity_allocated, destination, purpose]
        );

        res.json({ success: true, id, request_id });
    } catch (error) {
        console.error('Create allocation error:', error);
        res.status(500).json({ error: 'Failed to create allocation' });
    }
});

// ======================================
// STATISTICS ROUTES
// ======================================

// GET /api/stats - Get dashboard statistics
app.get('/api/stats', requireAuth, async (req, res) => {
    try {
        const [totals, lowStock, totalStock, recentTx] = await Promise.all([
            queryOne('SELECT COUNT(*)::int AS count FROM inventory'),
            queryOne('SELECT COUNT(*)::int AS count FROM inventory WHERE current_stock <= min_threshold'),
            queryOne('SELECT COALESCE(SUM(current_stock), 0)::int AS total FROM inventory'),
            queryOne(`SELECT COUNT(*)::int AS count FROM transactions WHERE timestamp > NOW() - INTERVAL '7 days'`),
        ]);

        res.json({
            total_items:         totals.count,
            low_stock_count:     lowStock.count,
            total_stock:         totalStock.total,
            recent_transactions: recentTx.count,
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// PATCH /api/inventory/:code — Edit item details (Admin only)
app.patch('/api/inventory/:code', requireAdmin, async (req, res) => {
    try {
        const { code } = req.params;
        const { description, vendor, min_threshold, max_ceiling, warranty_end, date_delivered, storage_location } = req.body;

        if (min_threshold !== undefined && max_ceiling !== undefined &&
            Number(max_ceiling) < Number(min_threshold)) {
            return res.status(400).json({ error: 'Max ceiling must be >= min threshold' });
        }

        const fields = [];
        const values = [];
        let idx = 1;

        if (description   !== undefined) { fields.push(`description = $${idx++}`);       values.push(description); }
        if (vendor        !== undefined) { fields.push(`vendor = $${idx++}`);             values.push(vendor || null); }
        if (min_threshold !== undefined) { fields.push(`min_threshold = $${idx++}`);      values.push(Number(min_threshold)); }
        if (max_ceiling   !== undefined) { fields.push(`max_ceiling = $${idx++}`);        values.push(Number(max_ceiling)); }
        if (warranty_end  !== undefined) { fields.push(`warranty_end = $${idx++}`);       values.push(warranty_end || null); }
        if (date_delivered!== undefined) { fields.push(`date_delivered = $${idx++}`);     values.push(date_delivered || null); }
        if (storage_location!==undefined){ fields.push(`storage_location = $${idx++}`);   values.push(storage_location || null); }

        if (!fields.length) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(code);

        const result = await pool.query(
            `UPDATE inventory SET ${fields.join(', ')} WHERE code = $${idx}`,
            values
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }

        broadcast('inventory:updated', { code });
        res.json({ success: true });
    } catch (error) {
        console.error('Edit item error:', error);
        res.status(500).json({ error: 'Failed to update item' });
    }
});

// DELETE /api/inventory/:code — Remove item (Admin only)
app.delete('/api/inventory/:code', requireAdmin, async (req, res) => {
    try {
        const { code } = req.params;
        const result = await pool.query('DELETE FROM inventory WHERE code = $1', [code]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }
        broadcast('inventory:updated', { code });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete item error:', error);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// ======================================
// ERROR HANDLING
// ======================================
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ======================================
// START SERVER
// ======================================
app.listen(PORT, () => {
    console.log(`
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551   \uD83C\uDFED StockSense Server Running             \u2551
\u2551                                            \u2551
\u2551   URL:      http://localhost:${PORT}         \u2551
\u2551   Database: PostgreSQL (stocksense)          \u2551
\u2551                                            \u2551
\u2551   Endpoints:                                \u2551
\u2551   \u2022 POST /api/login                        \u2551
\u2551   \u2022 GET  /api/inventory                    \u2551
\u2551   \u2022 GET  /api/low-stock                    \u2551
\u2551   \u2022 GET  /api/transactions  (admin)         \u2551
\u2551   \u2022 GET  /api/events        (SSE)           \u2551
\u2551                                            \u2551
\u2551   Press Ctrl+C to stop                     \u2551
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
    `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\uD83D\uDED1 Shutting down server...');
    await pool.end();
    process.exit(0);
});
