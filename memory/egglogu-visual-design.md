# EGGlogU — Visual Design & Aesthetic Registry (Backup)
> Created: 2026-03-10 | Purpose: Permanent backup of all visual design decisions

---

## 1. LANDING PAGE (index.html)

### CSS Variables
```
--navy: #1B2E4B
--navy-deep: #0F2137
--navy-light: #243B55
--orange: #F5A623
--orange-dark: #E09200
--radius: 12px
```

### Typography
- Font: Inter (Google Fonts) weights 400,500,600,700,800
- Hero h1: clamp(2.2rem, 5vw, 3.6rem), weight 800
- Section titles: 2.2rem, weight 700
- Body: 1.05rem, line-height 1.7

### Navigation
- Position: fixed, top 0
- Background: rgba(15,33,55,.92) with backdrop-filter: blur(12px)
- Height: ~70px, z-index: 200
- Logo: 36px font, weight 800, letter-spacing 2px
- Links: rgba(255,255,255,.85), hover → #fff
- CTA button: #F5A623 background, #1B2E4B text, border-radius 8px
- Mobile hamburger at 768px breakpoint

### Hero Section
- Background: radial-gradient(ellipse at 30% 50%, navy-light, navy-deep)
- Logo: 180x180px with glow animation (box-shadow pulse)
- Subtitle: rgba(255,255,255,.8)
- Min-height: 100vh, flex centered

### Curtain/Teaser
- Background: linear-gradient(135deg, navy-deep, navy)
- Logo: 280x280px
- Question marks animation (floating)
- Border-radius: 16px cards

### Features Grid
- 3 columns at desktop, 2 at 1024px, 1 at 768px
- Cards: rgba(255,255,255,.04) background, 1px solid rgba(255,255,255,.08) border
- Hover: border-color → rgba(245,166,35,.4) (orange glow)
- Icon size: 48px
- Card padding: 32px, border-radius: 16px

### Pricing Grid
- 4 columns at desktop, 2 at 1024px, 1 at 768px
- Regular card: rgba(255,255,255,.04) bg, 1px border
- Featured card (Professional): 2px solid #F5A623 border, scale(1.05)
- Price: 3rem font, weight 800
- Period: 1rem, opacity .7

