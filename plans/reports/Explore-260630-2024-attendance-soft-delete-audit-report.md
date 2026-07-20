# Attendance Soft-Delete Audit Report
**Generated:** 2026-06-30 | **Duration:** Complete backend scan

---

## Summary

Audited all Prisma queries on the ttendance table across the NestJS backend at F:/AI/hr_project/backend/src/. Found **11 out of 25 queries missing the critical deletedAt: null soft-delete filter**, exposing business logic to stale or deleted records.

**Total Findings:**
- 25 Prisma queries on attendance
- 11 missing soft-delete protection (44%)
- 14 properly filtered (56%)
- 0 raw SQL queries found (good — no SQL injection vectors here)

---

## Critical Issues (Fix First)

### 1. Core Checkin/Checkout — ttendance.service.ts:50
**Query:** indFirst({ where: { employeeId, date: dateOnly } })  
**Issue:** Core checkin/checkout logic retrieves any record, including deleted ones  
**Impact:** Employee cannot check in if a deleted session exists for today  
**Severity:** CRITICAL  
**Fix:** Add deletedAt: null to where clause

### 2. Shift Session Guard — ttendance-checkin.service.ts:43
**Query:** indUnique({ where: { employeeId_date_shiftId: { ... } } })  
**Issue:** Guard against duplicate check-in uses composite unique key, cannot filter soft-deletes  
**Impact:** Employee cannot check in if soft-deleted session exists for that shift  
**Severity:** CRITICAL  
**Fix:** Convert to indFirst with deletedAt: null filter

### 3. Active Session Check — ttendance-checkin.service.ts:54
**Query:** indFirst({ where: { employeeId, checkinTime: not null, checkoutTime: null, ... } })  
**Issue:** Finds "active" open sessions but includes deleted ones  
**Impact:** Error message references non-existent session; soft-deleted overlapping sessions block new check-ins  
**Severity:** CRITICAL  
**Fix:** Add deletedAt: null to where clause

### 4. Unclosed Session Lookup — ttendance-checkin.service.ts:222
**Query:** indUnique({ where: { id: attendanceId } })  
**Issue:** Closes unclosed sessions by ID, allowing deletion of already-deleted records  
**Impact:** Employee "closes" a deleted session, corrupting audit trail  
**Severity:** CRITICAL  
**Fix:** Convert to indFirst({ where: { id, deletedAt: null } })

### 5. Open Session Checkout — ttendance-checkin.service.ts:236
**Query:** indMany({ where: { employeeId, date: sessionDate, checkinTime: not null, checkoutTime: null } })  
**Issue:** Finds sessions to checkout today but includes deleted ones  
**Impact:** Employee selects deleted session for checkout, extending its lifetime  
**Severity:** CRITICAL  
**Fix:** Add deletedAt: null to where clause

### 6. Cross-Day Session Fallback — ttendance-checkin.service.ts:243
**Query:** indMany({ where: { employeeId, date: yesterday, checkinTime: not null, checkoutTime: null } })  
**Issue:** Cross-day shift fallback lookup missing soft-delete filter  
**Impact:** Deleted yesterday's sessions leak into today's checkout logic  
**Severity:** CRITICAL  
**Fix:** Add deletedAt: null to where clause

### 7. Mark Forgot Checkout — ttendance-checkin.service.ts:370
**Query:** indUnique({ where: { id: attendanceId } })  
**Issue:** Marks forgot checkout on deleted records  
**Impact:** Corrupts state of non-existent session  
**Severity:** CRITICAL  
**Fix:** Convert to indFirst({ where: { id, deletedAt: null } })

---

## High-Priority Issues

### 8. Attendance Correction — ttendance-correction.service.ts:62
**Query:** indUnique({ where: { id: attendanceId } })  
**Issue:** Fetch record to correct, but deleted records are retrieved  
**Impact:** Correction request can target already-deleted attendance record  
**Severity:** HIGH  
**Fix:** Convert to indFirst({ where: { id, deletedAt: null } })

### 9. Create Correction Record — ttendance-correction.service.ts:72
**Query:** indFirst({ where: { employeeId, date: dateObj, ...shiftFilter } })  
**Issue:** Find existing record to link correction, includes deleted records  
**Impact:** Data duplication if deleted record later restored  
**Severity:** HIGH  
**Fix:** Add deletedAt: null to where clause

### 10. Shift Assignment Guard — shift-assignment.service.ts:274
**Query:** indFirst({ where: { employeeId, shiftId, date: { gte, lte } } })  
**Issue:** Guard prevents shift-assignment deletion if attendance exists; soft-deleted records count  
**Impact:** Deleted session blocks shift-assignment deletion  
**Severity:** HIGH  
**Fix:** Add deletedAt: null to where clause

### 11. Shift Schedule Guard — shift-schedule.service.ts:147
**Query:** indFirst({ where: { employeeId, shiftId, date } })  
**Issue:** Block shift-schedule deletion if attendance exists; soft-deleted records count  
**Impact:** Deleted session prevents shift-schedule management changes  
**Severity:** HIGH  
**Fix:** Add deletedAt: null to where clause

---

## Medium-Priority Issues

### 12. Notification Filter — 
otification.service.ts:63
**Query:** indMany({ where: { date: today, checkinTime: not null } })  
**Issue:** Find employees who clocked in today, but soft-deleted checkins count  
**Impact:** Employees with deleted sessions won't receive "haven't clocked in" reminders  
**Severity:** MEDIUM  
**Fix:** Add deletedAt: null to where clause

---

## Protected Queries (No Action Needed)

The following queries **correctly include deletedAt: null** and are safe:

