// ======================================
// ALLOCATION GUARDRAIL TEST SCRIPT
// Run this after server is started to verify the guardrail works
// ======================================

const API_URL = 'http://localhost:3000/api';

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    bold: '\x1b[1m'
};

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${API_URL}${endpoint}`, options);
    const data = await response.json();
    return { status: response.status, data };
}

async function testAllocationGuardrail() {
    console.log(`${colors.bold}${colors.blue}🛡️  ALLOCATION GUARDRAIL TEST SUITE${colors.reset}\n`);

    // Test Case 1: Valid transaction (within available stock)
    console.log(`${colors.yellow}Test 1: Valid Transaction (Within Available Stock)${colors.reset}`);
    console.log('Setup: MCH-001 has 10 units total, 5 allocated');
    console.log('Action: Dispatch 5 units (should succeed)\n');

    try {
        // First, check current stock
        const { data: item } = await apiCall('/inventory/MCH-001');
        console.log('Current State:');
        console.log(`  - Physical Stock: ${item.current_stock}`);
        console.log(`  - Allocated Stock: ${item.allocated_stock}`);
        console.log(`  - Available: ${item.current_stock - item.allocated_stock}\n`);

        // Try to dispatch 5 units
        const { status, data } = await apiCall('/inventory/MCH-001', 'PUT', {
            quantity_change: -5,
            transaction_type: 'dispatch',
            destination: 'Test Floor',
            purpose: 'Guardrail Test - Valid transaction'
        });

        if (status === 200) {
            console.log(`${colors.green}✅ Test 1 PASSED: Transaction allowed${colors.reset}`);
            console.log(`   New stock: ${data.new_stock}\n`);
        } else {
            console.log(`${colors.red}❌ Test 1 FAILED: Unexpected rejection${colors.reset}\n`);
        }
    } catch (error) {
        console.log(`${colors.red}❌ Test 1 ERROR: ${error.message}${colors.reset}\n`);
    }

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test Case 2: Invalid transaction (breaches allocation)
    console.log(`${colors.yellow}Test 2: Allocation Breach (Should Be Rejected)${colors.reset}`);
    console.log('Setup: Current state after Test 1');
    console.log('Action: Try to dispatch 8 more units (should fail)\n');

    try {
        const { status, data } = await apiCall('/inventory/MCH-001', 'PUT', {
            quantity_change: -8,
            transaction_type: 'dispatch',
            destination: 'Test Floor',
            purpose: 'Guardrail Test - Should be rejected'
        });

        if (status === 400 && data.error === 'Allocation Breach') {
            console.log(`${colors.green}✅ Test 2 PASSED: Allocation guardrail activated${colors.reset}`);
            console.log(`   Error: ${data.error}`);
            console.log(`   Message: ${data.message}`);
            if (data.details) {
                console.log(`   Details:`);
                console.log(`     - Current stock: ${data.details.current_stock}`);
                console.log(`     - Allocated: ${data.details.allocated_stock}`);
                console.log(`     - Available: ${data.details.available_for_use}`);
                console.log(`     - Requested: ${data.details.requested_change}`);
            }
            console.log();
        } else {
            console.log(`${colors.red}❌ Test 2 FAILED: Transaction was incorrectly allowed!${colors.reset}`);
            console.log(`   This is a CRITICAL SECURITY ISSUE!\n`);
        }
    } catch (error) {
        console.log(`${colors.red}❌ Test 2 ERROR: ${error.message}${colors.reset}\n`);
    }

    // Test Case 3: Edge case - exact boundary
    console.log(`${colors.yellow}Test 3: Boundary Condition (Exact Allocation Match)${colors.reset}`);
    console.log('Setup: Current state');
    console.log('Action: Restore stock to exactly match allocation (should succeed)\n');

    try {
        // First get current state
        const { data: currentItem } = await apiCall('/inventory/MCH-001');
        const difference = currentItem.allocated_stock - currentItem.current_stock;

        if (difference > 0) {
            // Add stock to reach exactly allocated_stock
            const { status, data } = await apiCall('/inventory/MCH-001', 'PUT', {
                quantity_change: difference,
                transaction_type: 'addition',
                destination: 'Warehouse',
                purpose: 'Guardrail Test - Restore to boundary'
            });

            if (status === 200) {
                console.log(`${colors.green}✅ Test 3 PASSED: Boundary condition handled correctly${colors.reset}`);
                console.log(`   Stock now equals allocated_stock: ${data.new_stock}\n`);
            } else {
                console.log(`${colors.red}❌ Test 3 FAILED: Boundary case rejected${colors.reset}\n`);
            }
        } else {
            console.log(`${colors.blue}ℹ️  Test 3 SKIPPED: Stock already at or above allocation${colors.reset}\n`);
        }
    } catch (error) {
        console.log(`${colors.red}❌ Test 3 ERROR: ${error.message}${colors.reset}\n`);
    }

    // Summary
    console.log(`${colors.bold}${colors.blue}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}TEST SUITE COMPLETE${colors.reset}`);
    console.log(`${colors.blue}═══════════════════════════════════════${colors.reset}\n`);
    console.log('Next Steps:');
    console.log('1. Check browser console for detailed error messages');
    console.log('2. Test in dashboard UI with admin/staff accounts');
    console.log('3. Review ALLOCATION_GUARDRAIL.md for full documentation\n');
}

// Run tests
console.log('Starting Allocation Guardrail Tests...\n');
console.log('⚠️  Make sure the server is running: npm start\n');
console.log('Press Ctrl+C if server is not running, then start it first.\n');

setTimeout(() => {
    testAllocationGuardrail().catch(error => {
        console.log(`${colors.red}${colors.bold}FATAL ERROR: ${error.message}${colors.reset}`);
        console.log('\nIs the server running? Try: npm start\n');
        process.exit(1);
    });
}, 1000);
