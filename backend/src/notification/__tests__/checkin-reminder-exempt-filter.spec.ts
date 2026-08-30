/**
 * Unit test for NotificationService's Telegram check-in reminder — employees
 * flagged attendanceExempt must never receive "you haven't checked in" nags,
 * unconditionally (this is not gated by the report_exclude_attendance_exempt
 * setting — it's a permanent consequence of the flag itself).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from '../notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemConfigService } from '../../system-config/system-config.service';

describe('NotificationService — attendanceExempt reminder exclusion', () => {
  let service: NotificationService;
  let employeeFindManyMock: jest.Mock;

  beforeEach(async () => {
    employeeFindManyMock = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: PrismaService,
          useValue: {
            employee: { findMany: employeeFindManyMock },
            attendance: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        {
          provide: SystemConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) =>
              Promise.resolve(key === 'telegram_bot_token' ? 'fake-token' : 'msg'),
            ),
          },
        },
      ],
    }).compile();

    service = module.get(NotificationService);
  });

  it('always queries employees with attendanceExempt=false, unconditionally', async () => {
    await (service as any).sendCheckinReminders();

    expect(employeeFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ attendanceExempt: false }),
      }),
    );
  });
});
