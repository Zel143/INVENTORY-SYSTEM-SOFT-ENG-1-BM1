// =============================================================================
// STOCKSENSE — MOCK FRONTEND DATA MODULE
// Phase: Bridge Deliverable — Frontend can use this without a running server
//
// AUTHOR RESPONSIBILITY: Raphael Agapito (Business Analyst / Bridge)
// STATUS CHECK: ❌  FILE DID NOT EXIST — CREATED BY AUTOMATED AUDIT
//
// HOW TO USE IN BROWSER:
//   <script src="mock-frontend-data.js"></script>
//   Then override window.fetch or inject MOCK_INVENTORY into your render call.
//
// HOW TO USE IN NODE:
//   const { MOCK_INVENTORY, EXPECTED_BADGES, MOCK_API_ERRORS } = require('./mock-frontend-data');
// =============================================================================

'use strict';

// ---------------------------------------------------------------------------
// 1. INVENTORY MOCK ITEMS
//    Every item is crafted to sit at an exact threshold boundary so the
//    frontend badge/alert rendering logic can be verified without live data.
// ---------------------------------------------------------------------------

const MOCK_INVENTORY = [

    // ------------------------------------------------------------------
    // TC-31 / TC-33 — Low Stock: EXACT boundary (current === min)
    // Expected badge: LOW STOCK (red alert triggers at current <= min)
    // ------------------------------------------------------------------
    {
        code:             'MOCK-LOW-EXACT',
        description:      'Low Stock — Exact Threshold Boundary',
        vendor:           'MockVendor',
        current_stock:    10,
        allocated_stock:  0,
        min_threshold:    10,   // current_stock === min_threshold  →  RED
        max_ceiling:      20,
        date_delivered:   '2025-01-01',
        warranty_start:   '2025-01-01',
        warranty_end:     '2030-01-01',  // not expired
        storage_location: 'Bin-MOCK-A',
        image:            ''
    },

    // ------------------------------------------------------------------
    // TC-32 — Safe Stock: well above threshold, no badges
    // ------------------------------------------------------------------
    {
        code:             'MOCK-SAFE',
        description:      'Safe Stock — No Alerts',
        vendor:           'MockVendor',
        current_stock:    15,
        allocated_stock:  0,
        min_threshold:    5,
        max_ceiling:      20,
        date_delivered:   '2025-01-01',
        warranty_start:   '2025-01-01',
        warranty_end:     '2030-01-01',
        storage_location: 'Bin-MOCK-B',
        image:            ''
    },

    // ------------------------------------------------------------------
    // TC-34 — Overstock: current_stock > max_ceiling
    // Expected badge: OVERSTOCK
    // ------------------------------------------------------------------
    {
        code:             'MOCK-OVER',
        description:      'Overstock — Exceeds Ceiling Cap',
        vendor:           'MockVendor',
        current_stock:    25,              // > max_ceiling of 20  →  OVERSTOCK
        allocated_stock:  0,
        min_threshold:    5,
        max_ceiling:      20,
        date_delivered:   '2025-01-01',
        warranty_start:   '2025-01-01',
        warranty_end:     '2030-01-01',
        storage_location: 'Bin-MOCK-C',
        image:            ''
    },

    // ------------------------------------------------------------------
    // TC-35 — Warranty EXPIRED: warranty_end is in the past
    // Expected badge: EXPIRED
    // ------------------------------------------------------------------
    {
        code:             'MOCK-EXP',
        description:      'Expired Warranty Item',
        vendor:           'MockVendor',
        current_stock:    10,
        allocated_stock:  0,
        min_threshold:    5,
        max_ceiling:      20,
        date_delivered:   '2023-01-01',
        warranty_start:   '2023-01-01',
        warranty_end:     '2024-01-01',    // past → EXPIRED badge
        storage_location: 'Bin-MOCK-D',
        image:            ''
    },

    // ------------------------------------------------------------------
    // TC-36 — Warranty ACTIVE: warranty_end is in the future, no badge
    // ------------------------------------------------------------------
    {
        code:             'MOCK-ACTIVE',
        description:      'Active Warranty Item',
        vendor:           'MockVendor',
        current_stock:    10,
        allocated_stock:  0,
        min_threshold:    5,
        max_ceiling:      20,
        date_delivered:   '2025-01-01',
        warranty_start:   '2025-01-01',
        warranty_end:     '2030-01-01',    // future → no EXPIRED badge
        storage_location: 'Bin-MOCK-E',
        image:            ''
    },

    // ------------------------------------------------------------------
    // TC-37 — Available Math: 10 total, 4 allocated → Available = 6
    // Dispatch modal must display exactly "Available: 6"
    // ------------------------------------------------------------------
    {
        code:             'MOCK-AVAIL',
        description:      'Available Math Verification (10 total, 4 allocated)',
        vendor:           'MockVendor',
        current_stock:    10,
        allocated_stock:  4,               // available = 10 - 4 = 6
        min_threshold:    5,
        max_ceiling:      20,
        date_delivered:   '2025-01-01',
        warranty_start:   '2025-01-01',
        warranty_end:     '2030-01-01',
        storage_location: 'Bin-MOCK-F',
        image:            ''
    },

    // ------------------------------------------------------------------
    // TC-64 — Full Allocation Guardrail: ALL stock reserved
    // Any dispatch attempt must return 400 "Allocation Breach"
    // ------------------------------------------------------------------
    {
        code:             'MOCK-ALLOC-FULL',
        description:      'Fully Allocated — Zero Available',
        vendor:           'MockVendor',
        current_stock:    5,
        allocated_stock:  5,               // available = 0  →  all dispatches blocked
        min_threshold:    5,
        max_ceiling:      20,
        date_delivered:   '2025-01-01',
        warranty_start:   '2025-01-01',
        warranty_end:     '2030-01-01',
        storage_location: 'Bin-MOCK-G',
        image:            ''
    },

    // ------------------------------------------------------------------
    // TC-65 — Partial Allocation Guard: 10 total, 8 allocated → only 2 avail
    // Dispatching > 2 must return 400 "Allocation Breach"
    // ------------------------------------------------------------------
    {
        code:             'MOCK-ALLOC-PART',
        description:      'Partially Allocated — 2 Available',
        vendor:           'MockVendor',
        current_stock:    10,
        allocated_stock:  8,               // available = 2
        min_threshold:    5,
        max_ceiling:      20,
        date_delivered:   '2025-01-01',
        warranty_start:   '2025-01-01',
        warranty_end:     '2030-01-01',
        storage_location: 'Bin-MOCK-H',
        image:            ''
    },

    // ------------------------------------------------------------------
    // TC-63 — Overdraft: current_stock < quantity dispatched (no allocation)
    // ------------------------------------------------------------------
    {
        code:             'MOCK-OVERDRAFT',
        description:      'Overdraft Protection — Low Physical Stock',
        vendor:           'MockVendor',
        current_stock:    3,               // dispatching 5 → new_stock = -2 → blocked
        allocated_stock:  0,
        min_threshold:    5,               // also triggers LOW STOCK badge
        max_ceiling:      20,
        date_delivered:   '2025-01-01',
        warranty_start:   '2025-01-01',
        warranty_end:     '2030-01-01',
        storage_location: 'Bin-MOCK-I',
        image:            ''
    },

    // ------------------------------------------------------------------
    // COMBO: Low Stock + Expired (two badges simultaneously)
    // ------------------------------------------------------------------
    {
        code:             'MOCK-COMBO',
        description:      'Combo — Low + Expired',
        vendor:           'MockVendor',
        current_stock:    2,               // below threshold → LOW STOCK
        allocated_stock:  0,
        min_threshold:    5,
        max_ceiling:      20,
        date_delivered:   '2022-01-01',
        warranty_start:   '2022-01-01',
        warranty_end:     '2023-01-01',    // expired → EXPIRED
        storage_location: 'Bin-MOCK-J',
        image:            ''
    }
];


