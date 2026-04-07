# SafeData QC — Deep Dive Brainstorm Document

## Expanded Ideas for Group Discussion

This document expands on the core SafeData QC concept with **specific, actionable ideas** for your team to discuss and validate.

---

# PART 1: THE REAL-WORLD PROBLEM (Deeper Analysis)

## Understanding the Current Workflow

### How Abuse Cases Are Currently Handled (The Broken Process)

```
CURRENT STATE: Fragmented, Paper-Based, Error-Prone

Step 1: INCIDENT REPORTED
├── Victim walks into barangay hall OR
├── Hotline call to SSDD OR
├── NGO encounters case in field OR
└── Police refers case after intervention
         │
         ▼
Step 2: DROP-IN CENTER (Temporary)
├── Social worker conducts interview
├── PAPER form filled out by hand
├── Documents photocopied (IDs, medical certs)
├── Case assigned a FOLDER NUMBER (physical)
└── Victim waits in temporary shelter (days to weeks)
         │
         ▼
Step 3: ASSESSMENT & REFERRAL  ← 🔴 THIS IS WHERE CASES GET LOST
├── Social worker reviews case
├── Searches for available institution (via phone/text)
├── CALLS multiple NGOs to check bed availability
├── Fills out ANOTHER paper form for referral
├── Physically transports documents OR faxes them
└── No confirmation if receiving institution got the files
         │
         ▼
Step 4: INSTITUTIONAL PLACEMENT
├── Receiving institution RE-INTERVIEWS victim (redundant)
├── Creates THEIR OWN separate file
├── Original drop-in center has NO visibility
└── If victim leaves/transfers, trail goes cold
         │
         ▼
Step 5: FOLLOW-UP (Often Doesn't Happen)
├── No standard protocol for checking outcomes
├── No database linking intake to resolution
└── Success/failure of intervention = UNKNOWN
```

### Pain Points We Can Solve

