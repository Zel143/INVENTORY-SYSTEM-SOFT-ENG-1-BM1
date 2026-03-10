# StockSense — System Specification & UAT Summary
**Software Engineering 1 | Group 3 | BM1**

| Field | Details |
|---|---|
| Project Name | StockSense |
| Project Manager | Ranzel Virtucio |
| Business Analyst | Raphael Agapito |
| Testing Start Date | February 14, 2026 |
| Testing End Date | March 10, 2026 |
| Document Version | 2.0 |
| Date Created | March 10, 2026 |

---

## 1. System Overview

StockSense is a web-based inventory management system built with a Node.js/Express backend and a plain HTML/CSS/JavaScript frontend, backed by a live PostgreSQL (Supabase) database. It supports:

- Role-based access control (Admin and Staff)
- Real-time inventory updates via Server-Sent Events (SSE)
- Full transaction history with immutable audit trail
- Low-stock and overstock alerts
- CSV export of transaction history
- Secure password reset flow with time-limited codes
- Stock allocation and deallocation management

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Web Framework | Express 4 |
| Database | PostgreSQL (Supabase) |
| Auth | express-session + bcryptjs |
| Frontend | HTML5 / CSS3 / Vanilla JS |
| Real-time | Server-Sent Events (SSE) |
| Icons | Font Awesome 6 |
| Fonts | Google Fonts — Inter |

---

## 3. Requirements Traceability Matrix

| Req ID | Business Need | Technical Implementation | UAT Test Case IDs |
|---|---|---|---|
| FR-1.0 | Brand Identity Display | Logo displayed via HTML image element; CSS flex layout scales correctly on all screen sizes | 1, 2, 3 |
| FR-2.0 | Accessible Login Form | Standard HTML5 login form with password masking; show/hide toggle; fully keyboard-accessible | 4, 5, 6, 14, 15 |
| FR-3.0 | Secure User Authentication | Server verifies credentials against DB using parameterised queries; blocks SQL injection | 7, 8, 9, 10, 11, 12, 13 |
| FR-4.0 | Account Lockout Protection | Account locked for 15 min after 5 consecutive failures; rolling window auto-resets | 10, 116, 122 |
| FR-5.0 | Session Security and Expiry | Sessions expire after 2 hours; protected pages redirect to login; logout destroys server session | 16, 17, 18, 19, 20 |
| FR-6.0 | Role-Based Access Control | Every API call checks Admin/Staff role; Staff blocked from admin-only actions with 403 | 8, 9, 16, 83 |
| FR-7.0 | Fast Dashboard Load and SPA Navigation | Inventory fetched on page load; sidebar tabs switch in-place without reload; hamburger on mobile | 21, 22, 23 |
| FR-8.0 | Real-Time Client-Side Inventory Search | Search bar filters inventory in-browser across code, name, description, and vendor; case-insensitive | 24, 25, 26, 27, 28, 29, 30 |
| FR-9.0 | Server-Side Inventory Filtering | Server accepts search/vendor/low-stock params and queries DB directly | 123, 124, 125 |
| FR-10.0 | Stockout Prevention via Low-Stock Alerts | Server queries items at/below min threshold; dashboard highlights rows with red alert badge | 31, 32, 33 |
| FR-11.0 | Overstock Detection | Each row checked against max ceiling; yellow badge shown when stock exceeds ceiling | 34 |
| FR-12.0 | Warranty Status Visibility | Warranty end date compared to today; colour-coded badge: Expired (red), Active (green), N/A | 35, 36 |
| FR-13.0 | Accurate Available Stock Calculation | Available = total stock − allocated stock; shown in dispatch popup before each transaction | 37 |
| FR-14.0 | Sortable Inventory Table | Column header clicks sort the table; clicking again reverses sort direction | 38, 39 |
| FR-15.0 | Real-Time Inventory Updates via SSE | Live SSE connection auto-refreshes the table when another user makes a change | 40 |
| FR-16.0 | Inventory Item Creation | Admin fills add-item form; server validates required fields, rejects duplicates/negatives/reversed dates | 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51 |
| FR-17.0 | Inventory Item Editing | Admin edits details in modal; server checks reservation values; table refreshes automatically | 52, 53, 54, 55 |
| FR-18.0 | Inventory Item Deletion with Audit Trail | Admin confirms via dialog; deletion logged in audit trail before item is removed | 56, 57, 58 |
| FR-19.0 | Mobile Responsiveness | All pages configured for mobile viewports; hamburger menu via CSS; numeric keyboard on qty fields | 2, 23, 59, 77 |
| FR-20.0 | Form UX and Duplicate Submission Prevention | Submit button disabled immediately on click; all popup fields cleared on each open | 60, 78 |
| FR-21.0 | Overdraft and Allocation Protection on Dispatch | Server checks dispatch qty against available and allocated stock; rolled back fully if breached | 61, 62, 63, 64, 65, 66 |
| FR-22.0 | Dispatch Destination and Purpose Tracking | Destination required for all dispatches; optional purpose/WO note; 8 preset quick-select locations | 67, 68 |
| FR-23.0 | Transaction Input Validation | Qty fields accept only positive integers > 0; browser and server both enforce this rule | 69, 70, 71 |
| FR-24.0 | Concurrency Safety on Dispatch | DB row-level lock (SELECT FOR UPDATE) during dispatch prevents race conditions | 74 |
| FR-25.0 | Stock Replenishment (Restock) | Restock adds to current stock; source/vendor field mandatory; logged as stock addition | 72, 73 |
| FR-26.0 | User Feedback via Toast Notifications | Green toast on success, red on failure; plain-language message; no blocking alert dialogs | 75, 76 |
| FR-27.0 | Tamper-Proof Transaction Metadata | Timestamp set by DB at save time; actor name taken from server-side session (cannot be spoofed) | 79, 80 |
| FR-28.0 | Immutable Audit Trail | History visible to Admin only; no edit/delete buttons in UI; PostgreSQL BEFORE DELETE trigger blocks direct deletion | 81, 82, 83, 84, 85 |
| FR-29.0 | History Filtering and Sorting | History search filters by actor, item code, item name, destination, or purpose; Time/Item columns sortable | 86, 87, 88, 89 |
| FR-30.0 | Server-Side History Pagination | History loads 50 records per page; server returns total/pages; Prev/Next disabled at boundaries | 90, 91, 92 |
| FR-31.0 | CSV Export of Transaction History | Export button downloads current history page as CSV; columns match UI; special chars escaped | 93, 94 |
| FR-32.0 | Cross-Browser Compatibility (Chrome and Firefox) | Standard HTML5/CSS3/ES6 throughout; confirmed working in Chrome and Firefox | 95, 96 |
| FR-33.0 | Safari and iOS Compatibility (Pending) | SameSite cookie policy and date inputs may behave differently on Safari/iOS — **testing pending** | 97 |
| FR-34.0 | Database Connectivity Validation | Server queries live DB for stats: total items, allocated stock, low-stock count, overstock count | 98 |
| FR-35.0 | Production Acceptance and Physical Audit | All automated tests passed; physical warehouse audit against digital figures **required before sign-off** | 99, 100 |
| FR-36.0 | User Registration | Registration form validates username format, min password length, and unique username/email; password bcrypt-hashed | 101, 102, 103, 104, 105 |
| FR-37.0 | Email-Based Login | Login accepts username or email address; single query checks both via OR clause | 106 |
| FR-38.0 | Secure Password Reset Flow | 6-digit code valid 15 min; deleted after one use; unknown emails return same vague response (OWASP anti-enumeration) | 107, 108, 109, 110, 111 |
| FR-39.0 | Stock Allocation Management | Dedicated endpoints for reserve/release per item; prevents over-reservation; every change logged | 112, 113, 114, 115 |
| FR-40.0 | Admin Lockout Management | Admin can view all active lockouts and clear any lockout manually; returns 404 if not found | 116, 117 |
| FR-41.0 | Dark Mode Theme Persistence | Dark mode toggle switches colour scheme instantly; preference saved in localStorage for next visit | 118 |
| FR-42.0 | Per-Item Transaction History | Any authenticated user can view the 50 most recent transactions for a specific item, newest first | 119 |
| FR-43.0 | Dashboard Statistics Cards | Stats cards show live DB counts: total SKUs, overstocked items; auto-updates after changes | 120, 121 |

