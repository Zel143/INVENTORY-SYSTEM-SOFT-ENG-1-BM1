// ======================================
// STOCKSENSE - SQLITE BACKEND SERVER
// Express API with Role-Based Access Control
// ======================================

const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ======================================
// DATABASE INITIALIZATION
// ======================================
const dbPath = path.join(__dirname, 'stocksense.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

console.log('✅ Database connected:', dbPath);

// ======================================
// MIDDLEWARE
// ======================================
app.use(cors({
    origin: 'http://127.0.0.1:5500', // Allow VS Code Live Server
    credentials: true
}));
app.use(express.json());
app.use(express.static(__dirname)); // Serve HTML files

// Session management
app.use(session({
    secret: 'stocksense-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
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
// AUTHENTICATION ROUTES
// ======================================

// POST /api/login - User login
app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Query user (in production, use proper password hashing)
        const user = db.prepare('SELECT * FROM users WHERE username = ? AND password_hash = ?')
            .get(username, password);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?')
            .run(user.id);

        // Set session
        req.session.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            display_name: user.display_name
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
app.get('/api/inventory', requireAuth, (req, res) => {
    try {
        const items = db.prepare('SELECT * FROM inventory ORDER BY code').all();
        res.json(items);
    } catch (error) {
        console.error('Get inventory error:', error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

// GET /api/inventory/:code - Get single item
app.get('/api/inventory/:code', requireAuth, (req, res) => {
    try {
        const item = db.prepare('SELECT * FROM inventory WHERE code = ?').get(req.params.code);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        res.json(item);
    } catch (error) {
        console.error('Get item error:', error);
        res.status(500).json({ error: 'Failed to fetch item' });
    }
});

// GET /api/inventory/low-stock - Get low stock items
app.get('/api/low-stock', requireAuth, (req, res) => {
    try {
        const items = db.prepare('SELECT * FROM low_stock_items').all();
        res.json(items);
    } catch (error) {
        console.error('Get low stock error:', error);
        res.status(500).json({ error: 'Failed to fetch low stock items' });
    }
});

// POST /api/inventory - Create new item (Admin only)
app.post('/api/inventory', requireAdmin, (req, res) => {
    try {
        const { code, description, vendor, current_stock, min_threshold, max_ceiling, 
                date_delivered, warranty_start, warranty_end, storage_location, image } = req.body;

        if (!code || !description) {
            return res.status(400).json({ error: 'Code and description required' });
        }

        const stmt = db.prepare(`
            INSERT INTO inventory (code, description, vendor, current_stock, allocated_stock, 
                                  min_threshold, max_ceiling, date_delivered, warranty_start, 
                                  warranty_end, storage_location, image)
            VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(code, description, vendor, current_stock || 0, min_threshold || 5, 
                max_ceiling || 20, date_delivered, warranty_start, warranty_end, 
                storage_location, image);

        res.json({ success: true, code });
    } catch (error) {
        console.error('Create item error:', error);
        res.status(500).json({ error: 'Failed to create item' });
    }
});

// PUT /api/inventory/:code - Update stock levels
app.put('/api/inventory/:code', requireAuth, (req, res) => {
    try {
        const { code } = req.params;
        const { quantity_change, transaction_type, destination, purpose } = req.body;
        const user = req.session.user;

        // Get current item
        const item = db.prepare('SELECT * FROM inventory WHERE code = ?').get(code);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        const previous_stock = item.current_stock;
        const new_stock = previous_stock + quantity_change;

        // Validate stock levels
        if (new_stock < 0) {
            return res.status(400).json({ error: 'Insufficient stock' });
        }

        // Start transaction
        const updateInventory = db.transaction(() => {
            // Update inventory
            db.prepare('UPDATE inventory SET current_stock = ? WHERE code = ?')
                .run(new_stock, code);

            // Create transaction log
            const transactionId = uuidv4();
            db.prepare(`
                INSERT INTO transactions (id, item_id, item_name, actor_id, actor_name, 
                                         quantity_change, previous_stock, new_stock, 
                                         transaction_type, destination, purpose)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(transactionId, code, item.description, user.id, user.display_name,
                   quantity_change, previous_stock, new_stock, transaction_type, 
                   destination, purpose);

            return { transactionId, new_stock };
        });

        const result = updateInventory();
        res.json({ success: true, ...result });

    } catch (error) {
        console.error('Update stock error:', error);
        res.status(500).json({ error: 'Failed to update stock' });
    }
});

// PUT /api/inventory/:code/thresholds - Update thresholds (Admin only)
app.put('/api/inventory/:code/thresholds', requireAdmin, (req, res) => {
    try {
        const { code } = req.params;
        const { min_threshold, max_ceiling } = req.body;

        if (min_threshold < 0 || max_ceiling < min_threshold) {
            return res.status(400).json({ error: 'Invalid threshold values' });
        }

        db.prepare('UPDATE inventory SET min_threshold = ?, max_ceiling = ? WHERE code = ?')
            .run(min_threshold, max_ceiling, code);

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
app.get('/api/transactions', requireAdmin, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const transactions = db.prepare(`
            SELECT * FROM recent_transactions 
            ORDER BY timestamp DESC 
            LIMIT ?
        `).all(limit);

        res.json(transactions);
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// GET /api/transactions/item/:code - Get item transaction history
app.get('/api/transactions/item/:code', requireAuth, (req, res) => {
    try {
        const transactions = db.prepare(`
            SELECT t.*, u.display_name as actor_name
            FROM transactions t
            LEFT JOIN users u ON t.actor_id = u.id
            WHERE t.item_id = ?
            ORDER BY t.timestamp DESC
        `).all(req.params.code);

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
app.get('/api/allocations', requireAdmin, (req, res) => {
    try {
        const allocations = db.prepare('SELECT * FROM allocation_logs ORDER BY requested_at DESC').all();
        res.json(allocations);
    } catch (error) {
        console.error('Get allocations error:', error);
        res.status(500).json({ error: 'Failed to fetch allocations' });
    }
});

// POST /api/allocations - Create allocation request
app.post('/api/allocations', requireAuth, (req, res) => {
    try {
        const { item_id, quantity_allocated, destination, purpose } = req.body;
        const user = req.session.user;

        // Get item
        const item = db.prepare('SELECT * FROM inventory WHERE code = ?').get(item_id);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        const id = uuidv4();
        const request_id = `MA-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`;

        db.prepare(`
            INSERT INTO allocation_logs (id, request_id, item_id, item_name, requested_by, 
                                        quantity_allocated, destination, purpose, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(id, request_id, item_id, item.description, user.id, quantity_allocated, 
               destination, purpose);

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
app.get('/api/stats', requireAuth, (req, res) => {
    try {
        const stats = {
            total_items: db.prepare('SELECT COUNT(*) as count FROM inventory').get().count,
            low_stock_count: db.prepare('SELECT COUNT(*) as count FROM low_stock_items').get().count,
            total_stock: db.prepare('SELECT SUM(current_stock) as total FROM inventory').get().total,
            recent_transactions: db.prepare('SELECT COUNT(*) as count FROM transactions WHERE timestamp > datetime("now", "-7 days")').get().count
        };

        res.json(stats);
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
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
╔════════════════════════════════════════════╗
║   🏭 StockSense Server Running             ║
║                                            ║
║   URL: http://localhost:${PORT}            ║
║   Database: ${dbPath.split(path.sep).pop().padEnd(28)}║
║                                            ║
║   API Endpoints:                           ║
║   • POST /api/login                        ║
║   • GET  /api/inventory                    ║
║   • GET  /api/low-stock                    ║
║   • GET  /api/transactions (admin)         ║
║                                            ║
║   Press Ctrl+C to stop                     ║
╚════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    db.close();
    process.exit(0);
});
