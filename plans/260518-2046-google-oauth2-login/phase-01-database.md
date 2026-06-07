# Phase 01 — Database: Add googleId to Employee

## Overview
- **Priority:** P2 (blocker for Phase 02)
- **Status:** pending
- **Effort:** ~30m

Add nullable `googleId` column to `Employee` to persist Google OAuth subject ID after first successful link.

## Context Links
- Schema: `backend/prisma/schema.prisma`
- Migrations dir: `backend/prisma/migrations/`

## Requirements
- Functional: store Google `sub` (subject) per employee; uniquely.
- Non-functional: zero downtime, additive only, idempotent migration.

## Architecture
- Single column on existing `Employee` table.
- Unique index to prevent two employees claiming same Google account.
- Nullable — preserves existing rows.

## Related Code Files
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_google_id_to_employee/migration.sql`

## Implementation Steps
1. Open `backend/prisma/schema.prisma`, locate `model Employee`.
2. Add field:
   ```prisma
   googleId String? @unique @map("google_id")
   ```
3. Run `npx prisma migrate dev --name add_google_id_to_employee` inside `backend/`.
4. Verify generated migration includes `ALTER TABLE` + `CREATE UNIQUE INDEX`.
5. Run `npx prisma generate` to refresh client types.
6. Smoke check: `npx prisma studio` — confirm column visible & nullable.

## Todo
- [ ] Add `googleId` field to schema.prisma
- [ ] Generate & review migration SQL
- [ ] Apply migration locally
- [ ] Regenerate Prisma client
- [ ] Commit migration

## Success Criteria
- `Employee.googleId` exists, nullable, unique
- Existing rows have `googleId = NULL`
- `npm run build` in backend passes

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Unique constraint violation on production seed data | Column nullable, no backfill — safe |
| Migration drift between envs | Commit migration SQL; run `prisma migrate deploy` in CI |

## Security Considerations
- `googleId` is a stable identifier — treat as PII, do not expose via public API responses; exclude from default DTO serialization.

## Next Steps
- Unblocks Phase 02 (strategy needs the column to persist link).
