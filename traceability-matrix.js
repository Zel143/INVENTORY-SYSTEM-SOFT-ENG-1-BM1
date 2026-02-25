// =============================================================================
// STOCKSENSE — REQUIREMENTS TRACEABILITY MATRIX (RTM)
// =============================================================================
//
// Scope:  Maps every UAT Test Case ID to its parent Functional Requirement
//         and documents which layer owns the enforcement (DB / Server / Frontend).
//
// HOW TO RUN (prints full matrix to terminal):
//   node traceability-matrix.js
//
// AUTHOR RESPONSIBILITY: Raphael Agapito (Business Analyst / Bridge)
// STATUS CHECK: ❌  FILE DID NOT EXIST — CREATED BY AUTOMATED AUDIT
// =============================================================================

'use strict';

const C = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    red:    '\x1b[31m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    cyan:   '\x1b[36m',
    dim:    '\x1b[2m',
    blue:   '\x1b[34m'
};

// ---------------------------------------------------------------------------
// FUNCTIONAL REQUIREMENTS REGISTER
// ---------------------------------------------------------------------------

const REQUIREMENTS = {
    'FR-1.0': {
        title:       'User Authentication & Session Management',
        description: 'System must authenticate users via username/password, enforce role-based ' +
                     'access, limit failed attempts to 5 before lockout, and automatically expire ' +
                     'sessions after 2 hours.',
        owner:       'Server + DB',
        priority:    'P1-Critical'
    },
    'FR-2.0': {
        title:       'Dashboard Visibility & UI Responsiveness',
        description: 'Inventory list must render within 2 seconds. Search must filter in real-time. ' +
                     'Table columns must be sortable. Auto-refresh every 10 seconds.',
        owner:       'Frontend',
        priority:    'P1-Critical'
    },
    'FR-3.0': {
        title:       'Inventory CRUD & Data Validation',
        description: 'Admins may create, read, update inventory items. Item Code and Description are ' +
                     'mandatory. Item Code must be unique (SQLite UNIQUE). Stock values must be ' +
                     'non-negative integers. Warranty end must follow warranty start.',
        owner:       'Server + DB',
        priority:    'P1-Critical'
    },
    'FR-4.0': {
        title:       'Stock Dispatch & Addition Operations',
        description: 'Staff and admins may dispatch or restock items. Dispatch requires a non-blank ' +
                     'destination. Quantity must be a positive non-zero integer. ' +
                     'Dispatch may not exceed available physical stock.',
        owner:       'Server',
        priority:    'P1-Critical'
    },
    'FR-5.0': {
        title:       'Audit Trail & Transaction History',
        description: 'Every stock movement must be logged with item, actor, delta, timestamp, and ' +
                     'destination. Logs are permanently immutable (no edit/delete). ' +
                     'History is visible to admins only.',
        owner:       'Server + DB',
        priority:    'P1-Critical'
    },
    'FR-6.0': {
        title:       'Warranty Lifecycle Tracking',
        description: 'Items with warranty_end in the past must be flagged EXPIRED. ' +
                     'Items with active warranties must not show the flag.',
        owner:       'Frontend + DB',
        priority:    'P2-High'
    },
    'FR-7.0': {
        title:       'Low-Stock & Overstock Alerting',
        description: 'Items at or below min_threshold trigger a red Low-Stock alert. ' +
                     'Items above max_ceiling trigger an Overstock alert. ' +
                     'Alerts must activate at the exact boundary value (current === min).',
        owner:       'Frontend + DB',
        priority:    'P2-High'
    },
    'FR-8.0': {
        title:       'Allocation Guardrail — Maintenance Agreement Protection',
        description: 'Units reserved via allocated_stock may never be dispatched for walk-in use. ' +
                     'The server must block any transaction where (current_stock + quantity_change) ' +
                     '< allocated_stock. The DB CHECK constraint provides a secondary safety net.',
        owner:       'Server + DB',
        priority:    'P1-Critical'
    },
    'FR-9.0': {
        title:       'Data Integrity & Immutability',
        description: 'SQLite triggers must use RAISE(ABORT) to prevent any modification or deletion ' +
                     'of transaction records. The frontend must expose no edit/delete UI for history. ' +
                     'Database file must be local (offline-resilient).',
        owner:       'DB + Frontend',
        priority:    'P1-Critical'
    }
};


// ---------------------------------------------------------------------------
// TEST CASE → REQUIREMENT MAPPING
//
// Each entry: { fr, layer, criticality, serverFix, description }
//   fr          — parent requirement
//   layer       — which layer enforces it: 'DB' | 'Server' | 'Frontend' | 'Both'
//   criticality — 'Critical' (server-side fix needed) | 'Regression' (must not break)
//   serverFix   — true if this is one of the 17 critical server-side fixes
//   description — verbatim from UAT CSV
// ---------------------------------------------------------------------------