// ---------------------------------------------------------------------------
// 2. EXPECTED BADGE STATE TABLE
//    Frontend team: Assert rendered badges match this table exactly.
//    Keys: lowStock | overstock | expired | available (number, if relevant)
// ---------------------------------------------------------------------------

const EXPECTED_BADGES = {
    'MOCK-LOW-EXACT':  { lowStock: true,  overstock: false, expired: false },
    'MOCK-SAFE':       { lowStock: false, overstock: false, expired: false },
    'MOCK-OVER':       { lowStock: false, overstock: true,  expired: false },
    'MOCK-EXP':        { lowStock: false, overstock: false, expired: true  },
    'MOCK-ACTIVE':     { lowStock: false, overstock: false, expired: false },
    'MOCK-AVAIL':      { lowStock: false, overstock: false, expired: false, available: 6  },
    'MOCK-ALLOC-FULL': { lowStock: false, overstock: false, expired: false, available: 0  },
    'MOCK-ALLOC-PART': { lowStock: false, overstock: false, expired: false, available: 2  },
    'MOCK-OVERDRAFT':  { lowStock: true,  overstock: false, expired: false },
    'MOCK-COMBO':      { lowStock: true,  overstock: false, expired: true  }
};


// ---------------------------------------------------------------------------
// 3. EXPECTED API ERROR SHAPES
//    Frontend team: When fetch() rejects or returns !response.ok, the JSON
//    body will match one of these shapes.  Wire your error handler tests to
//    these instead of guessing the field names.
// ---------------------------------------------------------------------------

