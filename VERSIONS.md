# EGGlogU — Version Registry

## CURRENT: v1.6.0 (2b19e31a) — 2026-03-08

## Version History

| Version | Hash | Git Commit | Date | Changes | Status |
|---------|------|------------|------|---------|--------|
| v1.6.0 | 2b19e31a | — | 2026-03-08 | Superuser hardcode jadelsolara@pm.me + enterprise free forever | CURRENT |
| v1.5.0 | 54bbcf04 | 64b631b | 2026-03-08 | Sidebar nav modernizado: chevron collapse, pill active, icon badges | LOCKED |
| v1.4.0 | 35677d89 | 1245337 | 2026-03-08 | Solo temas blue + black, sidebar gradient adaptativo | LOCKED |
| v1.3.0 | 99e0445a | 76c1490 | 2026-03-08 | Modo campo/vet fix (Shadow DOM) | LOCKED |
| v1.2.0 | 1ee467fd | 61ffdfe | 2026-03-08 | Sidebar gradient | LOCKED |
| v1.1.0 | fb0275ec | c25dea3 | 2026-03-08 | Desktop aesthetics + logo + gitignore fix | LOCKED |
| v1.0.0 | — | 6a410d8 | 2026-03-07 | Pre-fix baseline (responsive) | LOCKED |

## Rollback Commands

```bash
# Rollback to specific version:
git checkout <commit> -- live/dist/egglogu-app.js
# Then re-hash and update HTML references

# Full rollback (nuclear):
git revert <commit>
```

## Rules
- Every change = new version entry BEFORE push
- Lock previous version immediately
- Never modify a LOCKED version
- Rollback = checkout from git history, never manual edits to old versions
