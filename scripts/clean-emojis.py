#!/usr/bin/env python3
"""
EGGlogU — Strip emojis from INFORMATION PRESENTATION areas.
Targets: tab labels, section headers (h2/h3/h4), KPI labels, empty states, classification icons.
Keeps: action button icons (🗑️ edit/delete), sidebar (locked), data property definitions.
"""
import re
import os
import sys

BASE = '/home/jose-antonio/Desktop/Proyectos/EGGlogU/src/components'

# Unicode emoji ranges (escaped form in JS source)
# Surrogate pairs: \uD83C\uXXXX, \uD83D\uXXXX, \uD83E\uXXXX
EMOJI_ESC = r'(?:\\uD83[CDE]\\u[A-Fa-f0-9]{4}(?:\\uFE0F)?|\\u26[0-9A-Fa-f]{2}(?:\\uFE0F)?|\\u27[0-9A-Fa-f]{2}|\\u2705|\\u274C|\\u2795|\\u2B50|\\u270F|\\u2713|\\u2714|\\u2716|\\u23F9|\\u2699)'
# Literal emoji ranges
EMOJI_LIT = r'[\U0001F300-\U0001FAFF\u2600-\u27BF\uFE0F\u200D\u2705\u274C\u2795\u2B50\u270F\u2713\u2714\u2716\u23F9\u2699]+'

changes_log = []

def strip_emoji_prefix_esc(line):
    """Remove escaped emoji + space from start of template content in h2/h3/h4/kpi-label"""
    # Match: emoji(s) + space before ${t(...)} or text
    return re.sub(r'(' + EMOJI_ESC + r')+\s*(?=\$\{|[A-Za-z])', '', line)

def strip_emoji_prefix_lit(line):
    """Remove literal emoji + space from template content"""
    return re.sub(r'(' + EMOJI_LIT + r')\s*(?=\$\{|[A-Za-z])', '', line)

