/**
 * Unit tests for EmployeeService.findAll — attendanceExempt report-exclusion filter.
 *
 * Behavior under test:
 *  - excludeAttendanceExempt=false/undefined → never filters, regardless of setting.
 *  - excludeAttendanceExempt=true + setting off (default) → still no filter (include all).
 *  - excludeAttendanceExempt=true + setting on → where.attendanceExempt=false is applied.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EmployeeService } from '../employee.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SystemConfigService } from '../../system-config/system-config.service';

function buildPrismaMock() {
  return {
    employee: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

describe('EmployeeService.findAll — attendanceExempt report filter', () => {
  let service: EmployeeService;
  let prismaMock: ReturnType<typeof buildPrismaMock>;
  let systemConfigMock: { get: jest.Mock };

  async function buildService(configValue: string | null) {
    prismaMock = buildPrismaMock();
    systemConfigMock = { get: jest.fn().mockResolvedValue(configValue) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: SystemConfigService, useValue: systemConfigMock },
      ],
    }).compile();

    service = module.get(EmployeeService);
  }

  it('does not filter when excludeAttendanceExempt is omitted, even if the setting is on', async () => {
    await buildService('true');

    await service.findAll({ page: 1, limit: 20 });

    const where = prismaMock.employee.findMany.mock.calls[0][0].where;
    expect(where.attendanceExempt).toBeUndefined();
    expect(systemConfigMock.get).not.toHaveBeenCalled();
  });

  it('does not filter when excludeAttendanceExempt=true but the setting is off (default)', async () => {
    await buildService('false');

    await service.findAll({ page: 1, limit: 20, excludeAttendanceExempt: true });

    const where = prismaMock.employee.findMany.mock.calls[0][0].where;
    expect(where.attendanceExempt).toBeUndefined();
    expect(systemConfigMock.get).toHaveBeenCalledWith('report_exclude_attendance_exempt');
  });

  it('filters attendanceExempt=false when excludeAttendanceExempt=true and the setting is on', async () => {
    await buildService('true');

    await service.findAll({ page: 1, limit: 20, excludeAttendanceExempt: true });

    const where = prismaMock.employee.findMany.mock.calls[0][0].where;
    expect(where.attendanceExempt).toBe(false);
  });

  it('does not filter when the setting value is missing (null) even if requested', async () => {
    await buildService(null);

    await service.findAll({ page: 1, limit: 20, excludeAttendanceExempt: true });

    const where = prismaMock.employee.findMany.mock.calls[0][0].where;
    expect(where.attendanceExempt).toBeUndefined();
  });
});
