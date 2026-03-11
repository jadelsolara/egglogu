#!/usr/bin/env python3
"""
Pass 2: Clean remaining escaped emojis from info presentation.
Targets inline tab labels, constant icon maps, table header emojis,
tier info emojis, and status indicators.
"""
import re, os, glob

BASE = '/home/jose-antonio/Desktop/Proyectos/EGGlogU/src/components'
SKIP = {'egg-sidebar.js', 'egg-toast.js', 'egg-modal.js', 'egg-confirm.js', 'egg-app.js'}

# Matches any \uXXXX or surrogate pair \uXXXX\uXXXX (escaped in JS source)
EMO = r'(?:\\uD83[CDE]\\u[A-Fa-f0-9]{4}(?:\\uFE0F)?|\\u[0-9A-Fa-f]{4}(?:\\uFE0F)?)'

def process(filepath):
    fn = os.path.basename(filepath)
    if fn in SKIP:
        return False
    with open(filepath, 'r') as f:
        content = f.read()
    orig = content

    # === 1. Inline tab labels: emoji + space before ${t('key')} inside .tab divs ===
    # Pattern: data-tab="xxx">EMOJI ${t('key')}</div>
    content = re.sub(
        r'(data-tab="[^"]*">)\s*' + EMO + r'+\s+',
        r'\1',
        content
    )

    # === 2. Icon constant maps — replace emoji values with empty string ===
    # CAT_ICONS = { quality: '\uXXXX\uXXXX', ... }
    # ORDER_STATUS_ICONS = { ... }
    # typeIcon = { rodent: '\uXXXX', ... }
    content = re.sub(
        r"((?:ICONS|Icons|icons|Icon|icon)\s*(?:=|:)\s*\{[^}]*?)'(" + EMO + r"+)'",
        lambda m: m.group(0),  # keep data definitions, we'll strip at render
        content
    )

    # === 3. Render calls using icon constants: ${stIcon} ${CAT_ICONS[x]} etc ===
    # Actually - these render emojis. Replace the constant values with ''
    # For CAT_ICONS, ORDER_STATUS_ICONS — these render directly in tables
    for const_name in ['CAT_ICONS', 'ORDER_STATUS_ICONS']:
        # Replace: const CAT_ICONS = { quality: '\uXXXX', ... } → { quality: '', ... }
        pattern = re.compile(
            r'(const\s+' + const_name + r'\s*=\s*\{)(.*?)(\})',
            re.DOTALL
        )
        def strip_icon_vals(m):
            inner = m.group(2)
            inner = re.sub(r"'" + EMO + r"+'", "''", inner)
            return m.group(1) + inner + m.group(3)
        content = pattern.sub(strip_icon_vals, content)

    # === 4. Inline status emojis: '\u2705', '\u274C' used as status indicators ===
    # In renders/filters: '\u2705' → 'Yes' / '✓', '\u274C' → 'No' / '✗'
    # r.disinfected ? '\u2705' : '\u274C' → r.disinfected ? 'Yes' : 'No'
    # Replace literal escaped \u2705 and \u274C with text equivalents
    content = content.replace("'\\u2705'", "'\\u2713'")
    content = content.replace("'\\u274C'", "'\\u2717'")
    # Status with text: '\u2705 Healthy' → 'Healthy', '\u274C text' → 'text'
    content = re.sub(r"'\\u2705\s+", "'", content)
    content = re.sub(r"'\\u274C\s+", "'", content)

    # === 5. Table header emojis: <th>\uXXXX\uXXXX</th> ===
    content = re.sub(
        r'(<th>)\s*' + EMO + r'+\s*(</th>)',
        lambda m: m.group(1) + 'Count' + m.group(2) if '\\uDD5A' in m.group(0) or '\\uDC14' in m.group(0) else m.group(1) + m.group(2),
        content
    )
    # Specific fix: <th>\uD83D\uDC14</th> → <th>Hens</th>, <th>\uD83E\uDD5A</th> → <th>Eggs</th>
    content = content.replace("<th>\\uD83D\\uDC14</th>", f"<th>${{t('flock_count') || 'Hens'}}</th>")
    content = content.replace("<th>\\uD83E\\uDD5A</th>", f"<th>${{t('prod_eggs') || 'Eggs'}}</th>")

    # === 6. Tier/plan info emojis: \uXXXX ${text} in div content ===
    # body += `<div>\uD83C\uDFE0 ${tier.farms}...` → body += `<div>${tier.farms}...`
    content = re.sub(
        r"(<div[^>]*>)\s*" + EMO + r"+\s+",
        r"\1",
        content
    )

    # === 7. Warning indicators: \u26A0\uFE0F → (!) or just text ===
    content = re.sub(r"\\u26A0(?:\\uFE0F)?(?:\s+)", "'!' + ", content.count("\\u26A0") and content or content)
    # Simpler: just strip the warning emoji prefix from info text
    content = re.sub(r"\\u26A0\\uFE0F\s+", "", content)
    content = re.sub(r"\\u26A0\s+", "", content)

    # === 8. Misc escaped emojis before text in backtick strings ===
    # \uD83E\uDDA0 ${text} → ${text}  (robot, disease, etc)
    content = re.sub(
        r"(?<=[>`])\s*" + EMO + r"+\s+(?=\$\{|[A-Za-z])",
        "",
        content
    )

    # === 9. Weather icons — keep as they're functional ===
    # (wmoIcon function in dashboard is a weather data visualization, keep)

    # === 10. KPI alert emoji: '\u26A0' and '\u2713' in dashboard ===
    content = re.sub(r"'\\u26A0'", "'!'", content)

    # === 11. Toast emojis (if any remain) ===
    content = re.sub(r"'\\u2705\s*'\s*\+\s*", "'", content)

    # === 12. biosecurity pest type icons — data definition, strip from render ===
    # typeIcon = { rodent: '\uXXXX', ... }[p.type] || '\uXXXX' → just ''
    content = re.sub(
        r"const\s+typeIcon\s*=\s*\{[^}]+\}\[p\.type\]\s*\|\|\s*'" + EMO + r"+';\s*",
        "",
        content
    )
    # Remove ${typeIcon} references
    content = re.sub(r'\$\{typeIcon\}\s*', '', content)

    # === 13. Biosecurity resolved status with emoji prefix ===
    content = re.sub(
        r"'\\u2705\s+'\s*\+\s*",
        "'",
        content
    )
    content = re.sub(
        r"'\\u274C\s+'\s*\+\s*",
        "'",
        content
    )

    # === 14. Filter options with emoji values ===
    content = re.sub(
        r"label:\s*'\\u2705'",
        "label: t('yes') || 'Yes'",
        content
    )
    content = re.sub(
        r"label:\s*'\\u274C'",
        "label: t('no') || 'No'",
        content
    )

    # === 15. Render functions returning emoji ===
    content = re.sub(
        r"render:\s*r\s*=>\s*r\.disinfected\s*\?\s*'\\u2705'\s*:\s*'\\u274C'",
        "render: r => r.disinfected ? t('yes') || 'Yes' : t('no') || 'No'",
        content
    )

    # === 16. Select options with emoji ===
    content = re.sub(r">\\u2705</option>", ">" + "${t('yes') || 'Yes'}" + "</option>", content)
    content = re.sub(r">\\u274C</option>", ">" + "${t('no') || 'No'}" + "</option>", content)
    content = re.sub(r">\\u2705\s+", ">", content)
    content = re.sub(r">\\u26A0\\uFE0F\s+", ">", content)

    # === 17. Community emojis ===
    # ${c.icon || '📂'} → ${c.name} only (categories have names)
    # Actually keep c.icon as it comes from backend data, but replace fallback
    content = content.replace("c.icon || '📂'", "c.icon || ''")
    content = content.replace("r.icon || '💬'", "r.icon || ''")
    content = content.replace("room.icon || '💬'", "room.icon || ''")
    # 🔒 lock badge → CSS-based
    content = content.replace("🔒", "")
    # 👁️ view count → text
    content = content.replace("👁️ ", "")

    # === 18. Print button emoji (clients) ===
    content = content.replace(">🖨️</button>", f">${{t('print') || 'Print'}}</button>")

    # === 19. Welfare h4 ===
    content = content.replace("⏱️ ", "")

    # === 20. Superadmin action buttons — keep (they're action icons, not info) ===
    # 👥 🗑️ ⚙️ ⏹️ ✖ in buttons → keep for now as action affordances

    if content != orig:
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False

files = sorted(glob.glob(os.path.join(BASE, 'egg-*.js')))
changed = 0
for fp in files:
    if process(fp):
        print(f"  ✓ {os.path.basename(fp)}")
        changed += 1
print(f"\n{changed} files modified in pass 2.")