def process_file(filepath):
    fname = os.path.basename(filepath)
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    modified = False
    new_lines = []

    for i, line in enumerate(lines):
        original = line
        lineno = i + 1

        # === RULE 1: Headers h2/h3/h4 — strip emoji prefixes ===
        if re.search(r'<h[234][^>]*>', line):
            # Strip escaped emojis after the opening tag
            line = re.sub(
                r'(<h[234][^>]*>)\s*(?:' + EMOJI_ESC + r')+\s*',
                r'\1', line
            )
            # Strip literal emojis after the opening tag
            line = re.sub(
                r'(<h[234][^>]*>)\s*(?:' + EMOJI_LIT + r')\s*',
                r'\1', line
            )

        # === RULE 2: KPI labels — strip emoji prefixes ===
        if 'kpi-label' in line or 'kpi_label' in line:
            line = re.sub(
                r'(?:' + EMOJI_ESC + r')+\s*(?=\$\{)',
                '', line
            )
            line = re.sub(
                r'(?:' + EMOJI_LIT + r')\s*(?=\$\{)',
                '', line
            )

        # === RULE 3: Tab definitions — remove icon property ===
        # Pattern: { key: 'x', icon: '\uXXXX\uXXXX', label: t('y') }
        if "icon:" in line and ('label:' in line or 'key:' in line):
            line = re.sub(
                r",?\s*icon:\s*'(?:" + EMOJI_ESC + r")+'\s*,?",
                ',', line
            )
            # Clean up double commas
            line = line.replace(',,', ',')
            line = re.sub(r'\{\s*,', '{', line)

        # === RULE 4: Tab rendering — remove ${tb.icon} from tab HTML ===
        if 'tb.icon' in line or 'tab.icon' in line:
            line = re.sub(r'\$\{tb\.icon\}\s*', '', line)
            line = re.sub(r'\$\{tab\.icon\}\s*', '', line)

        # === RULE 5: Empty state icons — replace with dash ===
        if 'emptyState(' in line or 'emptyIcon:' in line:
            # emptyState('\uXXXX', ...) → emptyState('', ...)
            line = re.sub(
                r"emptyState\(\s*'(?:" + EMOJI_ESC + r")+'\s*,",
                "emptyState('',",
                line
            )
            line = re.sub(
                r"emptyIcon:\s*'(?:" + EMOJI_ESC + r")+'",
                "emptyIcon: ''",
                line
            )

        # === RULE 6: Tab icon spans (welfare etc) ===
        # <span class="tab-icon">📊</span> → remove entirely
        if 'tab-icon' in line:
            line = re.sub(
                r'<span\s+class=["\']tab-icon["\']>[^<]*</span>\s*',
                '', line
            )

        # === RULE 7: Welcome/empty emoji icons ===
        if 'welcome-emoji' in line or 'empty-icon' in line:
            line = re.sub(
                r'(<span\s+class=["\']welcome-emoji["\']>)[^<]*(</span>)',
                r'\1\2', line
            )
            line = re.sub(
                r'(<div\s+class=["\']empty-icon["\']>)[^<]*(</div>)',
                r'\1\2', line
            )

        # === RULE 8: Classification circle emojis → CSS dots ===
        # 🟢 → <span class="dot" style="background:#2e7d32"></span>
        # 🔵 → <span class="dot" style="background:#1565c0"></span>
        # 🟡 → <span class="dot" style="background:#f57f17"></span>
        # 🔴 → <span class="dot" style="background:#c62828"></span>
        # ⚪ → <span class="dot" style="background:#999"></span>
        circle_map_lit = {
            '🟢': '#2e7d32', '🔵': '#1565c0', '🟡': '#f57f17',
            '🔴': '#c62828', '⚪': '#999'
        }
        for emoji, color in circle_map_lit.items():
            if emoji in line:
                line = line.replace(emoji, f'<span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:{color}"></span>')

        # Score label emojis: 0 ✅ → 0 ● Good, 1 ⚠️ → 1 ● Mod, 2 ❌ → 2 ● Severe
        if 'score-label' in line:
            line = line.replace('0 ✅', '0')
            line = line.replace('1 ⚠️', '1')
            line = line.replace('2 ❌', '2')
        # Option values
        if '<option' in line:
            line = line.replace('✅ ', '')
            line = line.replace('❌ ', '')

        # === RULE 9: Preset/automation icons — keep in data, strip from display ===
        # ${p.icon} ${t(p.name)} → ${t(p.name)}
        if '${p.icon}' in line:
            line = line.replace('${p.icon} ', '')
            line = line.replace('${p.icon}', '')
        if '${r.icon}' in line and 'render:' not in line:
            line = line.replace('${r.icon} ', '')

        # === RULE 10: Toast/modal emojis (escaped) ===
        # '\u2705 ' prefix in toast msgs → remove
        if "Bus.emit('toast'" in line or "Bus.emit('modal" in line:
            line = re.sub(r"'(?:" + EMOJI_ESC + r")+\s*'\s*\+\s*", "'", line)
            line = re.sub(r"'(?:" + EMOJI_ESC + r")+\s*(?=\$\{|[A-Za-z])", "'", line)

        # === RULE 11: Anomaly/warning inline — replace ⚠️ with text ===
        if 'anomaly-icon' in line:
            line = re.sub(r'\\u26A0(?:\\uFE0F)?', '!', line)

        if line != original:
            modified = True
            changes_log.append(f"  L{lineno}: {fname}")

        new_lines.append(line)

    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
    return modified

def main():
    import glob
    skip = {'egg-sidebar.js', 'egg-toast.js', 'egg-modal.js', 'egg-confirm.js', 'egg-app.js'}
    files = sorted(glob.glob(os.path.join(BASE, 'egg-*.js')))

    print(f"Processing {len(files)} files...")
    changed_files = 0
    for fp in files:
        fn = os.path.basename(fp)
        if fn in skip:
            continue
        if process_file(fp):
            print(f"  ✓ {fn}")
            changed_files += 1
        else:
            print(f"  - {fn}")

    print(f"\n{changed_files} files modified, {len(changes_log)} lines changed.")

if __name__ == '__main__':
    main()