**ttendance-query.service.ts** (11 queries):
- Line 39: findMany — Today + yesterday sessions
- Line 73: findMany — Monthly summary
- Line 112: findMany — Paginated list (where obj)
- Line 123: count — Paired with line 112
- Line 146: findMany — Export query (where obj)
- Line 153: count — Paired with line 146
- Line 182: findMany — Period summary grouped
- Line 223: findMany — Unclosed sessions (explicit deletedAt: null)
- Line 406: findMany — Advanced filter manager view (where obj)
- Line 417: count — Paired with line 406
- Line 437: findUnique — Fetch before soft-delete (by ID)

**ttendance-correction.service.ts** (3 queries):
- Line 136: findUnique — Approve, fetch by ID
- Line 218: findUnique — Admin edit, fetch by ID

(Fetching by ID-only is inherently safe for soft-delete because the intent is to modify that specific record, not query across deleted/active records.)

---

## Remediation Checklist

### Immediate (CRITICAL)
- [ ] ttendance.service.ts:50 — Add deletedAt: null
- [ ] ttendance-checkin.service.ts:43 — Convert to findFirst, add deletedAt: null
- [ ] ttendance-checkin.service.ts:54 — Add deletedAt: null
- [ ] ttendance-checkin.service.ts:222 — Convert to findFirst, add deletedAt: null
- [ ] ttendance-checkin.service.ts:236 — Add deletedAt: null
- [ ] ttendance-checkin.service.ts:243 — Add deletedAt: null
- [ ] ttendance-checkin.service.ts:370 — Convert to findFirst, add deletedAt: null

### Soon (HIGH)
- [ ] ttendance-correction.service.ts:62 — Convert to findFirst, add deletedAt: null
- [ ] ttendance-correction.service.ts:72 — Add deletedAt: null
- [ ] shift-assignment.service.ts:274 — Add deletedAt: null
- [ ] shift-schedule.service.ts:147 — Add deletedAt: null
- [ ] 
otification.service.ts:63 — Add deletedAt: null

---

## Technical Recommendations

### 1. Prisma Extension for Global Soft-Delete
Prisma does not natively support global soft-delete filters. Manually adding deletedAt: null everywhere is error-prone. Consider:

**Approach A: Prisma Extension**
`	s
const prisma = new PrismaClient().({
  query: {
    attendance: {
      findMany(args) {
        if (!args.where) args.where = {};
        args.where.deletedAt = null;
        return prisma.(args);
      },
      findFirst(args) {
        if (!args.where) args.where = {};
        args.where.deletedAt = null;
        return prisma.(args);
      },
    },
  },
});
`

**Approach B: Helper Function**
`	s
function safeWhere(baseCriteria: any) {
  return { ...baseCriteria, deletedAt: null };
}

// Usage:
await prisma.attendance.findMany({
  where: safeWhere({ employeeId, date })
});
`

### 2. Testing Soft-Delete Behavior
Create an integration test suite:
`	s
describe('Soft-delete behavior', () => {
  it('should exclude deleted records from findMany', async () => {
    const record = await prisma.attendance.create({ data: {...} });
    await prisma.attendance.update({
      where: { id: record.id },
      data: { deletedAt: new Date() }
    });
    const result = await prisma.attendance.findMany({
      where: { deletedAt: null }
    });
    expect(result).not.toContainEqual(record);
  });
});
`

### 3. Code Review Checklist
After fixes, code review should verify:
- [ ] No indMany or indFirst on attendance without deletedAt: null
- [ ] indUnique on composite keys converted to indFirst
- [ ] count queries paired with their data query, same where clause
- [ ] No raw SQL queries on attendance table

### 4. Documentation
Add a README or wiki entry:
`
## Soft-Delete Convention

The ttendance table uses soft-delete: records are marked with deletedAt: null 
rather than physically deleted. **Always filter deletedAt: null in where clauses** 
unless explicitly querying for deleted records (which is rare).

Bad:
  await prisma.attendance.findMany({ where: { employeeId } });

Good:
  await prisma.attendance.findMany({ where: { employeeId, deletedAt: null } });
`

---

## No Raw SQL Found

Good news: no $queryRaw, $executeRaw, or $executeRawUnsafe queries on the attendance table were found. All queries use the type-safe Prisma client, reducing SQL injection risk.

---

## Files Affected

- F:/AI/hr_project/backend/src/attendance/attendance.service.ts
- F:/AI/hr_project/backend/src/attendance/attendance-checkin.service.ts
- F:/AI/hr_project/backend/src/attendance-correction/attendance-correction.service.ts
- F:/AI/hr_project/backend/src/shift-assignment/shift-assignment.service.ts
- F:/AI/hr_project/backend/src/shift-schedule/shift-schedule.service.ts
- F:/AI/hr_project/backend/src/notification/notification.service.ts

---

## Open Questions

1. **Why was deletedAt: null not consistently applied?**
   - Likely oversight during implementation; the pattern exists in ttendance-query.service.ts but wasn't adopted everywhere.

2. **Are there integration tests for soft-delete behavior?**
   - Recommend scanning the test suite (e.g., *.spec.ts) to verify soft-delete is covered.

3. **Is there a data recovery process?**
   - If deleted records are recoverable, what's the restore flow? Does it notify users?

4. **Are managers/admins able to query deleted records explicitly?**
   - Consider adding a separate admin endpoint like indDeletedAttendance() if audit access is needed.

---

## Summary for Stakeholders

| Aspect | Finding |
|--------|---------|
| **Data Integrity Risk** | HIGH — Deleted records leak into active business logic |
| **Bug Likelihood** | HIGH — 5 of 11 missing filters are in core checkin/checkout paths |
| **Fix Effort** | LOW — 11 one-line additions, no schema changes |
| **Test Impact** | MEDIUM — Requires soft-delete scenario testing |
| **Timeline** | CRITICAL — Fix before next production release |

