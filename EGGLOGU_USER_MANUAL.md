# EGGlogU User Manual

**Version 6.0 | Comprehensive Poultry Farm Management SaaS Platform**

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard](#2-dashboard)
3. [Flock Management](#3-flock-management)
4. [Production Tracking](#4-production-tracking)
5. [Feed Management](#5-feed-management)
6. [Financial Module](#6-financial-module)
7. [Health Module](#7-health-module)
8. [Biosecurity](#8-biosecurity)
9. [Traceability](#9-traceability)
10. [Personnel & Operations](#10-personnel--operations)
11. [Clients](#11-clients)
12. [Environment](#12-environment)
13. [Analytics & Predictions](#13-analytics--predictions)
14. [Production Planning](#14-production-planning)
15. [Campo Mode & Vet Mode](#15-campo-mode--vet-mode)
16. [Settings & Configuration](#16-settings--configuration)
17. [Data Management](#17-data-management)
18. [Troubleshooting](#18-troubleshooting)
19. [Billing & Subscription](#19-billing--subscription)
20. [Support](#20-support)
21. [Admin Panel](#21-admin-panel)

---

## 1. Getting Started

### What is EGGlogU?

EGGlogU is a cloud-based SaaS platform for managing poultry farms, with full offline capabilities. Your data is securely stored on the server and syncs between all your devices via **api.egglogu.com**. When you are offline, EGGlogU continues working using a local IndexedDB cache and automatically syncs your changes when connectivity is restored.

### Getting Started

1. Visit **[egglogu.com](https://egglogu.com)** in any modern browser.
2. Create an account or sign in (see **First Login** below).
3. You will automatically start a **30-day free Enterprise trial** -- no credit card required.
4. All your data syncs between devices via **api.egglogu.com**.

**Installing as a PWA (optional):**

- **Desktop (Chrome, Firefox, Edge):** Click the install icon in the address bar or browser prompt to add EGGlogU to your desktop.
- **Mobile (Android/iOS):** Tap the browser menu and select "Add to Home Screen". The app appears as a native-looking icon on your device.
- Once installed as a PWA, the app works offline and syncs when back online.

### First Login

On first visit, you will see the login/registration screen. You have several options to create your account:

**Email & Password:**
1. Enter your email address and choose a password.
2. A verification email is sent via Resend -- you must verify your email before accessing the platform.
3. Check your inbox (and spam folder) for the verification link.

**Social Sign-In:**
- **Google OAuth** -- Sign in with your Google account.
- **Apple Sign-In** -- Sign in with your Apple ID.
- **Microsoft Identity** -- Sign in with your Microsoft account.

**Offline PIN:**
- After initial login, you can set up a local PIN for quick offline access on the same device.

Your account includes a **30-day free Enterprise trial** with access to all features, unlimited farms, flocks, and users. After the trial, choose a plan that fits your operation (see [Section 19: Billing & Subscription](#19-billing--subscription)).

### Language Selection

EGGlogU supports 8 languages:

| Code | Language   |
|------|------------|
| es   | Spanish    |
| en   | English    |
| pt   | Portuguese |
| fr   | French     |
| de   | German     |
| it   | Italian    |
| ja   | Japanese   |
| zh   | Chinese    |

Use the language selector at the bottom of the sidebar to switch languages. The change applies immediately to all labels, buttons, and catalog items.

### Navigation

The sidebar (left panel) provides access to all modules:
- **Dashboard** -- Overview and KPIs
- **Flocks** -- Flock registry
- **Production** -- Daily egg collection
- **Feed** -- Purchases and consumption
- **Health** -- Vaccines, medications, outbreaks, stress events
- **Clients** -- Buyer/customer management
- **Finances** -- Income, expenses, receivables
- **Analytics** -- Charts, predictions, comparisons
- **Operations** -- Checklist, logbook, personnel
- **Biosecurity** -- Visitors, zones, pests, protocols
- **Traceability** -- Egg batches and QR codes
- **Planning** -- Production forecasts
- **Environment** -- Temperature, humidity, IoT
- **Settings** -- Farm config, themes, data management

On mobile, tap the hamburger icon (top-left) to open the sidebar.

### Keyboard Shortcuts

- **Escape**: Close any open modal or dialog.
- **Tab / Shift+Tab**: Navigate between form fields within modals (with focus trapping).
- **Enter / Space**: Activate sidebar navigation items.

---

## 2. Dashboard

The Dashboard is the first screen you see after login. It provides a real-time overview of your entire operation.

### KPI Cards

Eight key performance indicators are displayed at the top:

| KPI | Description | Alert Thresholds |
|-----|-------------|------------------|
| **Production Today** | Total eggs collected today across all flocks | -- |
| **Hen-Day Rate** | (Eggs today / Active hens) x 100 | Red if < 50%, Yellow if < 70% |
| **FCR** | Feed Conversion Ratio over last 30 days (kg feed / kg eggs) | Red if > 3.0, Yellow if > 2.5 |
| **Mortality** | Cumulative mortality percentage | Configurable threshold (default 5%) |
| **Cost per Egg** | Total expenses / Total eggs collected | -- |
| **Net Income** | Current month income minus expenses | -- |
| **Active Hens** | Total living hens across all active flocks | -- |
| **Alerts** | Number of active alerts | -- |

Each KPI card shows a trend indicator (up/down arrow) comparing to the previous snapshot.

### Alerts Panel

Alerts are generated automatically based on:
- **Overdue vaccines** (past scheduled date without being applied)
- **Upcoming vaccines** (within configurable "alert days" window)
- **Low feed stock** (below minimum threshold)
- **High mortality** (above maximum threshold)
- **Active outbreaks** (any outbreak with status "Active")
- **Medication withdrawal periods** (eggs cannot be sold during withdrawal)
- **Overdue zone disinfection** (biosecurity zones past their schedule)
- **Unresolved pest sightings**
- **Cross-contamination risk** (visitors from farms with outbreaks in last 7 days)

### Recommendations Engine

The app analyzes your data and generates actionable recommendations:
- Check diet if FCR exceeds 2.4
- Investigate mortality spikes (48-hour comparison)
- Flock performing below breed production curve
- Purchase feed if stock covers less than 7 days
- Record environmental readings if none in 3 days
- Disinfect overdue biosecurity zones
- Heat stress management if THI is high for 2+ consecutive readings

### Weather Widget

If you configure an OpenWeatherMap API key in Settings, the dashboard displays:
- Current temperature and conditions
- Temperature-Humidity Index (THI) for heat stress detection
- THI > 28 triggers a heat stress alert

### KPI Snapshots

Click "Save Snapshot" to record the current KPI values. This creates a historical record you can review in the snapshot history table at the bottom of the dashboard. Snapshots help you track trends over time.

### 30-Day Trend Chart

A dual-axis line chart shows:
- **Left axis**: Daily egg production over the last 30 days
- **Right axis**: Hen-Day percentage

**Practical Example:**
> You notice the Hen-Day rate dropped from 85% to 72% over the last week. Check the Alerts panel -- you might see an overdue vaccine or an active outbreak. Navigate to the Health module to investigate.

**Tips:**
- Save a KPI snapshot at the end of each day to build a meaningful historical record.
- Review alerts daily -- they catch issues that are easy to miss on busy days.

---

## 3. Flock Management

The Flocks module is the foundation of EGGlogU. Every other module references flocks.

### Adding a Flock

Click "Add Flock" and fill in:

| Field | Description | Required |
|-------|-------------|----------|
| **Name** | Descriptive name (e.g., "Barn A - ISA Brown 2025") | Yes |
| **Breed** | Select from 16 commercial breeds | Yes |
| **Count** | Initial number of hens | Yes |
| **Status** | Rearing / Growing / Production / Culled | Yes |
| **Birth Date** | Hatch date (determines age and vaccine schedule) | Yes |
| **Purchase Date** | When you acquired the birds | No |
| **Housing** | Floor / Cage / Free Range | No |
| **Supplier** | Where you purchased the birds | No |
| **Cost** | Purchase cost | No |

### Supported Breeds (16)

| Breed | Eggs/Year | Egg Color | Egg Weight | FCR |
|-------|-----------|-----------|------------|-----|
| Leghorn Blanca | 280-320 | White | 55-60g | 2.0-2.1 |
| ISA Brown | 300-320 | Brown | 60-65g | 2.0-2.2 |
| Hy-Line Brown | 300-330 | Brown | 60-65g | 2.0-2.2 |
| Lohmann Brown | 300-320 | Brown | 62-64g | 2.0-2.2 |
| Novogen Brown | 290-310 | Brown | 62-64g | 2.1-2.3 |
| Bovans Brown | 300-315 | Brown | 62-64g | 2.0-2.2 |
| Shaver White | 300-315 | White | 60-62g | 2.0-2.2 |
| Hy-Line W-36 | 310-330 | White | 58-61g | 1.9-2.1 |
| Barred Plymouth Rock | 200-250 | Brown | 55-60g | 2.5-2.8 |
| Dekalb White | 290-330 | White | 60-63g | 2.0-2.2 |
| Tetra SL | 280-310 | Brown | 60-62g | 2.1-2.3 |
| Rhode Island Red | 250-300 | Brown | 56-60g | 2.3-2.5 |
| Araucana | 180-230 | Blue/Green | 50-55g | 2.5-2.8 |
| Mapuche/Collonca | 160-200 | Blue/Green | 48-52g | 2.6-3.0 |
| Black Copper Maran | 150-200 | Dark Brown | 60-65g | 2.8-3.2 |
| Other (Custom) | -- | -- | -- | -- |

When you select a breed, the app displays detailed breed information (eggs/year, egg color, weight, FCR, notes).

### Breed Production Curves

Each breed has a built-in Hen-Day percentage curve from week 18 to week 80. These curves are used for:
- Comparing actual vs. expected production in Analytics
- Generating production forecasts in Planning
- Triggering recommendations when your flock underperforms

### Lifecycle Stages

EGGlogU automatically tracks each flock through 8 lifecycle stages based on age:

| Stage | Weeks | Key Info |
|-------|-------|----------|
| Chick | 0-4 | Starter feed, 33-35C, first vaccinations |
| Brooding | 4-8 | Grower feed, temperature reduction to 25C |
| Growing | 8-16 | Developer feed, skeleton growth |
| Pre-lay | 16-18 | Pre-lay feed, light stimulation begins |
| Peak Lay | 18-35 | Layer Phase 1 feed, peak production 90%+ |
| Mid Lay | 35-55 | Layer Phase 2 feed, gradual decline |
| Low Lay | 55-75 | Layer Phase 3 feed, production below 70% |
| Culled | 75+ | End of productive cycle |

### Flock Roadmap

Click the "Roadmap" button on any flock to see:
- A visual lifecycle progress bar
- Detailed cards for each stage (feed type, temperature range, production level, milestones)
- The complete vaccine timeline with status indicators

### Health Score

Each flock receives a composite health score (0-100) calculated from:
- **Mortality (30%)**: Penalizes cumulative death percentage
- **Production (30%)**: Rewards consistent egg output relative to hens
- **FCR (20%)**: Penalizes high feed conversion ratios
- **Outbreaks (20%)**: Heavily penalizes active outbreaks

Color coding: Green (70+), Yellow (40-69), Red (below 40).

### Active Hen Count

The system automatically calculates active hens by subtracting recorded deaths (from daily production) and outbreak deaths from the initial flock count. You never need to manually update the hen count.

**Practical Example:**
> You register a flock "Barn B - Hy-Line Brown" with 5,000 hens, birth date 2025-09-15. The app:
> 1. Calculates the flock is 22 weeks old (Peak Lay stage).
> 2. Shows expected Hen-Day of ~92% based on the Hy-Line Brown curve.
> 3. Auto-generates a vaccine calendar with 9 scheduled vaccinations.
> 4. Displays the breed info: 300-330 eggs/year, brown eggs, 60-65g.

**Tips:**
- Always enter the birth date -- it drives the vaccine schedule, lifecycle tracking, and production curve comparisons.
- Use descriptive names that include the barn/house and breed for easy identification.
- When a flock reaches end-of-lay, change its status to "Culled" to exclude it from production KPIs.

---

## 4. Production Tracking

The Production module is where you record daily egg collection.

### Recording Daily Production

Click "Add Production" and fill in:

| Field | Description |
|-------|-------------|
| **Date** | Collection date (defaults to today) |
| **Flock** | Select which flock |
| **Eggs Collected** | Total eggs for this entry |
| **Size Grading** | S / M / L / XL / Jumbo counts |
| **Shell Color** | White / Brown / Cream |
| **Yolk Quality** | Score 1-10 |
| **Egg Type** | Conventional / Free Range / Organic / Pasture Raised / Decorative |
| **Market Channel** | Wholesale / Supermarket / Restaurant / Direct Sale / Export / Pasteurized |
| **Broken/Defective** | Number of broken or defective eggs |
| **Deaths** | Number of deaths with cause |

### Size Grading

The 5 egg sizes follow industry standards:

| Size | Approximate Weight |
|------|-------------------|
| S (Small) | < 53g |
| M (Medium) | 53-63g |
| L (Large) | 63-73g |
| XL (Extra Large) | 73-83g |
| Jumbo | > 83g |

### Death Causes

When recording deaths, select from 9 predefined causes:
Disease, Predator, Heat Stroke, Suffocation, Cannibalism, Prolapse, Age/Natural, Accident, Unknown.

### Filtering

Use the filter bar to view production records by:
- Specific flock
- Date range (from/to)

### Shell Color Auto-Detection

When you select a flock, the app automatically fills in the expected shell color based on the breed (e.g., ISA Brown = Brown, Leghorn = White, Araucana = Cream).

**Practical Example:**
> Morning collection from Barn A: 4,200 eggs total.
> - S: 100, M: 800, L: 2,500, XL: 700, Jumbo: 100
> - Broken: 35
> - Deaths: 2 (1 Disease, 1 Unknown)
> - Egg Type: Conventional
> - Market Channel: Wholesale

**Tips:**
- Record production at the same time each day for consistent Hen-Day calculations.
- Track size grading to identify if your flock is trending toward smaller eggs (may indicate feed or health issues).
- The yolk quality score (1-10) helps monitor feed quality -- a sustained drop may signal nutritional deficiencies.
- Deaths recorded here automatically reduce the flock's active hen count.

---

## 5. Feed Management

The Feed module tracks purchases and daily consumption to calculate FCR and monitor stock levels.

### Feed Stock KPIs

The module header shows 4 KPIs:
- **Current Stock**: Purchases minus consumption (in kg)
- **Total Purchased**: All-time purchases in kg and monetary value
- **Total Consumed**: All-time consumption in kg
- **FCR (30-day)**: Feed Conversion Ratio calculated as (total feed kg / total egg weight kg)

### Feed Types (7 Stages)

The app includes lifecycle-aware feed types that match each growth stage:

| Feed Type | Stage | Weeks | Protein |
|-----------|-------|-------|---------|
| Starter | Chick | 0-6 | 20-22% |
| Grower | Brooding/Growing | 6-12 | 18-19% |
| Developer | Growing | 12-16 | 15-16% |
| Pre-lay | Pre-lay | 16-18 | 17-18% |
| Layer Phase 1 | Peak Lay | 18-45 | 18-19% |
| Layer Phase 2 | Mid Lay | 45-65 | 16-17% |
| Layer Phase 3 | Low Lay | 65+ | 15-16% |

When recording consumption for a specific flock, the app marks the recommended feed type for the flock's current lifecycle stage with a star symbol.

### Tab: Purchases

Click "Add Purchase" to record:

| Field | Description |
|-------|-------------|
| **Date** | Purchase date |
| **Feed Type** | Select from 7 types |
| **Quantity (kg)** | Amount purchased |
| **Cost** | Total cost |
| **Supplier** | Select from your configured suppliers |

The table shows each purchase with an automatic $/kg calculation.

### Tab: Consumption

Click "Add Consumption" to record:

| Field | Description |
|-------|-------------|
| **Date** | Consumption date |
| **Flock** | Which flock consumed the feed |
| **Quantity (kg)** | Amount consumed |
| **Feed Type** | Type of feed (with lifecycle recommendation) |

### FCR Calculation

FCR = Total Feed (kg) / Total Egg Weight (kg)

The app assumes an average egg weight of 60g (0.06 kg) for this calculation. Industry benchmarks:
- Excellent: < 2.0
- Good: 2.0 - 2.2
- Acceptable: 2.2 - 2.5
- Poor: > 2.5
- Critical: > 3.0 (displayed in red)

**Practical Example:**
> You purchased 2,000 kg of Layer Phase 1 feed from "AviFeed S.A." for $800.
> Over the next 10 days, you consume 200 kg/day for Flock A (5,000 hens).
> The FCR KPI shows 2.1 -- within the good range for ISA Brown hens.

**Tips:**
- Set a minimum feed stock threshold in Settings (default 50 kg). The dashboard will alert you when stock drops below this level.
- Always assign consumption to the correct flock for accurate per-flock FCR tracking.
- The recommended feed type indicator helps ensure you are feeding the right formulation for each flock's age.

---

## 6. Financial Module

The Financial module provides complete income, expense, receivables tracking, and financial summaries.

### Tab: Income

Record income from 4 sources:

| Type | Description |
|------|-------------|
| **Egg Sales** | Revenue from selling eggs |
| **Bird Sales** | Revenue from selling live birds |
| **Manure Sales** | Revenue from selling manure/fertilizer |
| **Other** | Miscellaneous income |

Income form fields: Date, Type, Client, Quantity, Unit Price, Amount, Notes.

### Tab: Expenses

Track expenses in 6 categories, each with predefined descriptions:

| Category | Example Descriptions |
|----------|---------------------|
| **Feed** | Layer feed, Starter feed, Supplements, Additives |
| **Vaccines** | Newcastle vaccine, Gumboro vaccine, Marek vaccine, Other vaccines |
| **Transport** | Egg distribution, Feed pickup, Bird transfer |
| **Labor** | Salaries, Overtime, Bonuses |
| **Infrastructure** | Barn repair, Equipment, Nest boxes, Waterers, Utilities |
| **Other** | Consulting, Miscellaneous |

Expense form fields: Date, Category, Description, Amount, Notes.

### Tab: Receivables

Track unpaid invoices and pending payments:
- Record amounts owed by clients
- Mark as paid/unpaid
- Filter by payment status
- Monitor outstanding balances

### Tab: Summary

The financial summary provides:
- **Monthly Breakdown**: Income vs. Expenses by month
- **Cost per Egg**: Total expenses / Total eggs produced
- **Break-even Point**: How many eggs you need to sell to cover costs
- **Expense by Category**: Pie chart showing expense distribution
- **CSV Export**: Download all financial data as a spreadsheet

### Currency

The app uses the locale-appropriate currency format based on your selected language.

**Practical Example:**
> January summary:
> - Income: $12,500 (Egg sales $11,000, Manure $1,500)
> - Expenses: $8,200 (Feed $5,000, Labor $2,000, Vaccines $500, Infrastructure $700)
> - Net: $4,300
> - Cost per Egg: $0.068
> - Break-even: 120,588 eggs/month

**Tips:**
- Use the Receivables tab to track clients who buy on credit. Mark invoices as paid when you receive payment.
- Export CSV monthly for your accountant or tax records.
- The cost-per-egg metric is one of the most important numbers for profitability -- monitor it weekly.
- Link income entries to specific clients for accurate per-client reporting.

---

## 7. Health Module

The Health module tracks vaccines, medications, disease outbreaks, and stress events across 4 tabs.

### Tab: Vaccines

#### Automatic Vaccine Calendar

When you create a flock with a birth date, EGGlogU auto-generates a vaccine schedule based on the industry-standard protocol:

| Vaccine | Age (Days) | Route |
|---------|-----------|-------|
| Marek | 1 | Injection |
| Newcastle + Infectious Bronchitis | 6 | Ocular |
| Gumboro (IBD) | 14 | Water |
| Newcastle booster | 21 | Water |
| Avian Pox | 49 | Wing web |
| Avian Encephalomyelitis | 63 | Water |
| Infectious Coryza | 77 | Injection |
| Salmonella | 91 | Injection |
| Newcastle + IB pre-lay | 112 | Injection |

You can also click "Generate Vaccines" to create calendars for multiple flocks at once.

#### Vaccine Status

Each vaccine has a status:
- **Pending**: Scheduled but not yet applied
- **Overdue**: Past the scheduled date without being applied (triggers alert)
- **Applied**: Marked as administered

Click "Mark Applied" to record that a vaccine was administered today.

#### Filtering

Filter vaccines by flock and/or status (Pending, Overdue, Applied).

### Tab: Medications

Record medication treatments with withdrawal period tracking:

| Field | Description |
|-------|-------------|
| **Flock** | Which flock is being treated |
| **Medication** | Select from 8 predefined medications |
| **Reason** | Select from 14 diseases |
| **Dosage** | Free text for dosage instructions |
| **Start Date** | When treatment began |
| **End Date** | When treatment ends |
| **Withdrawal Days** | Auto-filled based on medication selection |

**Built-in Medications with Withdrawal Periods:**

| Medication | Withdrawal Days |
|------------|----------------|
| Enrofloxacin | 7 |
| Amoxicillin | 5 |
| Toltrazuril | 14 |
| Ivermectin | 14 |
| Tylosin | 5 |
| Oxytetracycline | 7 |
| Vitamin AD3E | 0 |
| Electrolytes | 0 |

The withdrawal end date is automatically calculated (End Date + Withdrawal Days). During withdrawal, the dashboard shows an alert and eggs from that flock should not be sold for human consumption.

### Tab: Outbreaks

Track disease outbreaks with:

| Field | Description |
|-------|-------------|
| **Flock** | Affected flock |
| **Disease** | Select from 14 tracked diseases |
| **Start/End Date** | Duration of outbreak |
| **Affected** | Number of birds affected |
| **Deaths** | Number of deaths from outbreak |
| **Economic Loss** | Monetary impact |
| **Status** | Active / Controlled / Resolved |
| **Symptoms** | Clinical observations |
| **Treatment** | Treatment protocol used |

**14 Tracked Diseases:**
Newcastle, Gumboro (IBD), Infectious Bronchitis, Coccidiosis, Marek, Salmonellosis, Infectious Coryza, Avian Pox, Avian Influenza, Mycoplasmosis, Laryngotracheitis, Colibacillosis, Aspergillosis, Histomoniasis.

### Tab: Stress Events

Record environmental or management stress events that may affect production. Stress events feed into the outbreak risk classifier (see Analytics).

### Outbreak Risk Classifier

The app includes an AI-like sigmoid-based outbreak risk calculator that weighs 7 factors:

| Factor | Weight | What It Measures |
|--------|--------|-----------------|
| Mortality spike | 25% | 7-day death rate |
| FCR deterioration | 15% | Feed conversion above 2.0 |
| THI stress | 15% | Temperature-Humidity Index > 28 |
| Production drop | 20% | Declining egg production trend |
| Active outbreaks | 10% | Number of unresolved outbreaks |
| Vaccination gaps | 10% | Number of overdue vaccines |
| Stress events | 5% | Recent stress events in 7 days |

Output: A probability (0-100%) and classification (Outbreak Likely / Outbreak Unlikely).

**Practical Example:**
> Flock B shows 3% mortality in the last 7 days, FCR jumped to 2.8, and 2 vaccines are overdue.
> The outbreak risk classifier returns 68% probability -- "Outbreak Likely".
> Recommendation: Submit lab samples immediately, check feed quality, apply overdue vaccines.

**Tips:**
- When you select a medication, the withdrawal days auto-fill. Do not skip this -- selling eggs during withdrawal can have legal consequences.
- Mark outbreaks as "Controlled" when mortality stops, then "Resolved" when the flock returns to normal production.
- Generate vaccine calendars immediately after creating a flock to never miss a schedule.

---

## 8. Biosecurity

The Biosecurity module protects your farm through visitor control, zone management, pest tracking, and protocol compliance.

### Pest Risk Score

A composite score (0-100) displayed at the top, calculated from:
- Number of unresolved pest sightings (up to 40 points)
- Severity of unresolved pests (up to 20 points)
- Red/yellow risk zones (15 points per red, 5 per yellow)
- Overdue zone disinfections (10 points each)

Lower score = better biosecurity. Score > 60 displays in red (danger).

### Tab: Visitors

Every person entering the farm should be logged:

| Field | Description |
|-------|-------------|
| **Date** | Visit date |
| **Name** | Visitor name |
| **Company** | Company/organization |
| **Purpose** | Feed delivery, Technical service, Health inspection, Egg collection, Vet visit, Maintenance, Other |
| **Zone** | Which farm zone they accessed |
| **Vehicle Plate** | Vehicle registration number |
| **Disinfected** | Whether they went through disinfection protocol |
| **From Farm** | Internal or External origin |
| **Farm Health Status** | Healthy / Outbreak / Unknown |

**Cross-Contamination Detection:** If a visitor comes from a farm with an active outbreak, the row is highlighted in orange with a warning icon. This also triggers a dashboard alert for 7 days.

### Tab: Zones

Define physical areas of your farm with biosecurity classification:

| Field | Description |
|-------|-------------|
| **Name** | Zone name (e.g., "House A", "Feed Storage", "Quarantine") |
| **Risk Level** | Green (low) / Yellow (medium) / Red (high) |
| **Last Disinfection** | Date of last disinfection |
| **Frequency (days)** | How often disinfection should occur |

Zones display as color-coded cards. An "OVERDUE" warning appears when a zone is past its disinfection schedule.

### Tab: Pests

Track pest sightings with a visual timeline:

| Field | Description |
|-------|-------------|
| **Date** | When pest was spotted |
| **Type** | Rodent / Fly / Wild Bird / Other |
| **Location** | Select from your defined zones |
| **Severity** | 1-5 stars |
| **Action Taken** | Description of response |

Each sighting can be marked as "Resolved" once the issue is addressed. Unresolved sightings appear in the pest risk score and trigger dashboard alerts.

### Tab: Protocols

Define recurring biosecurity protocols:

| Field | Description |
|-------|-------------|
| **Name** | Select from: Barn Disinfection, Footbath, Rodent Control, Fumigation, Waterer Cleaning, Feeder Cleaning, Deratization, Sanitary Void |
| **Frequency** | Daily / Weekly / Monthly |
| **Checklist Items** | Line-by-line tasks for the protocol |

Click "Complete" to mark a protocol as executed today. An "OVERDUE" badge appears when a protocol is past due based on its frequency.

**Practical Example:**
> Zone "House A" is set to Red risk with weekly disinfection.
> Last disinfection was 10 days ago -- the zone card shows "OVERDUE" in red.
> A visitor from an external farm with "Outbreak" health status was logged yesterday -- the dashboard shows a cross-contamination alert.

**Tips:**
- Log every visitor without exception. This creates a traceable record for audits and outbreak investigations.
- Set realistic disinfection frequencies. Weekly for production houses, daily for footbaths, monthly for perimeter.
- Resolve pest sightings promptly. The pest risk score directly impacts your overall farm health assessment.
- Always check the "Disinfected" field for visitors. If someone enters without disinfection, you have a documented gap.

---

## 9. Traceability

The Traceability module provides egg batch tracking from production to delivery.

### Creating a Batch

Click "Add Batch" and fill in:

| Field | Description |
|-------|-------------|
| **Date** | Batch creation date |
| **Flock** | Source flock |
| **House** | Which house the eggs came from |
| **Rack** | Specific rack/section within the house |
| **Box Count** | Number of boxes in the batch |
| **Eggs per Box** | Eggs per box (default: 30) |
| **Egg Type** | Conventional / Free Range / Organic / Pasture Raised / Decorative |
| **Client** | Destination buyer |
| **Delivery Date** | Expected or actual delivery date |

### Batch Validation

The app validates that the batch quantity does not exceed available production. If you create a batch for 5,000 eggs but the flock has only produced 4,000 unallocated eggs, you will see a warning toast.

### QR Code / Trace String

Every batch automatically generates a trace code in the format:
```
EGGLOGU|BATCH:{id}|FLOCK:{flockId}|DATE:{date}|HOUSE:{house}|TYPE:{eggType}
```

### Batch Trace View

Click the magnifying glass icon on any batch to see the full origin trace:
- Batch ID
- Source house and flock (including breed)
- Date of production
- Flock health score at time of batch
- Egg type classification
- Destination client
- Full QR trace string

### Search and Filter

Use the search bar to filter batches by:
- Batch ID, QR code, house name, flock name, client name, egg type, or date.

### CSV Export

Click "Export CSV" to download all batch data as a spreadsheet with columns: Batch ID, Date, Flock, House, Rack, Boxes, Eggs/Box, Type, Client, Delivery, QR.

**Practical Example:**
> You pack 20 boxes of 30 eggs each (600 eggs) from House A, Rack 3.
> Flock: "ISA Brown 2025", Egg Type: Free Range, Client: "Natural Foods Co."
> Delivery: 2026-02-17.
> The system generates trace code: EGGLOGU|BATCH:a1b2c3|FLOCK:d4e5f6|DATE:2026-02-15|HOUSE:House A|TYPE:free_range

**Tips:**
- Always fill in the house and rack fields for precise origin tracking.
- Use batch trace reports during food safety audits to demonstrate full chain of custody.
- Export CSV regularly for external traceability compliance systems.

---

## 10. Personnel & Operations

The Operations module combines three day-to-day management tools.

### Tab: Daily Checklist

A customizable daily task list that auto-populates from your configured defaults each morning.

**How it works:**
1. Configure default tasks in Settings (e.g., "Check waterers", "Collect eggs", "Inspect fences").
2. Every day, the checklist auto-creates entries for each default task.
3. Check off tasks as you complete them.
4. Add ad-hoc tasks using the input field at the bottom.

The checklist shows a progress indicator: "5/8 (63%)".

**History:** Below today's checklist, you can see completion rates for the last 7 days.

### Tab: Logbook

A chronological journal for recording farm events and observations.

| Field | Description |
|-------|-------------|
| **Date** | Entry date |
| **Category** | General / Health / Production / Maintenance / Observation |
| **Entry** | Free text description (up to 2,000 characters) |

Filter logbook entries by category. Entries display with colored category badges.

**Note:** Vet Mode actions automatically create logbook entries when a veterinarian records visits.

### Tab: Personnel

Manage your farm workforce:

| Field | Description |
|-------|-------------|
| **Name** | Employee name |
| **Role** | Administrator, Poultry Technician, Barn Attendant, Collector, Veterinarian, Driver/Delivery, Cleaning, Maintenance |
| **Salary** | Monthly salary |
| **Start Date** | Employment start date |
| **Active** | Active / Inactive status |

The module shows a summary of total active salaries and employee count.

**Practical Example:**
> Your daily checklist includes:
> 1. Check waterers -- Done
> 2. Collect eggs (Barn A) -- Done
> 3. Collect eggs (Barn B) -- Done
> 4. Record feed consumption -- Pending
> 5. Inspect perimeter fence -- Pending
> 6. Clean footbath -- Pending
>
> Current progress: 3/6 (50%)

**Tips:**
- Configure default checklist items in Settings to avoid typing the same tasks every day.
- Use the logbook to document unusual events -- it becomes invaluable during outbreak investigations.
- Track personnel costs here and reference them in the Financial module's labor expense category.

---

## 11. Clients

The Clients module manages your egg buyers and customers.

### Client Information

| Field | Description |
|-------|-------------|
| **Name** | Client/company name |
| **Phone** | Contact phone number |
| **Email** | Email address (validated format) |
| **Route** | Delivery route (select from configured routes) |
| **Address** | Physical address |
| **Price per Egg (S/M/L/XL/Jumbo)** | Custom pricing by size |
| **Notes** | Additional information |

### Size-Based Pricing

Each client can have different prices for each egg size. This enables precise income calculations when combined with the Production module's size grading.

### Client Deletion Safety

When deleting a client that has associated financial records (income, receivables) or traceability batches, the app warns you and requires confirmation. Associated records will have their client reference cleared but will not be deleted.

**Practical Example:**
> Client "Restaurant Gourmet" buys L and XL eggs at premium prices:
> - S: $80, M: $100, L: $130, XL: $160, Jumbo: $180 per unit
> - Route: "Downtown Route"
> - Delivery every Tuesday and Friday

**Tips:**
- Set up delivery routes in Settings first, then assign clients to routes for efficient logistics.
- Per-size pricing helps you understand which clients generate the most profit per egg.
- Link clients to income records and traceability batches for complete customer tracking.

---

## 12. Environment

The Environment module tracks barn conditions through manual readings, IoT sensors, and historical charts.

### Tab: Manual Readings

Record environmental conditions:

| Field | Description | Optimal Range |
|-------|-------------|---------------|
| **Temperature** | In Celsius | 18-24C |
| **Humidity** | Percentage | 40-70% |
| **Light Hours** | Daily photoperiod | 14-16 hours |
| **Ammonia** | In ppm | < 25 ppm |
| **Ventilation** | Natural / Low / Medium / High / Tunnel | -- |

**Traffic Light Indicators:** Each reading is color-coded green (within range) or red/yellow (out of range).

### Temperature-Humidity Index (THI)

Automatically calculated when both temperature and humidity are present:
```
THI = 0.8 * Temperature + (Humidity / 100) * (Temperature - 14.4) + 46.4
```
- THI > 28: Heat stress warning (displayed in red)
- THI > 25: Mild stress (displayed in yellow)
- THI <= 25: Normal (no indicator)

### Tab: IoT (MQTT)

If you configure an MQTT broker in Settings, EGGlogU can receive real-time sensor data via WebSocket:
- Connect/Disconnect buttons
- Live gauges for temperature and humidity
- Auto-recording of IoT readings

**MQTT Configuration (in Settings):**
- Broker URL (wss:// WebSocket format)
- Username and Password
- Topic Prefix (default: `egglogu/`)

### Tab: History

A dual-axis chart showing temperature and humidity trends over the last 30 readings, plus a full data table.

**Practical Example:**
> Today's reading: 28C temperature, 75% humidity, 15 light hours, 18 ppm ammonia.
> THI = 28.9 -- Heat stress alert triggered.
> The dashboard recommendation says: "Implement heat management plan."
> Action: Increase ventilation to Tunnel mode, add electrolytes to water.

**Tips:**
- Record environmental readings at least once daily, ideally at the hottest part of the day.
- THI is the most important heat stress indicator. Above 28, egg production drops significantly.
- If you have IoT sensors, the MQTT integration provides continuous monitoring without manual input.
- Keep ammonia below 25 ppm -- levels above this damage respiratory health and reduce production.

---

## 13. Analytics & Predictions

The Analytics module provides 5 tabs of deep analysis powered by Chart.js and the simple-statistics library.

### Tab: Flock Comparison

Compare all active flocks side by side:

| Metric | Description |
|--------|-------------|
| **7-Day Hen-Day** | Average Hen-Day percentage over the last 7 days |
| **30-Day FCR** | Feed Conversion Ratio over the last 30 days |
| **Mortality** | Cumulative mortality percentage |
| **Health Score** | Composite score (0-100) |

### Tab: Seasonality

Monthly averages displayed as a bar chart:
- Average daily egg production by month
- Identifies seasonal patterns (typically lower in winter, higher in spring)

### Tab: Profitability

Three profitability breakdowns:
1. **By Flock**: Income, expenses, and net profit per flock
2. **By Egg Type**: Profitability of Conventional vs. Free Range vs. Organic, etc.
3. **By Market Channel**: Performance of Wholesale vs. Direct Sale vs. Restaurant, etc.

### Tab: KPI Evolution

Line charts tracking KPI trends over time using your saved snapshots:
- Hen-Day Rate trend
- FCR trend
- Mortality trend
- Cost per egg trend

### Tab: Predictions

Multi-step production forecasting:

**Method:** Ensemble of Weighted Moving Average (WMA) and Linear Regression

1. Takes the last 14 days of production data
2. WMA: Exponentially weights recent data more heavily
3. Linear Regression: Fits a trend line
4. Ensemble: Averages both methods for a balanced forecast
5. Confidence bands: Upper and lower bounds based on standard deviation of residuals

The chart shows:
- Historical data (last 14 days)
- 7-day forecast with confidence bands
- WMA and Linear Regression components

**Practical Example:**
> Your Analytics show:
> - Flock A: 88% Hen-Day, FCR 2.1, Health 92 -- Performing well
> - Flock B: 71% Hen-Day, FCR 2.6, Health 58 -- Underperforming
> - Seasonality: Production dips 15% in July (winter in Southern Hemisphere)
> - Prediction: Next 7 days estimated at 4,100 +/- 200 eggs/day
>
> Action: Investigate Flock B's low health score. Check for medication needs, feed quality, or environmental stress.

**Tips:**
- Predictions require at least 7 days of production data. The more data, the better the forecast.
- Save KPI snapshots regularly to build meaningful KPI Evolution charts.
- Use the profitability analysis to decide which market channels deserve more focus.
- Compare actual production against breed curves to identify underperformance early.

---

## 14. Production Planning

The Planning module helps you forecast production to meet client demand.

### Creating a Plan

Click "Add Plan" and fill in:

| Field | Description |
|-------|-------------|
| **Name** | Plan name (e.g., "February Order - Natural Foods") |
| **Target Date** | When the eggs need to be ready |
| **Eggs Needed** | Total egg quantity required |
| **Client** | Which client the plan is for |
| **Flock Allocations** | Check which flocks will contribute |

### How Forecasting Works

For each allocated flock, the app:
1. Looks up the flock's breed production curve
2. Calculates the flock's age in weeks at each day between now and the target date
3. Multiplies the Hen-Day percentage by the active hen count for each day
4. Sums the daily estimates to get total expected production

### Plan Status

Each plan shows:
- **Expected Production**: Calculated from breed curves and active hens
- **Eggs Needed**: Your target
- **Gap**: Expected minus Needed
- **Completion %**: Color-coded progress
  - Green (100%+): On track
  - Yellow (80-99%): Slightly behind
  - Red (below 80%): Significantly behind

**Practical Example:**
> Client "Supermarket Chain" needs 50,000 eggs by March 15.
> You allocate Flocks A (3,000 hens, ISA Brown week 30) and B (2,000 hens, Hy-Line week 25).
> The plan shows:
> - Flock A expected: 35,000 eggs
> - Flock B expected: 24,000 eggs
> - Total expected: 59,000
> - Gap: +9,000 (118%) -- On track

**Tips:**
- Create plans as soon as you receive large orders to track feasibility.
- If a plan shows a gap, consider adjusting flock allocations or negotiating delivery quantities.
- The estimates use breed curves, so they are most accurate when your flocks are performing at their genetic potential.

---

## 15. Campo Mode & Vet Mode

EGGlogU includes two specialized modes for simplified workflows.

### Campo Mode (Field Mode)

**Purpose:** A simplified, touch-friendly interface designed for field workers using phones.

**How to Activate:** Toggle the "Campo Mode" switch in the sidebar.

**What Changes:**
- The sidebar hides all modules except Dashboard and Production.
- The Dashboard becomes a 4-card grid with extra-large numbers:
  - Eggs Today
  - Hen-Day Rate
  - Mortality
  - Active Alerts
- A large "Quick Entry" button appears for fast egg recording.
- CSS applies larger font sizes and buttons for outdoor use.

**Quick Entry Form:**
Only 3 fields:
1. Flock (dropdown)
2. Eggs collected (large number input)
3. Deaths (number input)

This is the minimum data needed for daily tracking. No size grading, no market channel -- just the essentials.

### Vet Mode (Veterinary Mode)

**Purpose:** A clinical dashboard for veterinarians making farm visits.

**How to Activate:** Toggle the "Vet Mode" switch in the sidebar.

**What Shows:**
- Flock selector at the top
- For the selected flock:
  - Health score (0-100)
  - Active outbreaks with disease details
  - Pending/overdue vaccines
  - Latest environmental readings
  - Cross-contamination alerts from recent visitors

**Vet Actions:**
Three quick-action buttons:
1. **Visit**: Logs a vet visit in the logbook and creates a biosecurity visitor record.
2. **Vaccines**: Creates a vaccine-related log entry.
3. **Pending**: Records pending items for follow-up.

All actions auto-create entries in both the logbook and the biosecurity visitor registry.

**Practical Example:**
> The veterinarian arrives at the farm.
> 1. You activate Vet Mode.
> 2. She selects Flock B -- Health Score 58 (yellow).
> 3. She sees one active outbreak: Coccidiosis, started Feb 10.
> 4. Two overdue vaccines are highlighted in red.
> 5. A cross-contamination alert shows a recent visitor from a farm with an outbreak.
> 6. She clicks "Visit" -- the system logs everything automatically.

**Tips:**
- Train field workers to use Campo Mode exclusively. It prevents accidental changes to complex settings.
- When deactivating Campo or Vet Mode, you return to the full Dashboard view.
- Campo Mode and Vet Mode are mutually exclusive -- activating one deactivates the other.

---

## 16. Settings & Configuration

### Theme Customization

Choose from 5 themes:
- **Default** (Navy Blue)
- **Green**
- **Purple**
- **Black**
- **Dark Mode** (separate toggle)

### Accessibility

| Setting | Options |
|---------|---------|
| **Font Size** | Small / Normal / Large / Extra Large |
| **Dark Mode** | On / Off |

Font scale affects all text throughout the app for users who need larger text.

### Farm Information

| Field | Description |
|-------|-------------|
| **Farm Name** | Displayed on dashboard header |
| **Currency** | Your local currency symbol |
| **Houses** | Define physical houses/barns (used in Traceability) |
| **Racks** | Define racks within houses |
| **Routes** | Define delivery routes (used in Clients) |
| **Suppliers** | Define feed and bird suppliers |

### Geolocation & Map

- Click "Get Location" to capture your GPS coordinates.
- An interactive Leaflet.js map shows your farm's position.
- Coordinates are used for weather API queries.

### Weather API

- Enter your OpenWeatherMap API key.
- The dashboard will display weather data and THI calculations.
- Free tier allows 1,000 calls/day.

### MQTT / IoT Configuration

| Field | Description |
|-------|-------------|
| **Broker URL** | WebSocket URL (wss://...) |
| **Username** | MQTT username |
| **Password** | MQTT password |
| **Topic Prefix** | Default: `egglogu/` |

### Alert Thresholds

| Setting | Default | Description |
|---------|---------|-------------|
| **Min Feed Stock** | 50 kg | Triggers low feed alert |
| **Max Mortality** | 5% | Triggers high mortality alert |
| **Alert Days Before** | 3 days | How far ahead to warn about upcoming vaccines |

### Default Checklist

Configure default daily tasks that auto-populate the Operations checklist each morning. Enter tasks separated by commas or one per line.

**Practical Example:**
> Settings configuration:
> - Farm Name: "Granja Don Pedro"
> - Currency: CLP
> - Houses: "Galpon A", "Galpon B", "Bodega"
> - Routes: "Ruta Centro", "Ruta Sur"
> - Suppliers: "AviFeed", "ProVet"
> - Alert thresholds: Min feed 100 kg, Max mortality 3%, Alert days 5
> - Default checklist: "Revisar bebederos, Recolectar huevos, Registrar consumo alimento, Limpiar pediluvio"

### Team Management

Invite team members and assign roles to control access across your organization.

**Inviting Users:**
1. Navigate to Settings > Team Management.
2. Click "Invite User" and enter the team member's email address.
3. Select a role for the new user (see roles below).
4. The invited user receives an email with a link to join your organization.

**Roles:**

| Role | Permissions |
|------|-------------|
| **Owner** | Full access to all features, billing, and team management. Protected account -- cannot be deactivated or have role changed by other users. |
| **Manager** | Can manage farms, flocks, production data, and view reports. Cannot modify billing or team roles. |
| **Operator** | Can record daily data (production, feed, health events). Cannot modify farm settings or view financial details. |
| **Viewer** | Read-only access to dashboards, reports, and data. Cannot create or modify records. |

**Owner Protection:**
- The owner account cannot be deactivated or have its role changed by any other user, including other owners.
- This prevents accidental lockout from the organization.

**Pending User Deletion:**
- Admins (owner/manager) can delete pending invitations that have not yet been accepted.
- Active users can be deactivated from the Admin Panel (see [Section 21: Admin Panel](#21-admin-panel)).

---

## 17. Data Management

### Where is Data Stored?

EGGlogU uses a **dual-write model** to ensure your data is always safe and accessible:

- **Primary storage:** Cloud server (PostgreSQL) at **api.egglogu.com**. This is the source of truth for all your data.
- **Offline cache:** IndexedDB in your browser provides local access when you are offline.
- **Auto-sync:** When online, changes are saved to both the local cache and the server simultaneously. A 3-second debounce prevents excessive requests after rapid edits.
- Data syncs automatically between all your devices when connected to the internet.
- Clearing browser data only removes the local cache -- your data remains safe on the server and will re-sync on next login.

### JSON Backup (Export)

In Settings > Data section:
1. Click "Export JSON".
2. A file named `egglogu_backup.json` downloads to your device.
3. Store this file safely -- it contains your complete database.

**Recommendation:** Export a backup at least weekly, or after making significant data entries.

### JSON Restore (Import)

1. Click "Import JSON".
2. Select a previously exported backup file.
3. The app replaces all current data with the backup contents.
4. A confirmation dialog warns you before overwriting.

**Warning:** Import replaces ALL existing data. There is no merge function.

### CSV Export

The Financial module and Traceability module each have CSV export buttons for spreadsheet-compatible downloads.

### Data Reset

In Settings, the "Reset All Data" button:
1. Shows a confirmation dialog.
2. Clears the local IndexedDB cache on your device.
3. Returns the local app to its initial default state.

**Note:** This clears local cached data only. Your server-side data remains intact and will re-sync on next login. To permanently delete all server data, contact support or use the account deletion option in the Admin Panel.

**Warning:** Always export a backup before resetting.

### Data Statistics

The Settings page shows a summary of your data:
- Number of flocks, production records, vaccines, medications, outbreaks
- Feed records, financial transactions, clients, personnel
- Biosecurity entries, traceability batches, environment readings

### PWA & Offline Use

EGGlogU registers a service worker that enables:
- Offline functionality after first load -- all changes saved to IndexedDB
- App-like experience when installed to home screen
- Automatic caching of application assets
- Automatic sync of offline changes when connectivity is restored

### Data Migration

The app includes automatic migration logic for older data formats:
- Adds missing fields (biosecurity, traceability, plans, IoT settings)
- Preserves all existing records during migration
- Runs silently on every data load

**Tips:**
- Although your data is stored on the server, periodic JSON exports are still recommended as an extra safety measure.
- Keep a backup on a USB drive or external storage as an additional safety layer.
- Data syncs automatically between devices -- no manual transfer needed.
- The local IndexedDB cache has generous storage limits, but for very large operations, the server handles primary storage without browser constraints.

---

## 18. Troubleshooting

### Common Issues and Solutions

**App does not load or shows blank page**
- Ensure you are using a modern browser (Chrome, Firefox, Edge, Safari).
- Clear browser cache and reload the page.
- Check that JavaScript is enabled in your browser settings.

**Data disappeared after browser update**
- Some browser updates clear the local IndexedDB cache. Your data remains safe on the server.
- Log out and log back in to trigger a fresh sync from the server.
- Check if you are using the same browser profile.
- If sync does not restore your data, use a JSON backup via Import to restore.

**Login credentials forgotten**
- Use the "Forgot Password" link on the login page to receive a password reset email.
- If you signed in with Google, Apple, or Microsoft, use the corresponding social sign-in button instead.
- Contact your organization owner if your account has been deactivated.

**Charts not displaying**
- Chart.js must be loaded from the CDN. Ensure you have internet connectivity on first load.
- If offline, charts should still work if the service worker cached the CDN resources.

**Weather data not showing**
- Verify your OpenWeatherMap API key in Settings.
- Ensure geolocation is configured (latitude/longitude).
- Free API keys have a limit of 1,000 calls/day.

**MQTT/IoT not connecting**
- Verify the broker URL uses `wss://` (WebSocket Secure) protocol.
- Check username and password.
- Ensure your MQTT broker allows WebSocket connections.
- Check browser console (F12) for connection error details.

**Performance is slow with large datasets**
- The app renders data client-side. With thousands of records, some views may be slower.
- The app uses `requestAnimationFrame` for heavy sections (Dashboard, Analytics, Finances, Biosecurity, Traceability).
- Consider exporting and archiving old data, then resetting for a fresh start.

**Production records show wrong Hen-Day percentage**
- Verify the flock's birth date is correct (it determines age and expected production).
- Ensure deaths are being recorded in Production, not just in Outbreaks.
- Check that the correct flock is selected when recording production.

**Vaccine calendar shows unexpected dates**
- The vaccine schedule is calculated from the flock's birth date.
- If birth date is wrong, delete and regenerate the vaccine calendar after correcting it.

**FCR shows unusually high values**
- Ensure feed consumption is recorded in kg, not in bags or tons.
- Verify that production records have correct egg counts.
- FCR assumes 60g average egg weight. If your eggs are significantly lighter, FCR will appear inflated.

**Data import fails**
- The JSON file must be a valid EGGlogU export. It cannot be modified or corrupted.
- Try opening the JSON file in a text editor to verify it is valid JSON.
- File must not exceed browser memory limits.

**Email verification not received**
- Check your spam/junk folder -- verification emails are sent via Resend and may be filtered.
- Ensure the email address was typed correctly during registration.
- Use the "Resend Verification" link on the login page to trigger a new verification email.
- If the issue persists, try registering with a different email provider or use social sign-in (Google, Apple, Microsoft).

**OAuth login fails (Google, Apple, Microsoft)**
- Check that your browser is not blocking popups -- OAuth sign-in requires a popup window.
- Disable any ad blockers or privacy extensions that may interfere with OAuth redirects.
- Try a different OAuth provider if one is not working.
- Clear browser cookies for egglogu.com and try again.

**Sync not working**
- Verify your internet connection is active.
- Check that your JWT authentication token is still valid -- if expired, log out and log back in.
- Open browser developer tools (F12 > Console) to check for sync error messages.
- If offline changes were queued, they will sync automatically when connectivity is restored.

**"Too many requests" error**
- You have been rate limited by the server. Wait at least 1 minute before retrying.
- Avoid rapidly refreshing pages or making bulk edits in quick succession.
- If this occurs frequently, contact support.

**Trial expired**
- Your 30-day free Enterprise trial has ended. Your data is preserved but access to premium features is restricted.
- Upgrade to a paid plan via Settings > Billing or the in-app upgrade prompt.
- See [Section 19: Billing & Subscription](#19-billing--subscription) for available plans.

### Browser Compatibility

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 80+ | Full support including PWA install |
| Firefox | 78+ | Full support |
| Edge | 80+ | Full support including PWA install |
| Safari | 14+ | PWA support limited on iOS |
| Opera | 67+ | Full support |

### Keyboard Accessibility

- All sidebar navigation items are keyboard-accessible (Tab + Enter/Space).
- Modal dialogs trap focus (Tab cycles within the modal).
- Escape key closes modals and confirmation dialogs.
- All table headers include `scope="col"` for screen reader compatibility.

### Getting Help

If you encounter an issue:
1. Check this manual and the in-app FAQ (see [Section 20: Support](#20-support)).
2. Search for your issue in the FAQ articles within the Support module.
3. Submit a support ticket from within the app for personalized assistance.
4. Use the bug reporter widget (floating button) to report bugs with automatic context capture.
5. Use browser developer tools (F12) to inspect errors in the Console tab for technical details.
6. Export your data as JSON backup before attempting any manual fixes.

---

## 19. Billing & Subscription

### Free Trial

Every new account starts with a **30-day free Enterprise trial**. No credit card is required. During the trial, you have access to all features, unlimited farms, flocks, and users. When the trial expires, your data is preserved but access to premium features is restricted until you select a paid plan.

### Pricing Tiers

| Feature | Hobby ($9/mo) | Starter ($19/mo) | Pro ($49/mo) | Enterprise ($99/mo) |
|---------|---------------|-------------------|--------------|---------------------|
| **Farms** | 1 | 3 | 10 | Unlimited |
| **Flocks** | 3 | 10 | Unlimited | Unlimited |
| **Users** | 2 | 5 | 15 | Unlimited |
| **Core Modules** | All 18 | All 18 | All 18 | All 18 |
| **Analytics & Predictions** | Basic | Full | Full | Full + Custom |
| **Support SLA** | Community | 48h response | 24h response | 4h response + dedicated |
| **Data Export** | JSON | JSON + CSV | JSON + CSV + API | JSON + CSV + API + Bulk |
| **Audit Log** | -- | -- | 30 days | Unlimited |

### Annual Pricing

Save **20%** by choosing annual billing:

| Plan | Monthly | Annual (per month) | Annual Total |
|------|---------|-------------------|--------------|
| Hobby | $9/mo | $7.20/mo | $86.40/yr |
| Starter | $19/mo | $15.20/mo | $182.40/yr |
| Pro | $49/mo | $39.20/mo | $470.40/yr |
| Enterprise | $99/mo | $79.20/mo | $950.40/yr |

### Managing Your Subscription

EGGlogU uses **Stripe** for secure payment processing.

**Subscribing to a Plan:**
1. Navigate to Settings > Billing.
2. Select the plan that fits your operation.
3. Click "Subscribe" to open the Stripe checkout page.
4. Enter your payment details and confirm.

**Stripe Customer Portal:**
- Access the Stripe customer portal from Settings > Billing > "Manage Subscription".
- From the portal you can: update payment method, view invoices, download receipts, and cancel your subscription.

**Upgrading:**
- Navigate to Settings > Billing and select a higher plan.
- The upgrade takes effect immediately. You are charged a prorated amount for the remainder of the current billing period.

**Downgrading:**
- Navigate to Settings > Billing and select a lower plan.
- The downgrade takes effect at the end of the current billing period.
- If your current usage exceeds the new plan's limits (e.g., more farms than allowed), you will need to reduce usage before the downgrade activates.

---

## 20. Support

### Creating Support Tickets

1. Navigate to the **Support** module from the sidebar.
2. Click "New Ticket".
3. Fill in the ticket details:
   - **Subject** -- Brief description of your issue.
   - **Category** -- Select from: Bug Report, Feature Request, Billing, Account, Data, General.
   - **Priority** -- Low, Medium, High, or Urgent.
   - **Description** -- Detailed explanation of the issue. Include steps to reproduce if applicable.
4. Submit the ticket. You will receive a confirmation and can track the ticket status in the Support module.

### FAQ Articles

- Browse frequently asked questions organized by category.
- Use the search bar to find articles matching your issue.
- Vote articles as "Helpful" or "Not Helpful" to improve recommendations for other users.

### Auto-Responses

For common issues (password reset, sync problems, billing questions), the system provides automatic responses with step-by-step solutions. These are delivered instantly when your ticket matches a known issue pattern.

### Bug Reporter Widget

- A floating bug reporter button is available throughout the app.
- Click it to open the bug report form, which automatically captures:
  - Current page/module
  - Browser and device information
  - Recent console errors (if any)
- Add your description and submit. The report is created as a support ticket with "Bug Report" category.

### Response Time Expectations

Response times vary by your subscription tier:

| Plan | First Response SLA |
|------|--------------------|
| Hobby | Community support (best effort) |
| Starter | Within 48 hours |
| Pro | Within 24 hours |
| Enterprise | Within 4 hours (dedicated support) |

---

## 21. Admin Panel

The Admin Panel is available to users with **Owner** or **Manager** roles and provides centralized management of your organization.

### User Management

- **View all users** in your organization with their current role, status, and last activity.
- **Add users** by sending email invitations directly from the Admin Panel.
- **Edit users** -- update display name, contact information, and assigned farms.
- **Deactivate users** -- disable access for users who no longer need it. Deactivated users cannot log in but their historical data (entries, edits) is preserved.
- **Reactivate users** -- restore access for previously deactivated users.

**Note:** The owner account is protected and cannot be deactivated or have its role changed by any other user.

### Role Assignment

Assign or change roles for any user in your organization:

| Role | Access Level |
|------|-------------|
| **Owner** | Full access. Manages billing, team, and all data. Cannot be deactivated. |
| **Manager** | Manages farms, flocks, data, and team invitations. Cannot modify billing. |
| **Operator** | Records daily data (production, feed, health). No access to financial or settings modules. |
| **Viewer** | Read-only access to all dashboards and reports. |

### Team Invitations

1. Click "Invite User" in the Admin Panel.
2. Enter the email address and select a role.
3. The invitee receives an email with a link to join your organization.
4. Pending invitations are visible in the "Pending" tab and can be resent or cancelled.

### Billing Status Overview

- View your current plan, billing period, and next payment date.
- See usage metrics against plan limits (farms, flocks, users).
- Quick link to Stripe customer portal for payment management.

### Audit Log Viewer

- View a chronological log of significant actions in your organization.
- Tracked events include: user logins, data modifications, role changes, farm/flock creation and deletion, billing changes.
- Filter by user, action type, date range, or entity.
- Available on Pro plan (30-day retention) and Enterprise plan (unlimited retention).

### Pending User Activation

- When new users register via an invitation link, they appear in the "Pending Activation" list.
- Admins can approve or reject pending users.
- Approved users receive access according to their assigned role.
- Rejected users are notified and their pending account is removed.

---

## Appendix: Quick Reference

### Key Formulas

| Formula | Calculation |
|---------|-------------|
| **Hen-Day %** | (Eggs Today / Active Hens) x 100 |
| **FCR** | Total Feed (kg) / Total Egg Weight (kg) |
| **THI** | 0.8 x Temp + (Humidity/100) x (Temp - 14.4) + 46.4 |
| **Cost per Egg** | Total Expenses / Total Eggs Produced |
| **Mortality %** | (Total Deaths / Initial Flock Count) x 100 |
| **Health Score** | Mortality(30%) + Production(30%) + FCR(20%) + Outbreaks(20%) |

### Module Navigation Map

```
Dashboard ---- Flocks ---- Production ---- Feed
    |              |            |             |
 Alerts      Lifecycle     Egg Sizes     Stock/FCR
 Weather     Roadmap       Deaths        Purchases
 KPIs        Health Score  Grading       Consumption
    |
Analytics ---- Finances ---- Health ---- Biosecurity
    |              |            |             |
 Comparison    Income      Vaccines      Visitors
 Seasonality   Expenses    Medications   Zones
 Profitability Receivables Outbreaks     Pests
 Predictions   Summary     Stress        Protocols
    |
Operations ---- Clients ---- Environment ---- Traceability
    |              |              |                |
 Checklist     Pricing       Manual           Batches
 Logbook       Routes        IoT/MQTT         QR Codes
 Personnel     Contacts      History          CSV Export
    |
Planning ---- Settings
    |             |
 Forecasts    Theme/Access
 Allocations  Farm Config
 Client       Data Mgmt
```

### Data Backup Checklist

- [ ] Data is automatically synced to the server (verify sync status in Settings)
- [ ] Export JSON backup periodically (Settings > Export) as an additional safety measure
- [ ] Save backup file to external storage (USB drive, external cloud)
- [ ] Verify backup by checking file size is > 0 bytes
- [ ] Test restore on a secondary browser/device periodically

---

*EGGlogU -- Professional Poultry Farm Management SaaS, Offline-First, 8 Languages, Cloud-Synced.*
