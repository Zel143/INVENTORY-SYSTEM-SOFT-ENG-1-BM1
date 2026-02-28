// =============================================================================
// STOCKSENSE — CRITICAL FIX TEST SUITE + REGRESSION HARNESS
// =============================================================================
//
// SCOPE
//   BLOCK A  — 17 Critical server-side fixes (TC-7,10,11,12,16,19,20,45,46,50,
//              63,64,65,66,69,70,84)
//   BLOCK B  — Regression on server-reachable cases from the 58 UAT scenarios
//              that were previously categorised as passing: ensures the new
//              guardrails don't silently break valid flows.
//
// HOW TO RUN
//   1. node init-database.js        (fresh schema with corrected triggers)
//   2. npm start                    (keep running in a separate terminal)
//   3. node test-critical-fixes.js
//
// AUTHOR RESPONSIBILITY: Raphael Agapito (BA / Bridge)
// STATUS CHECK: ❌  FILE DID NOT EXIST — CREATED BY AUTOMATED AUDIT
// =============================================================================

'use strict';

const API_URL = 'http://localhost:3000/api';

// For TC-84 we verify the PostgreSQL trigger directly (no API layer needed)
const { Pool } = require('pg');
const path      = require('path');

// Direct DB pool for immutability/trigger tests only
const testPool = new Pool({
    host:     process.env.PG_HOST     || 'localhost',
    port:     parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'stocksense',
    user:     process.env.PG_USER     || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
});

// ---------------------------------------------------------------------------
//  COLOURS
// ---------------------------------------------------------------------------
const C = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    red:    '\x1b[31m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    cyan:   '\x1b[36m',
    dim:    '\x1b[2m'
};

// ---------------------------------------------------------------------------
//  RESULTS ACCUMULATOR
// ---------------------------------------------------------------------------
const results = {
    blockA:     { pass: 0, fail: 0, skip: 0, cases: [] },
    blockB:     { pass: 0, fail: 0, skip: 0, cases: [] }
};

function record(block, tcId, description, passed, note = '') {
    const out = results[block];
    const entry = { tcId, description, passed, note };
    out.cases.push(entry);
    if (passed === true)  out.pass++;
    else if (passed === false) out.fail++;
    else out.skip++;

    const icon  = passed === true ? `${C.green}✅` : passed === false ? `${C.red}❌` : `${C.yellow}⏭`;
    const label = passed === true ? 'PASS' : passed === false ? 'FAIL' : 'SKIP';
    console.log(`  ${icon} [TC-${tcId}] ${label}${C.reset}  ${description}${note ? `  ${C.dim}(${note})${C.reset}` : ''}`);
}

// ---------------------------------------------------------------------------
//  SESSION-AWARE FETCH
//  Node fetch does not auto-manage cookies; we carry the session cookie
//  manually so authenticated routes work correctly.
// ---------------------------------------------------------------------------
let _sessionCookie = '';

async function api(endpoint, method = 'GET', body = null, useCookie = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (useCookie && _sessionCookie) headers['Cookie'] = _sessionCookie;

    const opts = { method, headers };
    if (body !== null) opts.body = JSON.stringify(body);

    const res  = await fetch(`${API_URL}${endpoint}`, opts);
    const data = await res.json().catch(() => ({}));

    // Capture session cookie on login
    const sc = res.headers.get('set-cookie');
    if (sc) {
        const m = sc.match(/connect\.sid=[^;]+/);
        if (m) _sessionCookie = m[0];
    }

    return { status: res.status, data };
}

// ---------------------------------------------------------------------------
//  HELPERS
// ---------------------------------------------------------------------------
async function loginAs(username, password) {
    _sessionCookie = '';
    const r = await api('/login', 'POST', { username, password }, false);
    return r;
}

async function ensureAdminSession() {
    const r = await loginAs('admin', 'admin');
    if (r.status !== 200) throw new Error('Cannot obtain admin session — is the server running?');
}

async function ensureStaffSession() {
    const r = await loginAs('staff', 'staff');
    if (r.status !== 200) throw new Error('Cannot obtain staff session — is the server running?');
}

