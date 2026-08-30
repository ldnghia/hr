/**
 * Unit tests for AttendanceExportCombinedService — attendanceExempt exclusion on
 * the direct employee roster fetch (the one path that does NOT go through
 * AttendanceQueryService.getReport, since it must include employees with zero
 * attendance records too).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Writable } from 'stream';
import { AttendanceExportCombinedService } from '../attendance-export-combined.service';
import { AttendanceQueryService } from '../attendance-query.service';
import { PrismaService } from '../../prisma/prisma.service';

function buildPrismaMock() {
  return {
    employee: { findMany: jest.fn().mockResolvedValue([]) },
    leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
    calendarDay: { findMany: jest.fn().mockResolvedValue([]) },
    employeeShiftSchedule: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

/** Minimal writable stream so ExcelJS's `workbook.xlsx.write(res)` resolves cleanly. */
function buildFakeResponse() {
  const res = new Writable({ write(_chunk, _enc, cb) { cb(); } }) as Writable & {
    setHeader: jest.Mock;
  };
  res.setHeader = jest.fn();
  return res;
}

const ADMIN_USER = { id: 1, role: 'admin' };

describe('AttendanceExportCombinedService — attendanceExempt roster filter', () => {
  let service: AttendanceExportCombinedService;
  let prismaMock: ReturnType<typeof buildPrismaMock>;
  let queryServiceMock: { getReport: jest.Mock; isAttendanceExemptExcludedFromReports: jest.Mock };

  async function buildService(excludeExempt: boolean) {
    prismaMock = buildPrismaMock();
    queryServiceMock = {
      getReport: jest.fn().mockResolvedValue({ data: [] }),
      isAttendanceExemptExcludedFromReports: jest.fn().mockResolvedValue(excludeExempt),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceExportCombinedService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AttendanceQueryService, useValue: queryServiceMock },
      ],
    }).compile();

    service = module.get(AttendanceExportCombinedService);
  }

  it('does not filter the employee roster when the setting is off', async () => {
    await buildService(false);

    await service.exportCombined(
      { dateFrom: '2026-08-01', dateTo: '2026-08-31' } as any,
      'FIXED',
      ADMIN_USER,
      buildFakeResponse() as any,
    );

    const where = prismaMock.employee.findMany.mock.calls[0][0].where;
    expect(where.attendanceExempt).toBeUndefined();
  });

  it('adds attendanceExempt=false to the employee roster fetch when the setting is on', async () => {
    await buildService(true);

    await service.exportCombined(
      { dateFrom: '2026-08-01', dateTo: '2026-08-31' } as any,
      'FIXED',
      ADMIN_USER,
      buildFakeResponse() as any,
    );

    const where = prismaMock.employee.findMany.mock.calls[0][0].where;
    expect(where.attendanceExempt).toBe(false);
  });
});