const MATRIX = {
    // ── FR-1.0  Authentication ─────────────────────────────────────────────
    1:  { fr: 'FR-1.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Logo Display (Desktop)' },
    2:  { fr: 'FR-1.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Logo Display (Mobile)' },
    3:  { fr: 'FR-1.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'System Title visible' },
    4:  { fr: 'FR-1.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Field Accessibility' },
    5:  { fr: 'FR-1.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Credential Masking' },
    6:  { fr: 'FR-1.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Login Button Visibility' },
    7:  { fr: 'FR-1.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: 'Empty Login Guard — blank credentials rejected (HTTP 400)' },
    8:  { fr: 'FR-1.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Valid Admin Login → 200 + role=admin' },
    9:  { fr: 'FR-1.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Valid Staff Login → 200 + role=staff' },
    10: { fr: 'FR-1.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: 'Invalid Credentials → 401 with attempt counter' },
    11: { fr: 'FR-1.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: 'Case Sensitivity — ADMIN ≠ admin → 401' },
    12: { fr: 'FR-1.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: "SQL Injection — ' OR 1=1 -- denied, no server crash" },
    13: { fr: 'FR-1.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Special Characters in username gracefully denied' },
    14: { fr: 'FR-1.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Tab Key Flow — focus shifts to password field' },
    15: { fr: 'FR-1.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Enter Key Flow — form submits on Enter' },
    16: { fr: 'FR-1.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: 'Session Bypass — protected route returns 401 without cookie' },
    17: { fr: 'FR-1.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Session History Bypass — unauthenticated redirect to login' },
    18: { fr: 'FR-1.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Browser Back Button — cannot return to login page' },
    19: { fr: 'FR-1.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: 'Session Expiration — 2-hour maxAge enforced in server config' },
    20: { fr: 'FR-1.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: 'Logout Execution — session destroyed, redirect to index.html' },

    // ── FR-2.0  Dashboard ─────────────────────────────────────────────────
    21: { fr: 'FR-2.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Dashboard Load Time ≤ 2 seconds' },
    22: { fr: 'FR-2.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Sidebar Navigation — view switches without page reload' },
    23: { fr: 'FR-2.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Mobile Menu Toggle' },
    24: { fr: 'FR-2.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Zero-Friction Search — partial word filters table instantly' },
    25: { fr: 'FR-2.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'SKU Exact Search' },
    26: { fr: 'FR-2.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Vendor Search' },
    27: { fr: 'FR-2.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Invalid Search — "No items found" displayed' },
    28: { fr: 'FR-2.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Search Reset — full list restored on clear' },
    29: { fr: 'FR-2.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Case-Insensitive Search' },
    30: { fr: 'FR-2.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Special Char Search — no UI error thrown' },

    // ── FR-7.0  Stock Alerts ───────────────────────────────────────────────
    31: { fr: 'FR-7.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Low Stock — red alert border when stock ≤ threshold' },
    32: { fr: 'FR-7.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Safe Stock — no urgency markers' },
    33: { fr: 'FR-7.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Exact Boundary — red alert fires at current === min_threshold' },
    34: { fr: 'FR-7.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Overstock — item highlighted when current > max_ceiling' },

    // ── FR-6.0  Warranty ──────────────────────────────────────────────────
    35: { fr: 'FR-6.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Warranty Expired — EXPIRED badge when warranty_end < today' },
    36: { fr: 'FR-6.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Warranty Active — no expiry alert' },

    // ── FR-4.0  Dispatch ──────────────────────────────────────────────────
    37: { fr: 'FR-4.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Available Math — (total − allocated) shown in modal' },
    38: { fr: 'FR-2.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Column Sorting: Description (A-Z)' },
    39: { fr: 'FR-2.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Column Sorting: Qty (lowest first)' },
    40: { fr: 'FR-2.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Data Refresh — new stock visible without logout' },

    // ── FR-3.0  Inventory CRUD ────────────────────────────────────────────
    41: { fr: 'FR-3.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Log Stocks UI — modal opens with all required fields' },
    42: { fr: 'FR-3.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Log Stocks Full Entry — item saves and appears on dashboard' },
    43: { fr: 'FR-3.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Mandatory Item Code — blank code blocked (HTTP 400)' },
    44: { fr: 'FR-3.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Mandatory Description — blank description blocked (HTTP 400)' },
    45: { fr: 'FR-3.0', layer: 'DB',       criticality: 'Critical',    serverFix: true,  description: 'Duplicate SKU Lock — UNIQUE constraint rejects repeated code' },
    46: { fr: 'FR-3.0', layer: 'DB',       criticality: 'Critical',    serverFix: true,  description: 'Negative Stock — CHECK(current_stock >= 0) blocks negative value' },
    47: { fr: 'FR-3.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Decimal Quantity — input restricted to integers' },
    48: { fr: 'FR-3.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Letters in Quantity — numeric-only field' },
    49: { fr: 'FR-3.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Max Value — large integer handled without crash' },
    50: { fr: 'FR-3.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: 'Date Guardrail — warranty_end before warranty_start blocked' },
    51: { fr: 'FR-3.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Date Format — date picker enforces valid calendar' },
    52: { fr: 'FR-3.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Edit Item Description — change persists to dashboard' },
    53: { fr: 'FR-3.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Edit Allocation Up — available stock decreases' },
    54: { fr: 'FR-3.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Edit Allocation Down — available stock increases' },
    55: { fr: 'FR-3.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Cancel Action — modal closes, no data saved' },
    56: { fr: 'FR-3.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Delete Confirmation — "Are you sure?" prompt before execution' },
    57: { fr: 'FR-3.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Delete Execution — item permanently removed' },
    58: { fr: 'FR-5.0', layer: 'DB',       criticality: 'Regression',  serverFix: false, description: 'Delete Audit Logging — deletion event recorded in audit trail' },
    59: { fr: 'FR-3.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Mobile Form Flow — numeric pad for quantity fields' },
    60: { fr: 'FR-3.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Double-Click Prevention — only one addition processed' },

    // ── FR-4.0  Dispatch Operations ───────────────────────────────────────
    61: { fr: 'FR-4.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Dispatch UI Load — modal shows Physical, Available, inputs' },
    62: { fr: 'FR-4.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Normal Dispatch — valid qty + destination → stock decrements' },
    63: { fr: 'FR-4.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: 'Overdraft Protection — dispatch > physical stock blocked' },
    64: { fr: 'FR-8.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: 'Allocation Guardrail — fully reserved item cannot be dispatched' },
    65: { fr: 'FR-8.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: 'Partial Allocation Guard — dispatch > available blocked' },
    66: { fr: 'FR-4.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: 'Mandatory Destination — blank/whitespace destination blocked' },
    67: { fr: 'FR-4.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Destination Dropdown — predefined department list' },
    68: { fr: 'FR-5.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Purpose Tracking — Work Order ID attached to transaction log' },
    69: { fr: 'FR-4.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: 'Zero Quantity Dispatch — quantity_change = 0 blocked' },
    70: { fr: 'FR-4.0', layer: 'Server',   criticality: 'Critical',    serverFix: true,  description: 'Non-Numeric Quantity — string value blocked (Number coercion)' },
    71: { fr: 'FR-4.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Letters in Dispatch Qty — numeric-only input' },
    72: { fr: 'FR-4.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Add Stock — valid restock increments correctly' },
    73: { fr: 'FR-4.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Add Stock Mandatory Info — source/vendor required' },
    74: { fr: 'FR-4.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Rapid Dispatch — concurrent requests handled without lock' },
    75: { fr: 'FR-4.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Success Telemetry — green confirmation banner displayed' },
    76: { fr: 'FR-4.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Failure Telemetry — red error banner with exact reason' },
    77: { fr: 'FR-4.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Mobile Dispatch Button — tappable without zooming' },
    78: { fr: 'FR-4.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Auto-Clear Modal — previous inputs cleared on reopen' },

    // ── FR-5.0  Audit Trail ───────────────────────────────────────────────
    79: { fr: 'FR-5.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Transaction Timestamp — ISO datetime stored at execution time' },
    80: { fr: 'FR-5.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Actor Identity — transaction tied to logged-in user ID' },
    81: { fr: 'FR-5.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'History Tab Load — read-only transaction table loads for admin' },
    82: { fr: 'FR-5.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Log Presence — new row in history after dispatch' },
    83: { fr: 'FR-9.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Immutable Triggers: UI — no Edit/Delete buttons in history' },
    84: { fr: 'FR-9.0', layer: 'DB',       criticality: 'Critical',    serverFix: true,  description: 'Immutable Triggers: DB — RAISE(ABORT) blocks DELETE on transactions' },
    85: { fr: 'FR-5.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Math Accuracy — delta (+/-) matches actual qty change' },
    86: { fr: 'FR-5.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'History Sort by Date — chronological reordering' },
    87: { fr: 'FR-5.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'History Filter by Actor' },
    88: { fr: 'FR-5.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'History Filter by Item code' },
    89: { fr: 'FR-5.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'History Filter by Destination' },
    90: { fr: 'FR-5.0', layer: 'Server',   criticality: 'Regression',  serverFix: false, description: 'Extreme Data Load — 10 000 logs, no crash' },
    91: { fr: 'FR-5.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Pagination: Next' },
    92: { fr: 'FR-5.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Pagination: Last' },
    93: { fr: 'FR-5.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Export to CSV button triggers download' },
    94: { fr: 'FR-5.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Exported Data Integrity — columns align with UI' },
    95: { fr: 'FR-2.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Cross-Browser: Chrome' },
    96: { fr: 'FR-2.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Cross-Browser: Firefox' },
    97: { fr: 'FR-2.0', layer: 'Frontend', criticality: 'Regression',  serverFix: false, description: 'Cross-Browser: Safari' },
    98: { fr: 'FR-9.0', layer: 'DB',       criticality: 'Regression',  serverFix: false, description: 'Offline Resistance — local SQLite, no cloud dependency' },
    99: { fr: 'FR-9.0', layer: 'Both',     criticality: 'Regression',  serverFix: false, description: 'Final System Match — physical count === digital count' },
    100:{ fr: 'FR-9.0', layer: 'Both',     criticality: 'Regression',  serverFix: false, description: 'Production Ready Hand-off — zero critical failures' }
};


// ---------------------------------------------------------------------------
// DERIVED STATISTICS
// ---------------------------------------------------------------------------

function buildStats() {
    const criticalFixes = Object.entries(MATRIX).filter(([,v]) => v.serverFix);
    const byFR = {};
    for (const [id, entry] of Object.entries(MATRIX)) {
        byFR[entry.fr] = byFR[entry.fr] || { cases: [], critical: 0, regression: 0 };
        byFR[entry.fr].cases.push(Number(id));
        if (entry.serverFix)                      byFR[entry.fr].critical++;
        else if (entry.criticality === 'Regression') byFR[entry.fr].regression++;
    }
    return { criticalFixes, byFR };
}


// ---------------------------------------------------------------------------
// PRINT FUNCTIONS
// ---------------------------------------------------------------------------

function printMatrix() {
    const { criticalFixes, byFR } = buildStats();

    console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════════╗`);
    console.log(`║   STOCKSENSE — REQUIREMENTS TRACEABILITY MATRIX (RTM)           ║`);
    console.log(`╚══════════════════════════════════════════════════════════════════╝${C.reset}\n`);

    // ── Per-Requirement Summary ─────────────────────────────────────────────
    console.log(`${C.bold}FUNCTIONAL REQUIREMENTS${C.reset}`);
    console.log(`${'─'.repeat(68)}`);
    for (const [frId, fr] of Object.entries(REQUIREMENTS)) {
        const stat = byFR[frId] || { cases: [], critical: 0, regression: 0 };
        const crit = stat.critical   > 0
            ? `${C.red}${stat.critical} critical fix(es)${C.reset}`
            : `${C.dim}0 critical${C.reset}`;
        const reg  = `${C.dim}${stat.regression} regression${C.reset}`;
        console.log(`\n  ${C.bold}${frId}${C.reset}  ${C.blue}${fr.title}${C.reset}`);
        console.log(`  ${C.dim}Owner: ${fr.owner}  |  Priority: ${fr.priority}${C.reset}`);
        console.log(`  TCs: [${stat.cases.join(', ')}]`);
        console.log(`  ${crit}  |  ${reg}`);
    }

    // ── 17 Critical Fixes Detail ────────────────────────────────────────────
    console.log(`\n\n${C.bold}17 CRITICAL SERVER-SIDE FIXES (must all PASS before UAT sign-off)${C.reset}`);
    console.log(`${'─'.repeat(68)}`);
    const rows = criticalFixes.sort(([a], [b]) => Number(a) - Number(b));
    rows.forEach(([id, entry], i) => {
        const layerColor = entry.layer === 'DB' ? C.yellow : C.cyan;
        console.log(`  ${String(i+1).padStart(2)}. ${C.bold}TC-${id}${C.reset}  [${layerColor}${entry.layer}${C.reset}]  ${entry.fr}  —  ${entry.description}`);
    });

    // ── Total Counts ────────────────────────────────────────────────────────
    const total      = Object.keys(MATRIX).length;
    const critCount  = criticalFixes.length;
    const regCount   = total - critCount;
    console.log(`\n\n${C.bold}TOTALS${C.reset}`);
    console.log(`${'─'.repeat(68)}`);
    console.log(`  Total UAT Cases:       ${total}`);
    console.log(`  ${C.red}Critical Server Fixes:  ${critCount}${C.reset}`);
    console.log(`  ${C.dim}Regression Cases:       ${regCount}${C.reset}`);
    console.log(`\n  Run: ${C.bold}node test-critical-fixes.js${C.reset}  to execute Block A + Block B\n`);
}


// ---------------------------------------------------------------------------
// EXPORT & ENTRY POINT
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { REQUIREMENTS, MATRIX, buildStats };
}

// Run if invoked directly: node traceability-matrix.js
if (require.main === module) {
    printMatrix();
}