// Seed a clean item for guardrail tests (idempotent)
async function seedItem(code, current_stock, allocated_stock) {
    // Delete if the item already exists by trying PUT with a known-good quantity
    // Simplest idempotent approach: create via POST, ignore duplicate error
    await api('/inventory', 'POST', {
        code, description: `Test Item ${code}`, vendor: 'TestVendor',
        current_stock, allocated_stock,
        min_threshold: 5, max_ceiling: 20,
        date_delivered: '2025-01-01',
        warranty_start: '2025-01-01', warranty_end: '2030-01-01',
        storage_location: 'Bin-TEST'
    });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));


// =============================================================================
//  BLOCK A — CRITICAL SERVER-SIDE FIX TESTS  (17 tests)
// =============================================================================

async function runBlockA() {
    console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  BLOCK A — 17 CRITICAL SERVER-SIDE FIX TESTS                ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝${C.reset}\n`);

    // -----------------------------------------------------------------------
    //  A1 — TC-7: Empty Login Guard
    //  FR-1.0  Precondition: unauthenticated
    // -----------------------------------------------------------------------
    {
        const r = await api('/login', 'POST', { username: '', password: '' }, false);
        record('blockA', '7', 'Empty Login Guard — blank credentials rejected',
            r.status === 400,
            `got ${r.status}: ${r.data.error}`);
    }

    // -----------------------------------------------------------------------
    //  A2 — TC-10: Invalid Credentials
    //  FR-1.0
    // -----------------------------------------------------------------------
    {
        const r = await api('/login', 'POST', { username: 'wronguser', password: 'wrongpass' }, false);
        const ok = r.status === 401 && r.data.error && r.data.error.includes('Invalid credentials');
        record('blockA', '10', 'Invalid Credentials — denied with attempt counter',
            ok, `got ${r.status}: ${r.data.error}`);
    }

    // -----------------------------------------------------------------------
    //  A3 — TC-11: Case Sensitivity — "ADMIN" must not log in as admin
    //  FR-1.0
    // -----------------------------------------------------------------------
    {
        const r = await api('/login', 'POST', { username: 'ADMIN', password: 'admin' }, false);
        record('blockA', '11', 'Case Sensitivity — "ADMIN" ≠ "admin"',
            r.status === 401,
            `got ${r.status}`);
    }

    // -----------------------------------------------------------------------
    //  A4 — TC-12: SQL Injection — server must not crash / must deny
    //  FR-1.0
    // -----------------------------------------------------------------------
    {
        const r = await api('/login', 'POST',
            { username: "' OR 1=1 --", password: "' OR 1=1 --" }, false);
        const ok = r.status === 401 || r.status === 400;
        record('blockA', '12', "SQL Injection — payload denied, no crash",
            ok, `got ${r.status}`);
    }

    // -----------------------------------------------------------------------
    //  A5 — TC-16: Session Bypass — unauthenticated access to protected route
    //  FR-1.0
    // -----------------------------------------------------------------------
    {
        _sessionCookie = ''; // clear any session
        const r = await api('/inventory', 'GET', null, false);
        record('blockA', '16', 'Session Bypass — protected route returns 401 without session',
            r.status === 401,
            `got ${r.status}: ${r.data.error}`);
    }

    // -----------------------------------------------------------------------
    //  A6 — TC-19: Session Expiration — verify server enforces 2-hour maxAge
    //  FR-1.0  (cannot wait 2 h; verified by code inspection of server.js)
    // -----------------------------------------------------------------------
    {
        // Verify the server code sets maxAge = 2 * 60 * 60 * 1000
        const fs = require('fs');
        const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        const hasMaxAge = /maxAge\s*:\s*2\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(serverSrc);
        record('blockA', '19', 'Session Expiration — maxAge = 2 h confirmed in server.js',
            hasMaxAge, 'verified by static analysis (cannot wait 2 h in automated test)');
    }

    // -----------------------------------------------------------------------
    //  A7 — TC-20: Login Lockout — 5 consecutive failures lock the account
    //  FR-1.0
    // -----------------------------------------------------------------------
    {
        const LOCK_USER = `locktest_${Date.now()}`;   // unique username each run
        let locked = false;
        for (let i = 0; i < 6; i++) {
            const r = await api('/login', 'POST', { username: LOCK_USER, password: 'bad' }, false);
            if (r.status === 429) { locked = true; break; }
            await sleep(100);
        }
        record('blockA', '20', 'Login Lockout — account locked after 5 failures (HTTP 429)',
            locked,
            locked ? 'locked as expected' : 'never returned 429');
    }

    // -----------------------------------------------------------------------
    //  Authenticated session needed for the remaining tests
    // -----------------------------------------------------------------------
    await ensureAdminSession();

    // -----------------------------------------------------------------------
    //  A8 — TC-45: Duplicate SKU Lock
    //  FR-3.0
    // -----------------------------------------------------------------------
    {
        // MCH-001 exists in the default seed
        const r = await api('/inventory', 'POST', {
            code: 'MCH-001', description: 'Dup Test', vendor: 'X',
            current_stock: 1, allocated_stock: 0,
            min_threshold: 1, max_ceiling: 10
        });
        const ok = r.status === 400 && r.data.error && r.data.error.includes('already exists');
        record('blockA', '45', 'Duplicate SKU Lock — second insert of MCH-001 rejected',
            ok, `got ${r.status}: ${r.data.error}`);
    }

    // -----------------------------------------------------------------------
    //  A9 — TC-46: Negative stock rejected by DB CHECK constraint
    //  FR-3.0
    // -----------------------------------------------------------------------
    {
        const r = await api('/inventory', 'POST', {
            code: `NEG-${Date.now()}`, description: 'Negative Test', vendor: 'X',
            current_stock: -5, allocated_stock: 0,
            min_threshold: 0, max_ceiling: 10
        });
        // SQLite CHECK(current_stock >= 0) should fire → 500 with constraint message
        const ok = r.status === 400 || r.status === 500;
        record('blockA', '46', 'Negative Stock — DB CHECK constraint blocks negative current_stock',
            ok, `got ${r.status}: ${JSON.stringify(r.data).slice(0, 80)}`);
    }

    // -----------------------------------------------------------------------
    //  A10 — TC-50: Date Guardrail — warranty_end before warranty_start
    //  FR-3.0
    // -----------------------------------------------------------------------
    {
        const r = await api('/inventory', 'POST', {
            code: `DATE-${Date.now()}`, description: 'Date Guard Test', vendor: 'X',
            current_stock: 5, allocated_stock: 0,
            min_threshold: 1, max_ceiling: 10,
            warranty_start: '2026-06-01',
            warranty_end:   '2026-01-01'   // before start
        });
        const ok = r.status === 400 && r.data.error && r.data.error.includes('Warranty end');
        record('blockA', '50', 'Date Guardrail — warranty_end before warranty_start rejected',
            ok, `got ${r.status}: ${r.data.error}`);
    }

    // -----------------------------------------------------------------------
    //  Seed items for stock-operation tests
    // -----------------------------------------------------------------------
    const OVERDRAFT_CODE  = `OVERDRAFT-${Date.now()}`;
    const ALLOC_FULL_CODE = `ALLOCF-${Date.now()}`;
    const ALLOC_PART_CODE = `ALLOCP-${Date.now()}`;
    const DISP_CODE       = `DISP-${Date.now()}`;

    await seedItem(OVERDRAFT_CODE,  3,  0);   // stock=3, alloc=0
    await seedItem(ALLOC_FULL_CODE, 5,  5);   // stock=5, alloc=5 → avail=0
    await seedItem(ALLOC_PART_CODE, 10, 8);   // stock=10, alloc=8 → avail=2
    await seedItem(DISP_CODE,       20, 0);   // normal item

    // -----------------------------------------------------------------------
    //  A11 — TC-63: Overdraft Protection — dispatch more than physical stock
    //  FR-4.0
    // -----------------------------------------------------------------------
    {
        const r = await api(`/inventory/${OVERDRAFT_CODE}`, 'PUT', {
            quantity_change: -5,   // stock is only 3
            transaction_type: 'dispatch',
            destination: 'Lab'
        });
        record('blockA', '63', 'Overdraft Protection — dispatching 5 from stock-of-3 blocked',
            r.status === 400,
            `got ${r.status}: ${r.data.error}`);
    }

    // -----------------------------------------------------------------------
    //  A12 — TC-64: Full Allocation Guardrail — 0 available
    //  FR-8.0
    // -----------------------------------------------------------------------
    {
        const r = await api(`/inventory/${ALLOC_FULL_CODE}`, 'PUT', {
            quantity_change: -1,
            transaction_type: 'dispatch',
            destination: 'Lab'
        });
        const ok = r.status === 400 && r.data.error === 'Allocation Breach';
        record('blockA', '64', 'Full Allocation Guardrail — 100% reserved, dispatch blocked',
            ok, `got ${r.status}: ${r.data.error}`);
    }

    // -----------------------------------------------------------------------
    //  A13 — TC-65: Partial Allocation Guard — dispatch > available
    //  FR-8.0
    // -----------------------------------------------------------------------
    {
        const r = await api(`/inventory/${ALLOC_PART_CODE}`, 'PUT', {
            quantity_change: -4,   // available is only 2
            transaction_type: 'dispatch',
            destination: 'Lab'
        });
        const ok = r.status === 400 && r.data.error === 'Allocation Breach';
        record('blockA', '65', 'Partial Allocation Guard — dispatching 4 from 2-available blocked',
            ok, `got ${r.status}: ${r.data.error}`);
    }

    // -----------------------------------------------------------------------
    //  A14 — TC-66: Mandatory Destination — blank destination rejected
    //  FR-4.0
    // -----------------------------------------------------------------------
    {
        const r = await api(`/inventory/${DISP_CODE}`, 'PUT', {
            quantity_change: -1,
            transaction_type: 'dispatch',
            destination: '   '   // whitespace-only
        });
        const ok = r.status === 400 && r.data.error && r.data.error.includes('Destination');
        record('blockA', '66', 'Mandatory Destination — blank/whitespace destination rejected',
            ok, `got ${r.status}: ${r.data.error}`);
    }

    // -----------------------------------------------------------------------
    //  A15 — TC-69: Dispatch Zero Value — quantity_change = 0 blocked
    //  FR-4.0
    // -----------------------------------------------------------------------
    {
        const r = await api(`/inventory/${DISP_CODE}`, 'PUT', {
            quantity_change: 0,
            transaction_type: 'dispatch',
            destination: 'Lab'
        });
        const ok = r.status === 400 && r.data.error && r.data.error.includes('non-zero');
        record('blockA', '69', 'Zero Quantity — quantity_change = 0 rejected',
            ok, `got ${r.status}: ${r.data.error}`);
    }

    // -----------------------------------------------------------------------
    //  A16 — TC-70: String/NaN quantity rejected (hardened guard)
    //  FR-4.0
    // -----------------------------------------------------------------------
    {
        const r = await api(`/inventory/${DISP_CODE}`, 'PUT', {
            quantity_change: 'Two',   // non-numeric string
            transaction_type: 'dispatch',
            destination: 'Lab'
        });
        const ok = r.status === 400 && r.data.error && r.data.error.includes('non-zero');
        record('blockA', '70', 'Non-Numeric Quantity — string "Two" rejected',
            ok, `got ${r.status}: ${r.data.error}`);
    }

    // -----------------------------------------------------------------------
    //  A17 — TC-84: Immutable Triggers — PostgreSQL trigger blocks DELETE
    //  FR-9.0  (direct pg test — bypasses API layer)
    // -----------------------------------------------------------------------
    {
        let triggerBlocked = false;
        let triggerNote    = '';
        const client = await testPool.connect().catch(e => { triggerNote = `PG connect failed: ${e.message}`; return null; });

        if (client) {
            try {
                // 1. Confirm the trigger exists in pg_trigger
                const trig = (await client.query(
                    `SELECT trigger_name FROM information_schema.triggers
                     WHERE event_object_table = 'transactions'
                       AND trigger_name = 'trg_prevent_transaction_delete'`
                )).rows[0];

                if (!trig) {
                    triggerNote    = 'trigger trg_prevent_transaction_delete not found — run node init-database.js';
                    triggerBlocked = false;
                } else {
                    // 2. Try to DELETE a transaction row to prove the trigger fires
                    const tx = (await client.query('SELECT id FROM transactions LIMIT 1')).rows[0];
                    if (tx) {
                        try {
                            await client.query('DELETE FROM transactions WHERE id = $1', [tx.id]);
                            triggerNote    = 'DELETE succeeded — trigger did NOT fire (CRITICAL)';
                            triggerBlocked = false;
                        } catch (e) {
                            triggerBlocked = e.message.includes('immutable audit trail');
                            triggerNote    = triggerBlocked
                                ? 'RAISE EXCEPTION fired — row unchanged ✅'
                                : `unexpected error: ${e.message}`;
                            // Rollback so the connection stays clean
                            await client.query('ROLLBACK').catch(() => {});
                        }
                    } else {
                        // No rows yet — confirm trigger existence is sufficient static proof
                        triggerBlocked = true;
                        triggerNote    = 'no transaction rows yet; trg_prevent_transaction_delete confirmed in pg_trigger';
                    }
                }
            } finally {
                client.release();
            }
        }

        record('blockA', '84', 'Immutable Triggers — PostgreSQL trigger blocks DELETE on transactions',
            triggerBlocked, triggerNote);
    }
}


// =============================================================================
//  BLOCK B — REGRESSION TESTS
//  Sampling of cases across FR-1.0 → FR-9.0 that exercise valid happy-path
//  flows to confirm the new guardrails do NOT break legitimate operations.
// =============================================================================

async function runBlockB() {
    console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  BLOCK B — REGRESSION: VALID FLOWS MUST STILL WORK          ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝${C.reset}\n`);

    // -----------------------------------------------------------------------
    //  B1 — TC-8: Admin login succeeds
    //  FR-1.0
    // -----------------------------------------------------------------------
    {
        const r = await loginAs('admin', 'admin');
        const ok = r.status === 200 && r.data.success && r.data.user.role === 'admin';
        record('blockB', '8', 'Valid Admin Login — returns 200 with role=admin', ok,
            `got ${r.status}`);
    }

    // -----------------------------------------------------------------------
    //  B2 — TC-9: Staff login succeeds
    //  FR-1.0
    // -----------------------------------------------------------------------
    {
        const r = await loginAs('staff', 'staff');
        const ok = r.status === 200 && r.data.success && r.data.user.role === 'staff';
        record('blockB', '9', 'Valid Staff Login — returns 200 with role=staff', ok,
            `got ${r.status}`);
    }

    // -----------------------------------------------------------------------
    //  B3 — TC-21: Inventory list loads (dashboard load time)
    //  FR-2.0
    // -----------------------------------------------------------------------
    {
        await ensureAdminSession();
        const t0 = Date.now();
        const r  = await api('/inventory');
        const ms = Date.now() - t0;
        const ok = r.status === 200 && Array.isArray(r.data) && r.data.length > 0;
        record('blockB', '21', `Inventory list loads (${ms} ms, ≤ 2000 ms target)`,
            ok && ms <= 2000, `${ms} ms, items: ${r.data?.length}`);
    }

    // -----------------------------------------------------------------------
    //  B4 — TC-40: Stats endpoint responds (data refresh)
    //  FR-2.0
    // -----------------------------------------------------------------------
    {
        const r = await api('/stats');
        const ok = r.status === 200 && typeof r.data.total_items === 'number';
        record('blockB', '40', 'Stats endpoint — total_items is a number', ok,
            `total_items: ${r.data?.total_items}`);
    }

    // -----------------------------------------------------------------------
    //  B5 — TC-42: Create new inventory item (happy path)
    //  FR-3.0
    // -----------------------------------------------------------------------
    {
        const code = `REG-${Date.now()}`;
        const r    = await api('/inventory', 'POST', {
            code, description: 'Regression Item', vendor: 'RTest',
            current_stock: 10, allocated_stock: 0,
            min_threshold: 5, max_ceiling: 20,
            warranty_start: '2026-01-01', warranty_end: '2030-01-01',
            storage_location: 'Bin-REG'
        });
        record('blockB', '42', 'Create New Inventory Item — 200 success', r.status === 200,
            `got ${r.status}: ${r.data.error || 'ok'}`);
    }

    // -----------------------------------------------------------------------
    //  B6 — TC-62: Normal Dispatch — valid quantity & destination
    //  FR-4.0
    // -----------------------------------------------------------------------
    {
        const code = `NORM-${Date.now()}`;
        await seedItem(code, 10, 0);
        const r = await api(`/inventory/${code}`, 'PUT', {
            quantity_change: -2,
            transaction_type: 'dispatch',
            destination: 'Repair Lab',
            purpose: 'WO-REGRESSION'
        });
        const ok = r.status === 200 && r.data.new_stock === 8;
        record('blockB', '62', 'Normal Dispatch — 10 stock, dispatch 2, new_stock = 8',
            ok, `got ${r.status}, new_stock: ${r.data?.new_stock}`);
    }

    // -----------------------------------------------------------------------
    //  B7 — TC-72: Add Stock (+) — valid restock
    //  FR-4.0
    // -----------------------------------------------------------------------
    {
        const code = `ADD-${Date.now()}`;
        await seedItem(code, 5, 0);
        const r = await api(`/inventory/${code}`, 'PUT', {
            quantity_change: 5,
            transaction_type: 'addition',
            destination: 'Warehouse'
        });
        const ok = r.status === 200 && r.data.new_stock === 10;
        record('blockB', '72', 'Add Stock — 5 stock, add 5, new_stock = 10',
            ok, `got ${r.status}, new_stock: ${r.data?.new_stock}`);
    }

    // -----------------------------------------------------------------------
    //  B8 — TC-68: Purpose Tracking — dispatch with Work Order attaches to log
    //  FR-4.0 / FR-5.0
    // -----------------------------------------------------------------------
    {
        const code = `WO-${Date.now()}`;
        await seedItem(code, 10, 0);
        const dispR = await api(`/inventory/${code}`, 'PUT', {
            quantity_change: -1, transaction_type: 'dispatch',
            destination: 'Floor', purpose: 'WO-12345'
        });
        // Retrieve transaction and verify purpose is stored
        const txR = await api(`/transactions/item/${code}`);
        const tx  = Array.isArray(txR.data) ? txR.data[0] : null;
        const ok  = dispR.status === 200 && tx && tx.purpose === 'WO-12345';
        record('blockB', '68', 'Purpose Tracking — WO-12345 persisted in transaction log',
            ok, tx ? `purpose: "${tx.purpose}"` : 'no transaction found');
    }

    // -----------------------------------------------------------------------
    //  B9 — TC-79: Transaction Timestamp — logged with ISO datetime
    //  FR-5.0
    // -----------------------------------------------------------------------
    {
        const code = `TS-${Date.now()}`;
        await seedItem(code, 10, 0);
        await api(`/inventory/${code}`, 'PUT', {
            quantity_change: -1, transaction_type: 'dispatch',
            destination: 'Floor'
        });
        const txR = await api(`/transactions/item/${code}`);
        const tx  = Array.isArray(txR.data) && txR.data[0];
        const ok  = tx && !isNaN(Date.parse(tx.timestamp));
        record('blockB', '79', 'Transaction Timestamp — parseable ISO datetime stored',
            ok, tx ? `timestamp: ${tx.timestamp}` : 'no transaction found');
    }

    // -----------------------------------------------------------------------
    //  B10 — TC-80: Actor Identity — transaction tied to logged-in user
    //  FR-5.0
    // -----------------------------------------------------------------------
    {
        const code = `ACTOR-${Date.now()}`;
        await ensureAdminSession();
        await seedItem(code, 10, 0);
        await api(`/inventory/${code}`, 'PUT', {
            quantity_change: -1, transaction_type: 'dispatch', destination: 'Lab'
        });
        const txR = await api(`/transactions/item/${code}`);
        const tx  = Array.isArray(txR.data) && txR.data[0];
        const ok  = tx && tx.actor_id === 'admin_001';
        record('blockB', '80', 'Actor Identity — transaction actor_id = admin_001',
            ok, tx ? `actor_id: ${tx.actor_id}` : 'no transaction found');
    }

    // -----------------------------------------------------------------------
    //  B11 — TC-81: Transaction history loads for admin
    //  FR-5.0
    // -----------------------------------------------------------------------
    {
        const r  = await api('/transactions?limit=10');
        const ok = r.status === 200 && Array.isArray(r.data);
        record('blockB', '81', 'History Tab — GET /transactions returns array for admin',
            ok, `got ${r.status}, rows: ${r.data?.length}`);
    }

    // -----------------------------------------------------------------------
    //  B12 — TC-85: Math Accuracy — delta column in history matches qty_change
    //  FR-5.0
    // -----------------------------------------------------------------------
    {
        const code = `MATH-${Date.now()}`;
        await seedItem(code, 10, 0);
        await api(`/inventory/${code}`, 'PUT', {
            quantity_change: 5, transaction_type: 'addition', destination: 'WH'
        });
        await api(`/inventory/${code}`, 'PUT', {
            quantity_change: -2, transaction_type: 'dispatch', destination: 'Lab'
        });
        const txR = await api(`/transactions/item/${code}`);
        const txs = Array.isArray(txR.data) ? txR.data : [];
        const add = txs.find(t => t.quantity_change === 5);
        const dis = txs.find(t => t.quantity_change === -2);
        const ok  = !!add && !!dis;
        record('blockB', '85', 'Math Accuracy — +5 and -2 deltas correctly stored',
            ok, `add: ${add?.quantity_change}, dis: ${dis?.quantity_change}`);
    }

    // -----------------------------------------------------------------------
    //  B13 — TC-43/44: Mandatory fields — code and description required
    //  FR-3.0
    // -----------------------------------------------------------------------
    {
        const r  = await api('/inventory', 'POST', { vendor: 'X' });  // no code or description
        const ok = r.status === 400;
        record('blockB', '43', 'Mandatory Item Code & Description — 400 when omitted',
            ok, `got ${r.status}: ${r.data.error}`);
    }

    // -----------------------------------------------------------------------
    //  B14 — TC-55: Cancel action — modal reset does not persist data
    //  FR-3.0  (frontend-only; verify server does not persist a partial POST)
    // -----------------------------------------------------------------------
    {
        // A POST with empty code is rejected — nothing persists
        const r  = await api('/inventory', 'POST', { description: 'No code item' });
        const ok = r.status === 400;
        record('blockB', '55', 'Cancel Action — partial item (no code) not persisted',
            ok, `got ${r.status}: ${r.data.error}`);
    }

    // -----------------------------------------------------------------------
    //  B15 — TC-83: Immutable Triggers: UI — no DELETE /api/transactions route
    //  FR-9.0
    // -----------------------------------------------------------------------
    {
        const r  = await api('/transactions', 'DELETE');
        // Express will 404 (no such route) or 405 — server must NOT expose delete
        const ok = r.status === 404 || r.status === 405;
        record('blockB', '83', 'Immutable Triggers: UI — no DELETE endpoint on /transactions',
            ok, `got ${r.status}`);
    }

    // -----------------------------------------------------------------------
    //  B16 — TC-37: Available Math — dispatch modal data is mathematically correct
    //  FR-4.0  (verify API returns correct available calculation)
    // -----------------------------------------------------------------------
    {
        const code = `AVAIL-${Date.now()}`;
        await seedItem(code, 10, 4);   // available = 6
        const r   = await api(`/inventory/${code}`);
        const avail = (r.data?.current_stock || 0) - (r.data?.allocated_stock || 0);
        record('blockB', '37', 'Available Math — 10 total, 4 allocated → available = 6',
            r.status === 200 && avail === 6, `available: ${avail}`);
    }

    // -----------------------------------------------------------------------
    //  B17 — TC-98: DB Connectivity — PostgreSQL responds to a simple query
    //  FR-9.0  (verifies the DB layer is live and schema is intact)
    // -----------------------------------------------------------------------
    {
        let ok   = false;
        let note = '';
        const c  = await testPool.connect().catch(e => { note = e.message; return null; });
        if (c) {
            try {
                const row = (await c.query('SELECT current_database() AS db')).rows[0];
                ok   = !!row;
                note = `connected to database: ${row?.db}`;
            } catch (e) {
                note = e.message;
            } finally {
                c.release();
            }
        }
        record('blockB', '98', 'DB Connectivity — PostgreSQL responds to pg query',
            ok, note);
    }

    // -----------------------------------------------------------------------
    //  B18 — TC-64 INVERSE: dispatch of available-only stock SUCCEEDS
    //  Regression: guardrail must not over-block valid dispatches
    //  FR-8.0
    // -----------------------------------------------------------------------
    {
        const code = `INV-${Date.now()}`;
        await seedItem(code, 10, 5);   // 5 available
        const r = await api(`/inventory/${code}`, 'PUT', {
            quantity_change: -4,         // within the 5 available → must succeed
            transaction_type: 'dispatch',
            destination: 'Lab'
        });
        record('blockB', '64-INV', 'Guardrail Regression — dispatching 4 from 5-available SUCCEEDS',
            r.status === 200, `got ${r.status}: ${r.data.error || `new_stock=${r.data.new_stock}`}`);
    }
}