const MOCK_API_ERRORS = {

    // TC-64 / TC-65 — Allocation breach
    ALLOCATION_BREACH_FULL: {
        httpStatus: 400,
        body: {
            error:   'Allocation Breach',
            message: 'Transaction Denied: 5 units are reserved for Maintenance Agreements. Only 0 units available for dispatch.',
            details: {
                current_stock:     5,
                allocated_stock:   5,
                available_for_use: 0,
                requested_change:  -1,
                would_result_in:   4
            }
        }
    },

    ALLOCATION_BREACH_PARTIAL: {
        httpStatus: 400,
        body: {
            error:   'Allocation Breach',
            message: 'Transaction Denied: 8 units are reserved for Maintenance Agreements. Only 2 units available for dispatch.',
            details: {
                current_stock:     10,
                allocated_stock:   8,
                available_for_use: 2,
                requested_change:  -4,
                would_result_in:   6
            }
        }
    },

    // TC-63 — Overdraft
    INSUFFICIENT_STOCK: {
        httpStatus: 400,
        body: { error: 'Insufficient stock' }
    },

    // TC-69 — Zero quantity
    ZERO_QUANTITY: {
        httpStatus: 400,
        body: { error: 'Quantity must be a non-zero number' }
    },

    // TC-66 — Missing destination
    MISSING_DESTINATION: {
        httpStatus: 400,
        body: { error: 'Destination is required for dispatch / stock-removal operations' }
    },

    // TC-45 — Duplicate SKU
    DUPLICATE_SKU: {
        httpStatus: 400,
        // Note: server interpolates the actual code into this string
        body: { error: 'Item code "MOCK-LOW-EXACT" already exists.' }
    },

    // TC-50 — Warranty date order
    WARRANTY_DATE_ORDER: {
        httpStatus: 400,
        body: { error: 'Warranty end date must be after warranty start date' }
    },

    // TC-10 — Invalid login (with attempt counter)
    INVALID_CREDENTIALS: {
        httpStatus: 401,
        body: { error: 'Invalid credentials. 4 attempts remaining.' }
    },

    // TC-20 — Account locked after 5 failures
    ACCOUNT_LOCKED: {
        httpStatus: 429,
        body: { error: 'Account locked. Too many failed attempts. Try again in 15 minutes.' }
    },

    // TC-16 — Session bypass
    SESSION_REQUIRED: {
        httpStatus: 401,
        body: { error: 'Authentication required' }
    },

    // Admin-only route hit by staff
    ADMIN_REQUIRED: {
        httpStatus: 403,
        body: { error: 'Admin access required' }
    },

    // TC-7 — Empty login
    EMPTY_LOGIN: {
        httpStatus: 400,
        body: { error: 'Username and password required' }
    }
};