---

## 4. UAT Test Summary

**Total Test Cases: 125**

| Status | Count |
|---|---|
| ✅ Passed | 123 |
| ⏳ Pending (non-code defects) | 2 |
| ❌ Failed | 0 |

### Passed (123 / 125)
All functional, security, and integration tests passed as of **March 3, 2026**.  
Previously failing frontend features (TC-23, TC-24–30, TC-34, TC-52–54, TC-56–58, TC-67, TC-72–73, TC-75–76, TC-86–94) have been implemented, verified, and confirmed passing.

### Pending (2 / 125)
| TC # | Description | Reason Pending |
|---|---|---|
| TC-97 | Cross-Browser: Safari | Physical Apple device not yet available for testing. Known risk: SameSite cookie handling on iOS Safari. |
| TC-99 | Final System Match | Requires physical warehouse audit to compare shelf counts to digital inventory. |

> These 2 items are **environmental/manual** — there are **no outstanding code defects**.

---

## 5. Key Security Controls

| Control | Implementation |
|---|---|
| SQL Injection Prevention | All DB queries use parameterised statements (`$1`, `$2` placeholders) |
| Password Storage | bcryptjs with salt rounds; plaintext passwords never stored |
| Session Security | express-session with HttpOnly, SameSite=lax, 2-hour maxAge |
| Account Lockout | 5 failed attempts triggers 15-min lockout; auto-resets via rolling window |
| Role Enforcement | `requireAuth` / `requireAdmin` middleware on every protected route |
| Immutable Audit Trail | PostgreSQL BEFORE DELETE trigger blocks audit record deletion |
| Anti-Enumeration | Forgot-password returns identical response for registered and unregistered emails |
| Concurrency Safety | SELECT FOR UPDATE row-level locking prevents race conditions on dispatch |

---

## 6. Outstanding Items Before Production

1. **Safari / iOS Testing (TC-97)** — Test on a physical Apple device; verify session cookie behaviour with SameSite policy.
2. **Physical Warehouse Audit (TC-99)** — Perform a manual count-verification against the live database before final sign-off.

---

*Document generated: March 10, 2026 — StockSense Group 3, BM1*
