/**
 * Unit tests for AttendanceQueryService.getReport — attendanceExempt report-exclusion.
 *
 * getReport is the single point every attendance report/export (grid, summary,
 * detail, combined, on-screen admin report, ops-dashboard trend) reads from, so
 * this is the authoritative test for the report_exclude_attendance_exempt setting.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceQueryService } from '../attendance-query.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CalendarService } from '../../calendar/calendar.service';
import { SystemConfigService } from '../../system-config/system-config.service';

function buildPrismaMock() {
  return {
    attendance: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    leaveRequest: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

const ADMIN_USER = { id: 1, role: 'admin' };

describe('AttendanceQueryService.getReport — attendanceExempt report filter', () => {
  let service: AttendanceQueryService;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  async function buildService(configValue: string | null) {
    prismaMock = buildPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceQueryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CalendarService, useValue: { checkDay: jest.fn() } },
        { provide: SystemConfigService, useValue: { get: jest.fn().mockResolvedValue(configValue) } },
      ],
    }).compile();

    service = module.get(AttendanceQueryService);
  }

  function whereAnd() {
    return prismaMock.attendance.findMany.mock.calls[0][0].where.AND as unknown[];
  }

  it('does not add an exemption clause when the setting is off (default)', async () => {
    await buildService('false');

    await service.getReport({ page: 1, limit: 20 }, ADMIN_USER);

    expect(whereAnd()).not.toContainEqual({ employee: { attendanceExempt: false } });
  });

  it('does not add an exemption clause when the setting is unset (null)', async () => {
    await buildService(null);

    await service.getReport({ page: 1, limit: 20 }, ADMIN_USER);

    expect(whereAnd()).not.toContainEqual({ employee: { attendanceExempt: false } });
  });

  it('adds employee.attendanceExempt=false to the AND clause when the setting is on', async () => {
    await buildService('true');

    await service.getReport({ page: 1, limit: 20 }, ADMIN_USER);

    expect(whereAnd()).toContainEqual({ employee: { attendanceExempt: false } });
  });

  it('combines with existing RBAC/date/dept filters rather than replacing them', async () => {
    await buildService('true');

    await service.getReport(
      { page: 1, limit: 20, departmentId: 5, dateFrom: '2026-08-01', dateTo: '2026-08-31' },
      { id: 7, role: 'manager' },
    );

    const and = whereAnd();
    expect(and).toContainEqual({ employee: { attendanceExempt: false } });
    expect(and).toContainEqual({ employee: { departmentId: 5 } });
    expect(and.some((c: any) => c.OR?.some((o: any) => o.employeeId === 7))).toBe(true);
  });
});