// ---------------------------------------------------------------------------
// 4. EXPECTED API SUCCESS SHAPES
// ---------------------------------------------------------------------------

const MOCK_API_SUCCESS = {

    // TC-8
    LOGIN_ADMIN: {
        httpStatus: 200,
        body: {
            success: true,
            user: {
                id:           'admin_001',
                username:     'admin',
                role:         'admin',
                display_name: 'System Administrator'
            }
        }
    },

    // TC-9
    LOGIN_STAFF: {
        httpStatus: 200,
        body: {
            success: true,
            user: {
                id:           'staff_001',
                username:     'staff',
                role:         'staff',
                display_name: 'Warehouse Staff'
            }
        }
    },

    // TC-75 — Dispatch success confirmation
    DISPATCH_SUCCESS: {
        httpStatus: 200,
        // transactionId will be a uuid; new_stock will vary — check shape only
        body: { success: true }
    },

    // TC-72 — Add stock success
    ADD_STOCK_SUCCESS: {
        httpStatus: 200,
        body: { success: true }
    },

    // TC-42 — Log new item success
    CREATE_ITEM_SUCCESS: {
        httpStatus: 200,
        body: { success: true }
    }
};


// ---------------------------------------------------------------------------
// 5. DISPATCH MODAL CONTEXT STRINGS
//    Exact strings the frontend must render inside the dispatch modal
//    for each mock item (TC-61 / TC-37).
// ---------------------------------------------------------------------------

const DISPATCH_MODAL_CONTEXT = {
    'MOCK-AVAIL': {
        totalLabel:     'Total: 10',
        reservedLabel:  'Reserved (MA): 4',
        availableLabel: 'Available to Dispatch: 6'
    },
    'MOCK-ALLOC-FULL': {
        totalLabel:     'Total: 5',
        reservedLabel:  'Reserved (MA): 5',
        availableLabel: 'Available to Dispatch: 0'
    },
    'MOCK-ALLOC-PART': {
        totalLabel:     'Total: 10',
        reservedLabel:  'Reserved (MA): 8',
        availableLabel: 'Available to Dispatch: 2'
    }
};


// ---------------------------------------------------------------------------
// 6. GUARDRAIL BANNER TEXT
//    Exact strings app-sqlite.js produces for error banners (TC-76).
// ---------------------------------------------------------------------------

const EXPECTED_ERROR_BANNERS = {
    ALLOCATION_BREACH:   (msg) => `⚠️ ALLOCATION GUARDRAIL ACTIVATED — ${msg}`,
    DISPATCH_GUARDRAIL:  'Destination is required for dispatch / stock-removal operations',
    ZERO_QTY_GUARDRAIL:  'Quantity must be a non-zero number',
    INSUFFICIENT_STOCK:  'Insufficient stock'
};


// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MOCK_INVENTORY,
        EXPECTED_BADGES,
        MOCK_API_ERRORS,
        MOCK_API_SUCCESS,
        DISPATCH_MODAL_CONTEXT,
        EXPECTED_ERROR_BANNERS
    };
}
// Browser global
if (typeof window !== 'undefined') {
    window.STOCKSENSE_MOCK = {
        MOCK_INVENTORY,
        EXPECTED_BADGES,
        MOCK_API_ERRORS,
        MOCK_API_SUCCESS,
        DISPATCH_MODAL_CONTEXT,
        EXPECTED_ERROR_BANNERS
    };
}