| Pain Point | Who Suffers | SafeData QC Solution |
|------------|-------------|---------------------|
| Re-interviewing victims | Victims (re-traumatized) | Digital case file follows client |
| Phone tag for bed availability | Social workers (time wasted) | Real-time capacity dashboard |
| Lost paperwork during transfer | Everyone | Cloud-based document continuity |
| No outcome tracking | Government (can't measure success) | End-to-end timeline tracking |
| Manual duplicate checking | Budget office (fraud risk) | Automated identity matching |
| Crisis funds run out unexpectedly | SSDD management | Real-time budget dashboard |

---

# PART 2: SPECIFIC FEATURE IDEAS (For MVP Discussion)

## Feature Set A: Case Intake Module

### A1. Smart Intake Form

**What it does:** Guided digital form that adapts based on case type

**Specific Fields:**

```
BASIC INFORMATION
├── Full Name (with alias option for safety)
├── Age / Date of Birth
├── Sex / Gender
├── Civil Status
├── Address (Barangay-level geocoding)
├── Contact Number (if safe to call)
└── Photo (optional, consent required)

CASE CLASSIFICATION
├── Primary Case Type
│   ├── Physical Abuse
│   ├── Sexual Abuse
│   ├── Psychological/Emotional Abuse
│   ├── Economic Abuse
│   ├── Neglect
│   └── Trafficking
├── Victim Category
│   ├── Child (0-17)
│   ├── Woman
│   ├── Senior Citizen (60+)
│   ├── Person with Disability
│   └── OFW Dependent
└── Relationship to Perpetrator
    ├── Parent/Guardian
    ├── Spouse/Partner
    ├── Relative
    ├── Acquaintance
    ├── Stranger
    └── Authority Figure

INCIDENT DETAILS
├── Date/Time of Incident
├── Location (Barangay dropdown + map pin)
├── Narrative Description (free text)
├── Evidence Uploads (photos, medical certs)
└── Witnesses (optional)

IMMEDIATE NEEDS ASSESSMENT
├── Medical Attention Required? [Y/N]
├── Emergency Shelter Needed? [Y/N]
├── Legal Assistance Needed? [Y/N]
├── Psychological Support Needed? [Y/N]
└── Financial Assistance Needed? [Y/N]
```

**Why this matters:** Standardized intake = comparable data across all agencies

---

### A2. Barangay Geo-Tagging

**What it does:** Every case is tagged to a specific barangay for hotspot analysis

**QC has 142 barangays** — this enables:
- Heat maps showing which barangays have highest abuse rates
- Resource allocation decisions (more social workers where needed)
- Targeted prevention campaigns
- Council members can see their district's data

**Implementation Detail:**
```
User Flow:
1. Social worker types address
2. System auto-suggests barangay from address
3. Option to pin on map for precise location
4. Data feeds into analytics dashboard
```

---

## Feature Set B: Crisis Triage System

### B1. Emergency Assistance Categories (Specific to QC SSDD)

Based on actual SSDD services, here are the crisis assistance types to track:

| Category | Typical Amount | Documentation Required |
|----------|----------------|----------------------|
| **Medical/Hospital Bills** | ₱5,000 - ₱50,000 | Hospital bill, medical abstract, valid ID |
| **Medicines** | ₱500 - ₱5,000 | Prescription, pharmacy quote |
| **Transportation (Medical)** | ₱500 - ₱2,000 | Medical appointment proof |
| **Funeral Assistance** | ₱10,000 - ₱20,000 | Death certificate, funeral contract |
| **Food Packs** | In-kind | Intake assessment |
| **Educational Assistance** | ₱1,000 - ₱5,000 | Enrollment form, school ID |
| **Livelihood Starter Kit** | ₱5,000 - ₱15,000 | Business plan, training certificate |

### B2. Automated Eligibility Scoring

**What it does:** Algorithm scores requests to prioritize limited funds fairly

**Scoring Factors:**

```
ELIGIBILITY SCORE CALCULATION (0-100 points)

URGENCY (40 points max)
├── Life-threatening medical emergency: +40
├── Funeral (within 3 days): +35
├── Medical (non-emergency): +25
├── Food insecurity: +20
├── Educational: +10
└── Livelihood: +5

VULNERABILITY (30 points max)
├── Child victim: +10
├── Senior citizen: +10
├── Person with disability: +10
├── Solo parent: +5
├── OFW dependent: +5
└── Pregnant/lactating: +5

INCOME ASSESSMENT (20 points max)
├── Below poverty line: +20
├── Low income (above poverty, below median): +10
├── Middle income: +0
└── Has regular income source: -5

REPEAT REQUEST MODIFIER (10 points max)
├── First-time request: +10
├── 2nd request (same year): +5
├── 3rd+ request: +0
└── Flagged for potential abuse: -10

TOTAL SCORE → PRIORITY QUEUE PLACEMENT
├── 80-100: CRITICAL (same-day processing)
├── 60-79: HIGH (1-2 day processing)
├── 40-59: MEDIUM (3-5 day processing)
└── Below 40: STANDARD (queue order)
```

### B3. Budget Tracking Dashboard

**Real-time visibility for SSDD management:**

```
┌─────────────────────────────────────────────────────────────┐
│           CRISIS ASSISTANCE FUND TRACKER — APRIL 2026       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   MONTHLY ALLOCATION        DISBURSED           REMAINING   │
│   ₱2,000,000               ₱1,456,780           ₱543,220    │
│                                                              │
│   ███████████████████░░░░░░░░  72.8% USED                   │
│                                                              │
│   ⚠️  At current rate, funds depleted by April 22           │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│   BREAKDOWN BY CATEGORY                                      │
│   ┌────────────────────────────────────────────────────┐    │
│   │ Medical         ██████████████  ₱890,000 (61%)     │    │
│   │ Funeral         █████           ₱280,000 (19%)     │    │
│   │ Transportation  ██              ₱120,500 (8%)      │    │
│   │ Food            ██              ₱98,280 (7%)       │    │
│   │ Educational     █               ₱68,000 (5%)       │    │
│   └────────────────────────────────────────────────────┘    │
│                                                              │
│   PENDING REQUESTS IN QUEUE: 47                              │
│   └── Critical: 3 │ High: 12 │ Medium: 18 │ Standard: 14    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Feature Set C: Referral Network

### C1. Institution Directory with Live Capacity

**What it does:** Real-time view of which shelters/NGOs have space

**Sample Data Structure:**

| Institution | Type | Capacity | Current | Available | Contact |
|-------------|------|----------|---------|-----------|---------|
| QC Haven for Women | Shelter | 50 | 47 | 3 | 0917-XXX |
| Tahanan ng Kabataan | Youth Home | 30 | 30 | 0 ❌ | 0918-XXX |
| Missionaries of Charity | Elderly Care | 40 | 35 | 5 | 0919-XXX |
| GABRIELA Women's Desk | Counseling | N/A | - | ✅ | 0916-XXX |
| PAO QC District | Legal Aid | N/A | - | ✅ | (02) XXX |

**Key Functionality:**
- NGOs update their own capacity daily (simple mobile app)
- Social workers see availability before making calls
- Automatic suggestions based on case type + bed availability

### C2. Digital Referral Workflow

**Current Process:** Phone calls, faxes, hand-carried documents

**SafeData Process:**

```
Step 1: Social worker clicks "Refer Case"
         │
         ▼
Step 2: System shows matching institutions
        (filtered by: case type, capacity, location)
         │
         ▼
Step 3: Social worker selects institution
         │
         ▼
Step 4: Receiving institution gets NOTIFICATION
        └── SMS + Email + In-app alert
         │
         ▼
Step 5: Receiving institution ACCEPTS or DECLINES
        └── If declined, reason logged + next suggestion shown
         │
         ▼
Step 6: Upon acceptance:
        ├── Full case file shared digitally
        ├── Transfer date scheduled
        ├── Both parties see shared timeline
        └── Status updates visible to all stakeholders
```

---

# PART 3: USER ROLES & PERMISSIONS

## Who Uses the System?

| Role | Access Level | Key Actions |
|------|--------------|-------------|
| **SSDD Admin** | Full | Configure system, view all data, manage users, generate city-wide reports |
| **SSDD Supervisor** | Department | Approve high-value disbursements, review cases, assign social workers |
| **Social Worker** | Case-level | Create cases, update status, process assistance, make referrals |
| **Drop-in Center Staff** | Intake only | Create new cases, upload documents, flag emergencies |
| **NGO Partner (Premium)** | Organization | View referred cases, update outcomes, report capacity |
| **NGO Partner (Basic)** | Limited | Receive referrals, mark acceptance |
| **Barangay VAW Desk** | Reporting | Submit field reports, view own submissions |
| **Auditor (read-only)** | All data | View records for compliance checks, cannot modify |

---

# PART 4: DATA PRIVACY CONSIDERATIONS

## Sensitive Data Handling

### What Makes This Data Special

Abuse victim data is among the **most sensitive PII** — mishandling can:
- Endanger victims (perpetrator finds location)
- Re-traumatize through exposure
- Violate RA 10173 (Data Privacy Act)
- Destroy trust in government services

### Privacy-by-Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Need-to-know access** | Social worker sees only their assigned cases |
| **Data minimization** | Only collect what's necessary for service delivery |
| **Anonymization for analytics** | Reports show trends, never individual identities |
| **Consent tracking** | Digital consent form before data collection |
| **Right to erasure** | Victim can request record deletion (with safeguards) |
| **Audit trail** | Every data access logged (who, when, what) |

### Access Control Example

```
CASE #2026-04-00123: Maria Santos (pseudonym)

WHO CAN SEE WHAT:

┌─────────────────────────────────────────────────────────────┐
│ FULL RECORD (Name, Address, Incident Details, Photos)       │
│ ├── Assigned Social Worker: Juan Dela Cruz ✅               │
│ ├── SSDD Supervisor: Ana Reyes ✅                           │
│ └── Others: ❌                                               │
├─────────────────────────────────────────────────────────────┤
│ PARTIAL RECORD (Case #, Type, Status, Barangay only)        │
│ ├── Receiving NGO (upon referral): ✅                       │
│ └── Other SSDD staff: ✅                                    │
├─────────────────────────────────────────────────────────────┤
│ ANONYMIZED (Age range, Abuse type, Barangay, Outcome)       │
│ ├── Analytics Dashboard: ✅                                 │
│ ├── City Council Reports: ✅                                │
│ └── Research Institutions: ✅ (with MOU)                    │
└─────────────────────────────────────────────────────────────┘
```

---

# PART 5: REVENUE MODEL DEEP DIVE

## Option A: Pure Government Contract (B2G)

**Pros:**
- Single large customer = predictable revenue
- Government backing = credibility
- Potential for expansion to other LGUs

**Cons:**
- Slow procurement process (months to years)
- Budget cycles (risk of funding cuts)
- Political changes can affect contracts

**Pricing Approach:**
```
Year 1: ₱800,000 (implementation + license)
Year 2+: ₱500,000/year (maintenance + support)
```

## Option B: Freemium for NGOs + Government License

**Pros:**
- Build user base quickly with free tier
- Upsell premium features
- Diversified revenue

**Cons:**
- NGOs have limited budgets
- Must maintain free tier indefinitely

**Pricing Approach:**
```
Government: ₱500,000/year (enterprise)
NGO Free: Basic case logging, 3 users
NGO Pro: ₱12,000/year (analytics, unlimited users)
```

## Option C: Grant-Funded (Non-Profit Model)

**Pros:**
- Align with social mission
- Access to philanthropic funding
- Tax benefits

**Cons:**
- Dependent on grant cycles
- Must prove impact continuously

**Potential Funders:**
- USAID (governance programs)
- World Bank (social protection projects)
- Local foundations (Ayala Foundation, PLDT-Smart Foundation)

---

# PART 6: MVP SCOPE DISCUSSION

## What to Build First?

### Option 1: Crisis Triage MVP
Focus: Help SSDD process emergency assistance faster
- Intake form for crisis requests
- Auto-scoring algorithm
- Budget tracking dashboard
- Basic reporting

**Timeline:** 3-4 months
**Why:** Immediate pain point, visible results, daily use

### Option 2: Case Tracking MVP
Focus: End-to-end abuse case documentation
- Full intake form
- Referral workflow
- Institution directory
- Timeline of care view

**Timeline:** 5-6 months
**Why:** Core mission, differentiator, but more complex

### Option 3: Analytics-First MVP
Focus: Demonstrate data value to government
- Import existing paper records (data entry)
- Hotspot mapping
- Demographic dashboards
- Monthly reports

**Timeline:** 2-3 months
**Why:** Quick win, proves concept, but doesn't solve workflow

### Recommended: Hybrid Approach

```
PHASE 1 (Month 1-3): Crisis Triage Module
├── Build quick wins
├── Daily usage = adoption
└── Prove value to SSDD

PHASE 2 (Month 4-6): Case Intake + Basic Referral
├── Expand to abuse documentation
├── Connect to crisis module
└── Pilot with 2-3 NGOs

PHASE 3 (Month 7-9): Analytics + Reporting
├── Layer analytics on accumulated data
├── First hotspot reports
└── Pitch for city-wide rollout
```

---

# PART 7: QUESTIONS FOR YOUR GROUP

## Strategic Questions

1. **Who is your primary champion?**
   - Do you have a contact at SSDD who can be an internal advocate?
   - Can StartUp QC facilitate an introduction?

2. **Pilot scope:**
   - Start with 1 barangay? 1 district? City-wide?
   - How many social workers in initial pilot?

3. **Existing data:**
   - Are there paper records that could be digitized?
   - Would SSDD share sample (anonymized) data for testing?

## Technical Questions

4. **Offline capability:**
   - Do social workers need to log cases in areas with poor connectivity?
   - If yes, offline-first PWA required

5. **Integration requirements:**
   - Does SSDD use any existing software?
   - Any government systems we need to connect to?

6. **Hosting:**
   - Cloud (AWS/Azure) vs. Government Data Center?
   - Data sovereignty concerns?

## Business Questions

7. **Sustainability:**
   - Grant-funded or revenue-generating?
   - If revenue: who pays? LGU budget or NGO partners?

8. **Expansion:**
   - Quezon City only, or design for multi-LGU from start?
   - Opportunity in other Metro Manila cities?

---

# PART 8: COMPETITIVE DIFFERENTIATION

## Why SafeData QC Wins

| Factor | Generic CRM | International Platforms | SafeData QC |
|--------|-------------|------------------------|-------------|
| Filipino context | ❌ | ❌ | ✅ Designed for LGU/NGO workflows |
| RA 10173 compliance | ❌ | Partial | ✅ Built-in |
| Tagalog/Filipino UI | ❌ | ❌ | ✅ |
| Barangay-level geo | ❌ | ❌ | ✅ All 142 QC barangays |
| SSDD workflow fit | ❌ | ❌ | ✅ Modeled on actual processes |
| Affordable for LGU | ❌ (expensive) | ❌ (USD pricing) | ✅ Peso-based, grant-eligible |
| Local support | ❌ | ❌ | ✅ QC-based team |

---

# PART 9: REAL-WORLD SCENARIO WALKTHROUGHS

## Scenario 1: Child Abuse Case

```
DAY 1 - 9:00 AM
├── 8-year-old boy brought to QC Drop-in Center by teacher
├── Teacher reports suspected physical abuse by stepfather
└── Drop-in staff logs into SafeData QC

DAY 1 - 9:15 AM (INTAKE)
├── Staff creates new case
├── Case Type: Physical Abuse
├── Victim Category: Child
├── Barangay: Commonwealth
├── Photos of bruises uploaded (with consent)
├── Immediate needs flagged: Medical ✅, Shelter ✅
└── System assigns Case #2026-04-00456

DAY 1 - 9:30 AM (TRIAGE)
├── Case auto-scored: 92/100 (CRITICAL)
├── Medical referral generated to QC General Hospital
├── SSDD social worker notified via SMS
└── Case appears in supervisor's priority queue

DAY 1 - 11:00 AM (ASSESSMENT)
├── Social worker interviews boy
├── Risk assessment completed in system
├── Perpetrator details logged (for police report)
└── Case linked to Women & Children Protection Unit

DAY 1 - 3:00 PM (REFERRAL)
├── Social worker clicks "Find Placement"
├── System shows: Tahanan ng Kabataan (0 beds ❌)
├── System shows: Bahay Pag-Asa (3 beds ✅)
├── Social worker selects Bahay Pag-Asa
└── NGO receives notification + case summary

DAY 2 - 10:00 AM (TRANSFER)
├── Bahay Pag-Asa confirms acceptance in system
├── Transfer scheduled for 2:00 PM
├── All documents already visible to receiving institution
└── No re-interview needed

DAY 30 (FOLLOW-UP)
├── System prompts social worker for 30-day check-in
├── NGO updates: Boy enrolled in school, therapy ongoing
├── Status: "In Care - Stable"
└── Case remains open until reintegration or permanency

DAY 180 (OUTCOME)
├── Boy reintegrated with biological mother
├── Case closed with outcome: "Successful Reintegration"
└── Data feeds into analytics: +1 child abuse case resolved
```

## Scenario 2: Crisis Assistance Request

```
MONDAY 8:30 AM
├── Elderly woman (67) arrives at SSDD
├── Requests help for husband's hospital bill
├── Husband had stroke, now in QC General ICU
└── Family has no savings, sole income was husband

MONDAY 8:45 AM (INTAKE)
├── Crisis request created in SafeData QC
├── Category: Medical Emergency
├── Amount requested: ₱45,000 (hospital bill)
├── Documentation uploaded: Hospital bill, senior ID
└── Income verification: Below poverty line

MONDAY 8:50 AM (AUTO-SCORING)
├── Urgency: +40 (life-threatening)
├── Vulnerability: +10 (senior) + 5 (dependent spouse)
├── Income: +20 (below poverty)
├── First-time request: +10
├── TOTAL: 85/100 → CRITICAL
└── Queued for same-day processing

MONDAY 10:00 AM (REVIEW)
├── Supervisor reviews case
├── Verifies hospital bill is legitimate (calls hospital)
├── Checks for duplicates: None found
└── APPROVED for ₱45,000

MONDAY 11:30 AM (DISBURSEMENT)
├── Check prepared for direct payment to hospital
├── Woman signs receipt (logged in system)
├── System updates budget tracker: -₱45,000
└── Case marked: "Assistance Provided"

MONDAY 12:00 PM (DASHBOARD UPDATE)
├── SSDD manager sees updated fund balance
├── Alert: "Fund at 78% for the month"
└── Data logged for monthly report
```

---

# PART 10: TECHNICAL SPECIFICATIONS PREVIEW

## Database Schema (Simplified)

```sql
-- Core Tables
CASES
├── case_id (PK)
├── case_number (unique, formatted: YYYY-MM-XXXXX)
├── case_type (enum: physical, sexual, psychological, economic, neglect, trafficking)
├── status (enum: intake, assessment, referred, in_care, closed)
├── created_at, updated_at
└── assigned_worker_id (FK → users)

VICTIMS
├── victim_id (PK)
├── case_id (FK → cases)
├── full_name (encrypted)
├── alias (for safety)
├── date_of_birth
├── sex, civil_status
├── address_barangay_id (FK → barangays)
├── contact_number (encrypted)
└── category (enum: child, woman, senior, pwd, ofw_dependent)

PERPETRATORS
├── perpetrator_id (PK)
├── case_id (FK → cases)
├── relationship_to_victim
├── full_name (encrypted)
└── status (enum: at_large, detained, unknown)

CRISIS_REQUESTS
├── request_id (PK)
├── case_id (FK → cases, nullable if standalone)
├── category (enum: medical, funeral, transportation, food, educational, livelihood)
├── amount_requested
├── amount_approved
├── priority_score
├── status (enum: pending, approved, denied, disbursed)
└── disbursement_date

REFERRALS
├── referral_id (PK)
├── case_id (FK → cases)
├── from_institution_id (FK → institutions)
├── to_institution_id (FK → institutions)
├── status (enum: pending, accepted, declined, transferred)
├── transfer_date
└── notes

INSTITUTIONS
├── institution_id (PK)
├── name
├── type (enum: shelter, hospital, legal_aid, counseling, etc.)
├── capacity (nullable)
├── current_occupancy
├── contact_person, contact_number
└── is_active

BARANGAYS
├── barangay_id (PK)
├── name
├── district
├── population
└── geolocation (lat, lng)

USERS
├── user_id (PK)
├── email, password_hash
├── role (enum: admin, supervisor, social_worker, ngo_partner, etc.)
├── institution_id (FK, nullable)
└── is_active, last_login

AUDIT_LOG
├── log_id (PK)
├── user_id (FK → users)
├── action (enum: create, read, update, delete)
├── table_name, record_id
├── timestamp
└── ip_address
```

---

# NEXT STEPS FOR YOUR GROUP

1. **Validate the problem:**
   - Can anyone arrange an informal chat with an SSDD social worker?
   - What are their biggest daily frustrations?

2. **Define MVP scope:**
   - Which module resonates most with the team?
   - What can you realistically build in 3-4 months?

3. **Assign ownership:**
   - Who talks to government stakeholders?
   - Who leads technical architecture?
   - Who handles StartUp QC application?

4. **Create user stories:**
   - "As a social worker, I want to..."
   - "As an SSDD supervisor, I need to..."

---

*This brainstorm document is for internal team discussion. Version 1.0 — April 2026*