### Launch Promo Banner
- Background: linear-gradient(135deg, #F5A623, #E09200, #D4850A)
- Price: $75/mo
- Text: dark (#1B2E4B)
- Border-radius: 16px, padding: 40px

### Footer
- Background: #0a1628
- Text: rgba(255,255,255,.5)
- Links: rgba(255,255,255,.7)
- "Parte del ecosistema FarmLogU" tagline

### Responsive Breakpoints
- 1024px: 2-column grids, reduced padding
- 768px: 1-column, hamburger menu, stack layouts
- 480px: phone adjustments, smaller fonts

---

## 2. LOGIN/REGISTRO (egglogu.html — LOCKED, NO TOCAR)

### Login Screen
- Background: linear-gradient(135deg, #0E2240 0%, #1A3C6E 50%, #2A5CAE 100%)
- Card: max-width 380px, border-radius 16px, white background
- Box-shadow: 0 20px 60px rgba(0,0,0,.3)
- Logo: 140px width, margin-bottom 8px (BASE64 — NEVER READ)

### Social Login Buttons
- Google: white bg (#fff), dark text, 1px border #ddd
- Apple: black bg (#000), white text
- Microsoft: white bg (#fff), dark text, 1px border #ddd
- All: border-radius 8px, padding 10px, font-size 14px, full width
- Divider: "o" text with horizontal lines

### Form Inputs
- Border: 1px solid #E0E0E0
- Border-radius: 8px
- Padding: 10px 12px
- Focus: border-color var(--primary), box-shadow 0 0 0 2px rgba(26,60,110,.15)

### Register Toggle
- Tabs: "Iniciar sesión" / "Registrarse"
- Active tab: var(--primary) color, border-bottom 2px solid

---

## 3. ERP SHELL (egglogu.html CSS Variables)

### Root Variables (Light Mode)
```
--primary: #1A3C6E
--primary-light: #4A7AB5
--primary-dark: #0E2240
--secondary: #FF8F00
--accent: #2E7D32
--danger: #C62828
--warning: #F9A825
--success: #2E7D32
--bg: #F5F5F5
--card: #FFF
--sidebar-bg: #0E2240
--sidebar-width: 240px
--border: #E0E0E0
--text: #212121
--text-light: #757575
--radius: 8px
--font: 'Segoe UI', system-ui, -apple-system, sans-serif
```

### Dark Mode Overrides
```
--bg: #1E1E1E
--card: #2D2D2D
--text: #E0E0E0
--text-light: #BDBDBD
--border: #424242
--primary: #4A7AB5
--primary-light: #6B9FD4
--primary-dark: #1A3C6E
```
Plus 50+ selector-specific overrides for tables, inputs, badges, cards, modals

### KPI Cards
- Border-left: 4px solid (colored by status)
- Background: var(--card)
- Border-radius: var(--radius)
- Box-shadow: 0 1px 3px rgba(0,0,0,.08)
- .kpi-label: 12px, uppercase, var(--text-light)
- .kpi-value: 24px desktop / 32px campo mode, weight 700
- .kpi-sub: 12px, var(--text-light)

### Campo Mode (Field Mode)
- .kpi-value font-size: 48px
- Buttons: 24px font, larger padding
- Simplified UI for outdoor/gloved use

### DataTable
- Header: var(--bg) background, 600 weight
- Rows: 1px bottom border
- Hover: rgba(0,0,0,.02) background
- Striped: even rows slightly darker
- Font-size: 13px
- Responsive: horizontal scroll on mobile

---

## 4. SIDEBAR (egg-sidebar.js — LOCKED v1.5.0, NO TOCAR)

### Structure
- Width: 240px fixed
- Height: 100vh
- Position: fixed, z-index: 100
- Background: var(--sidebar-bg, #0E2240)
- Gradient overlay: linear-gradient(180deg, transparent 0%, rgba(255,255,255,.04) 60%, rgba(255,255,255,.08) 100%)

### Logo Section
- Padding: 18px 16px
- Border-bottom: 1px solid rgba(255,255,255,.12)
- Title: 18px, weight 700, letter-spacing 1.5px
- "U" in EGGlogU: #FF8F00 (orange accent)
- Subtitle: 10px, opacity .6

### Navigation Links
- Font: 13px, weight 400
- Color: rgba(255,255,255,.75)
- Padding: 9px 16px 9px 20px
- Border-radius: 0 20px 20px 0 (pill shape, right side only)
- Margin-right: 12px
- Hover: rgba(255,255,255,.08) bg, color #fff
- Active: gradient background rgba(255,143,0,.18→.06), border-left 3px solid #FF8F00, weight 600

### Icon Badges
- Size: 28x28px
- Background: rgba(255,255,255,.06)
- Border-radius: 8px
- Active: rgba(255,143,0,.2) background

### Group Labels
- Font: 11px, weight 600, uppercase, letter-spacing 1.2px
- Color: rgba(255,255,255,.35)
- Chevron: 6px, rotates 45deg when open
- Divider line: 1px rgba(255,255,255,.08)
- Collapsible: max-height transition .3s

### Mode Toggles (Campo/Veterinario)
- Background: rgba(255,255,255,.1)
- Border: 1px solid rgba(255,255,255,.2)
- Active: #FF8F00 background
- Border-radius: 8px, font-size: 12px

### Language Picker
- Collapsible section with chevron
- Grid layout, flex-wrap
- Buttons: 11px, weight 500
- Active: white bg, #0E2240 text, weight 700
- Border-top: 1px solid rgba(255,255,255,.15)

### Mobile (≤768px)
- Transform: translateX(-100%) when closed
- Transform: translateX(0) when open
- Transition: .3s

---

## 5. APP SHELL (egg-app.js)

### Layout
- Display: flex, min-height 100vh
- Font: var(--font, 'Inter', system-ui, sans-serif)

### Main Content Area
- Padding: 20px 30px
- Background: var(--bg, #f5f7fa)
- Margin-left: var(--sidebar-width, 240px)
- Width: calc(100vw - sidebar-width)
- Overflow-y: auto, overflow-x: hidden

### Loading Spinner
- Size: 40x40px
- Border: 4px solid var(--border)
- Top border: var(--primary)
- Animation: spin 0.8s linear infinite

### Mobile (≤768px)
- Margin-left: 0
- Width: 100vw
- Padding: 60px 15px 20px (extra top for mobile header)

---

## 6. MODAL (egg-modal.js)

### Overlay
- Background: rgba(0,0,0,.5)
- Padding-top: 2vh
- Z-index: 5000
- Transition: opacity .2s

### Modal Container
- Background: var(--card, #fff)
- Border-radius: 12px
- Max-width: 800px, width: 95%
- Max-height: 96vh
- Box-shadow: 0 20px 60px rgba(0,0,0,.3)
- Margin-bottom: 2vh

### Header
- Padding: 12px 20px
- Border-bottom: 1px solid var(--border)
- Title: 17px, weight 700

### Body
- Padding: 16px 20px
- Overflow-y: auto

### Form Layout
- .form-row: flex, gap 12px, margin-bottom 8px
- .form-row-3: flex, gap 12px (3-column)
- .form-group: margin-bottom 8px
- Label: weight 600, 13px, margin-bottom 2px
- Input/select/textarea: padding 6px 10px, border-radius 8px, 14px font
- Focus: border-color var(--primary), box-shadow 0 0 0 2px rgba(74,124,89,.2)

### Footer
- Flex, gap 10px, justify-content flex-end
- Margin-top: 10px, padding-top: 10px
- Border-top: 1px solid var(--border)

### Buttons
- .btn-primary: var(--primary) bg, white text
- .btn-secondary: var(--border) bg
- .btn-danger: var(--danger) bg, white text
- All: padding 8px 20px, border-radius 8px, weight 600

### VENG Panels
- .dm-error-box: #fee bg, 1px solid #f88
- .dm-warn-box: #fff8e1 bg, 1px solid #ffc107

### Mobile (≤600px)
- .form-row, .form-row-3: flex-direction column

---

## 7. DASHBOARD (egg-dashboard.js)

### KPI Grid
- 4 columns desktop → 2 at 900px → 2 at 600px
- Gap: 12px

### Alert Cards
- .alert-danger: #ffebee bg, #c62828 text
- .alert-warning: #fff8e1 bg, #e65100 text

### Outbreak Alerts
- Critical: gradient #ffcdd2→#ffebee, 2px border #b71c1c, pulse animation
- High: gradient #ffe0b2→#fff3e0, border #e65100
- Moderate: gradient #fff9c4→#fffde7, border #f57f17, no animation
- Low: gradient #dcedc8→#f1f8e9, border #558b2f, no animation

### Farm Report
- Border-left: 4px solid var(--primary)
- Summary status: ok(green), warning(orange), danger(red)

### Quick Entry Cards
- Grid: auto-fill, minmax(240px, 1fr)
- Submit button: var(--primary) bg, weight 600

### Dash Grid
- 2 columns desktop → 1 at 900px

---

## 8. COMPONENT-SPECIFIC COLORS

### Flock Lifecycle Stages
```
pollito: #FFF9C4 (light yellow)
cria: #FFECB3 (lighter yellow)
recria: #C8E6C9 (light green)
pre_postura: #B3E5FC (light blue)
postura_pico: #A5D6A7 (green)
postura_media: #FFCC80 (orange)
postura_baja: #FFAB91 (light red)
descarte: #BDBDBD (gray)
```

### Welfare Principle Colors
```
feeding: main #FF6F00, bg rgba(255,111,0,0.12), light #FFF3E0
housing: main #1565C0, bg rgba(21,101,192,0.12), light #E3F2FD
health: main #c62828, bg rgba(198,40,40,0.12), light #FFEBEE
behaviour: main #2e7d32, bg rgba(46,125,50,0.12), light #E8F5E9
```

### Carencias Category Colors
```
sanitary: #c62828 (red)
nutritional: #e65100 (orange)
financial: #1565c0 (blue)
operational: #6a1b9a (purple)
data: #00695c (teal)
```

### Support Status Colors
```
open: #3b82f6 (blue)
in_progress: #f59e0b (amber)
waiting_user: #8b5cf6 (purple)
resolved: #10b981 (green)
closed: #6b7280 (gray)
```

### Support Priority Colors
```
low: #6b7280 (gray)
medium: #3b82f6 (blue)
high: #f59e0b (amber)
urgent: #ef4444 (red)
```

### Client Severity Scale (1-5)
```
1: #4CAF50 (green — good)
2: #8BC34A (light green)
3: #FFC107 (yellow — warning)
4: #FF9800 (orange)
5: #F44336 (red — critical)
```

### Toast Notifications
```
error: #C62828
warning: #F57F17 (black text)
success: #2E7D32
info: #1565C0
```

### Traffic Light Indicators (Analysis)
```
red: #F44336
yellow: #FFC107
green: #4CAF50
```

### Health Score Badges
```
good (≥70): bg #e8f5e9, color #2e7d32
warn (40-69): bg #fff9c4, color #f57f17
bad (<40): bg #ffebee, color #c62828
```

---

## 9. THEME SYSTEM (egg-config.js)

### Available Themes
```
blue (default):
  primary: #1A3C6E, primary-light: #4A7AB5, primary-dark: #0E2240, sidebar-bg: #0E2240

green:
  primary: #2E7D32, primary-light: #4CAF50, primary-dark: #1B5E20, sidebar-bg: #1B5E20

purple:
  primary: #6A1B9A, primary-light: #AB47BC, primary-dark: #4A148C, sidebar-bg: #4A148C

black:
  primary: #37474F, primary-light: #607D8B, primary-dark: #263238, sidebar-bg: #263238

dark:
  primary: #90CAF9, primary-light: #BBDEFB, primary-dark: #1565C0, sidebar-bg: #0D1B2A
```

### Gradient Rule (PERMANENT)
All themes apply gradient overlay on sidebar: `linear-gradient(180deg, transparent 0%, rgba(255,255,255,.04) 60%, rgba(255,255,255,.08) 100%)` — this is part of the brand DNA.

---

## 10. BADGE SYSTEM (shared across components)

### Status Badges
```
badge-info: bg #e3f2fd, color #1565c0
badge-warning: bg #fff9c4, color #f57f17
badge-success: bg #e8f5e9, color #2e7d32
badge-secondary: bg #f5f5f5, color #757575
badge-danger: bg #ffebee, color #c62828
```

### Recommendation Priority
```
high: bg #ffcdd2, color #b71c1c
medium: bg #fff9c4, color #f57f17
low: bg #e8f5e9, color #2e7d32
```

---

## 11. RESPONSIVE BREAKPOINTS SUMMARY

| Breakpoint | Landing | ERP |
|-----------|---------|-----|
| 1024px | 2-col grids | — |
| 900px | — | KPI 4→2 col, dash-grid 1 col |
| 768px | 1-col, hamburger | Sidebar hides, main full-width |
| 600px | — | Form rows stack vertical |
| 480px | Phone adjustments | KPI grids 1 col |

---

## 12. LOCKED ELEMENTS (NEVER MODIFY)

1. **Login/Registro screen** — Logo, card, gradient, social buttons (locked 2026-02-28)
2. **Sidebar complete** — Gradient, width, colors, logo, nav, modes, language picker (locked v1.5.0)
3. **Nav button "Acceso Clientes"** — Emoji 🔑, size, padding (locked 2026-02-28)
4. **Language globe (landing)** — position:fixed, top:1.25rem, right:1.5rem, z-index:300
5. **Sidebar logo** — Base64 image, CSS .sidebar-logo (NEVER READ base64)

---

*This document is the authoritative visual design reference for EGGlogU. Any change that contradicts this document requires explicit user authorization.*