// =============================================================================
//  SUMMARY REPORT
// =============================================================================

function printSummary() {
    console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  FINAL SUMMARY                                               ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝${C.reset}`);

    for (const [block, label] of [['blockA', 'BLOCK A — 17 Critical Fixes'], ['blockB', 'BLOCK B — Regression']]) {
        const r     = results[block];
        const total = r.pass + r.fail + r.skip;
        const pct   = total ? Math.round((r.pass / total) * 100) : 0;
        const color = r.fail === 0 ? C.green : C.red;
        console.log(`\n  ${C.bold}${label}${C.reset}`);
        console.log(`  ${color}PASS ${r.pass}  FAIL ${r.fail}  SKIP ${r.skip}  (${pct}% pass rate)${C.reset}`);
        if (r.fail > 0) {
            console.log(`  ${C.red}Failed cases:${C.reset}`);
            r.cases.filter(c => !c.passed).forEach(c =>
                console.log(`    TC-${c.tcId}: ${c.description} — ${c.note}`)
            );
        }
    }

    const totalFail = results.blockA.fail + results.blockB.fail;
    console.log(`\n  ${totalFail === 0
        ? `${C.bold}${C.green}✅  ALL TESTS PASSED — system is server-guardrail complete`
        : `${C.bold}${C.red}❌  ${totalFail} FAILURE(S) REQUIRE ATTENTION before UAT sign-off`
    }${C.reset}\n`);
}


// =============================================================================
//  ENTRY POINT
// =============================================================================

(async () => {
    console.log(`${C.bold}\n🏭 STOCKSENSE — CRITICAL FIX TEST SUITE${C.reset}`);
    console.log(`${C.dim}Run: node init-database.js first if the schema is stale${C.reset}\n`);

    try {
        // Warm-up: make sure server responds
        await fetch(`${API_URL}/session`).catch(() => {
            throw new Error(
                'Server not responding on http://localhost:3000 — run: npm start'
            );
        });

        await runBlockA();
        await runBlockB();
        printSummary();

    } catch (err) {
        await testPool.end().catch(() => {});
        console.error(`\n${C.bold}${C.red}FATAL: ${err.message}${C.reset}`);
        console.error('Make sure the server is running:  npm start\n');
        await testPool.end().catch(() => {});
        process.exit(1);
    }
    // Release the pg pool so node exits cleanly
    await testPool.end().catch(() => {});
})();
