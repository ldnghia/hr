/**
 * Unit tests for FIXED-mode employee attendance (check-in / check-out).
 *
 * Covers: on-time, late, early-checkout, overtime, duplicate guard, no-session
 * guard, GPS/location validation, location-note bypass.
 *
 * All I/O layers (Prisma, LocationService, CalendarService) are mocked so
 * tests run without a real database.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AttendanceCheckinService } from '../attendance-checkin.service';
import { ShiftResolverService } from '../helpers/shift-resolver';
import { LocationService } from '../location.service';
import { CalendarService } from '../../calendar/calendar.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceValidationService } from '../../device/device-validation.service';
import type { ShiftLike } from '../helpers/shift-resolver';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a Date where local clock reads hh:mm on 2025-06-10.
 * computeSessionFlags uses getHours()/getMinutes() (local time), so tests
 * must set local hours to match the shift window strings like "08:00".
 */
function localAt(hour: number, minute = 0): Date {
  const d = new Date(2025, 5, 10); // June 10 2025, local midnight
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Morning shift 08:00–17:00, no cross-day */
const MORNING_SHIFT: ShiftLike = {
  id: 1,
  name: 'Morning',
  startTime: '08:00',
  endTime: '17:00',
  isCrossDay: false,
  graceLateMinutes: 10,
  graceEarlyMinutes: 10,
  breakMinutes: 60,
};

// ─── Mock factories ───────────────────────────────────────────────────────────

function buildPrismaMock(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    employee: {
      findUnique: jest.fn().mockResolvedValue({
        shiftId: 1,
        workingMode: 'FIXED',
        departmentId: 10,
        office: { latitude: 10.0, longitude: 106.0, radius: 100, name: 'HQ' },
      }),
    },
    attendance: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockImplementation(({ create }) =>
        Promise.resolve({ id: 99, ...create }),
      ),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 99, ...data }),
      ),
    },
    attendanceLog: { create: jest.fn().mockResolvedValue({}) },
    branch: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

function buildShiftResolverMock(shift = MORNING_SHIFT) {
  return { resolveTargetShift: jest.fn().mockResolvedValue(shift) };
}

function buildLocationMock(withinRadius = false) {
  return {
    findNearest: jest.fn().mockResolvedValue(
      withinRadius
        ? { locationId: 5, name: 'HQ', distanceM: 20, withinRadius: true }
        : null,
    ),
  };
}

function buildCalendarMock() {
  return { checkDay: jest.fn().mockResolvedValue({ isHoliday: false, isWeekend: false }) };
}

function buildDeviceValidationMock() {
  return {
    validateForCheckIn: jest.fn().mockResolvedValue({ unknown: false }),
    validateForCheckOut: jest.fn().mockResolvedValue({ unknown: false }),
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AttendanceCheckinService — FIXED employee', () => {
  let service: AttendanceCheckinService;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  async function buildService(
    prismaOverrides = {},
    shiftOverride?: ShiftLike,
  ): Promise<void> {
    prismaMock = buildPrismaMock(prismaOverrides);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceCheckinService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ShiftResolverService, useValue: buildShiftResolverMock(shiftOverride) },
        { provide: LocationService, useValue: buildLocationMock(true) }, // default: within geofence
        { provide: CalendarService, useValue: buildCalendarMock() },
        { provide: DeviceValidationService, useValue: buildDeviceValidationMock() },
      ],
    }).compile();

    service = module.get(AttendanceCheckinService);
  }

  // ── 1. Normal check-in (on-time) ────────────────────────────────────────────

  describe('checkIn — on-time', () => {
    it('should create an attendance record with isLate: false when checking in at shift start', async () => {
      await buildService();

      const result = await service.checkIn(1, {
        timestamp: localAt(8, 5).toISOString(), // 08:05 — within 10-min grace
        lat: 10.0,
        lng: 106.0,
      });

      expect(result.isLate).toBe(false);
      expect(prismaMock.attendance.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = prismaMock.attendance.upsert.mock.calls[0][0];
      expect(upsertCall.create).toMatchObject({ employeeId: 1, isLate: false });
    });
  });

  // ── 2. Late check-in ────────────────────────────────────────────────────────

  describe('checkIn — late', () => {
    it('should mark isLate: true when checking in after start + graceLateMinutes', async () => {
      await buildService();

      const result = await service.checkIn(1, {
        timestamp: localAt(8, 15).toISOString(), // 08:15 → 15 min late, grace is 10
        lat: 10.0,
        lng: 106.0,
      });

      expect(result.isLate).toBe(true);
      const upsertCall = prismaMock.attendance.upsert.mock.calls[0][0];
      expect(upsertCall.create.isLate).toBe(true);
    });
  });

  // ── 3. Duplicate check-in guard ─────────────────────────────────────────────

  describe('checkIn — duplicate guard', () => {
    it('should throw BadRequestException when employee already checked in for the shift today', async () => {
      await buildService({
        attendance: {
          findUnique: jest.fn().mockResolvedValue({ checkinTime: localAt(8, 5) }),
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          upsert: jest.fn(),
          update: jest.fn(),
        },
      });

      await expect(
        service.checkIn(1, { timestamp: localAt(8, 30).toISOString(), lat: 10.0, lng: 106.0 }),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.attendance.upsert).not.toHaveBeenCalled();
    });
  });

  // ── 4. GPS location required when outside all geofences ─────────────────────

  describe('checkIn — location validation', () => {
    it('should throw BadRequestException when no GPS and no locationNote', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AttendanceCheckinService,
          {
            provide: PrismaService,
            useValue: {
              ...buildPrismaMock(),
              employee: {
                findUnique: jest.fn().mockResolvedValue({
                  shiftId: 1,
                  workingMode: 'FIXED',
                  office: { latitude: 10.0, longitude: 106.0, radius: 100, name: 'HQ' },
                }),
              },
              branch: { findMany: jest.fn().mockResolvedValue([]) },
            },
          },
          { provide: ShiftResolverService, useValue: buildShiftResolverMock() },
          { provide: LocationService, useValue: buildLocationMock(false) }, // NOT within geofence
          { provide: CalendarService, useValue: buildCalendarMock() },
          { provide: DeviceValidationService, useValue: buildDeviceValidationMock() },
        ],
      }).compile();

      const svc = module.get(AttendanceCheckinService);

      // No lat/lng, no locationNote → should throw
      await expect(
        svc.checkIn(1, { timestamp: localAt(8, 5).toISOString() }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow check-in with locationNote even when GPS missing', async () => {
      const prisma = buildPrismaMock({
        employee: {
          findUnique: jest.fn().mockResolvedValue({
            shiftId: 1,
            workingMode: 'FIXED',
            office: { latitude: 10.0, longitude: 106.0, radius: 100, name: 'HQ' },
          }),
        },
        branch: { findMany: jest.fn().mockResolvedValue([]) },
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AttendanceCheckinService,
          { provide: PrismaService, useValue: prisma },
          { provide: ShiftResolverService, useValue: buildShiftResolverMock() },
          { provide: LocationService, useValue: buildLocationMock(false) },
          { provide: CalendarService, useValue: buildCalendarMock() },
          { provide: DeviceValidationService, useValue: buildDeviceValidationMock() },
        ],
      }).compile();

      const svc = module.get(AttendanceCheckinService);

      const result = await svc.checkIn(1, {
        timestamp: localAt(8, 5).toISOString(),
        locationNote: 'Working from client site',
      });

      expect(result.attendance).toBeDefined();
      expect(prisma.attendance.upsert).toHaveBeenCalledTimes(1);
    });
  });

  // ── 5. Normal check-out ─────────────────────────────────────────────────────

  describe('checkOut — normal', () => {
    it('should compute correct workingHours and isEarlyOut: false for full-day session', async () => {
      const checkinTs = localAt(8, 0);

      await buildService({
        attendance: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([
            { id: 99, shiftId: 1, checkinTime: checkinTs, checkoutTime: null, shift: MORNING_SHIFT },
          ]),
          upsert: jest.fn(),
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data })),
        },
      });

      const result = await service.checkOut(1, {
        timestamp: localAt(17, 0).toISOString(), // exactly end time
        lat: 10.0,
        lng: 106.0,
      });

      // Raw = 9h, minus 1h break = 8h working
      expect(result.workingHours).toBe(8);
      expect(result.isEarlyOut).toBe(false);
      expect(result.isOvertime).toBe(false);
    });
  });

  // ── 6. Early check-out ──────────────────────────────────────────────────────

  describe('checkOut — early exit', () => {
    it('should mark isEarlyOut: true when checking out before endTime - graceEarlyMinutes', async () => {
      const checkinTs = localAt(8, 0);

      await buildService({
        attendance: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([
            { id: 99, shiftId: 1, checkinTime: checkinTs, checkoutTime: null, shift: MORNING_SHIFT },
          ]),
          upsert: jest.fn(),
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data })),
        },
      });

      const result = await service.checkOut(1, {
        timestamp: localAt(15, 0).toISOString(), // 15:00 — 2h early (grace is 10min)
        lat: 10.0,
        lng: 106.0,
      });

      expect(result.isEarlyOut).toBe(true);
    });
  });

  // ── 7. Overtime check-out ───────────────────────────────────────────────────

  describe('checkOut — overtime', () => {
    it('should mark isOvertime: true and compute overtimeHours when working beyond shift end', async () => {
      const checkinTs = localAt(8, 0);

      await buildService({
        attendance: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([
            { id: 99, shiftId: 1, checkinTime: checkinTs, checkoutTime: null, shift: MORNING_SHIFT },
          ]),
          upsert: jest.fn(),
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data })),
        },
      });

      const result = await service.checkOut(1, {
        timestamp: localAt(19, 0).toISOString(), // 19:00 — 2h over end
        lat: 10.0,
        lng: 106.0,
      });

      expect(result.isOvertime).toBe(true);
      expect(result.overtimeHours).toBeGreaterThan(0);
      // Raw 11h - 1h break = 10h; normal = 8h; overtime = 2h
      expect(result.overtimeHours).toBe(2);
    });
  });

  // ── 8. No open session guard ─────────────────────────────────────────────────

  describe('checkOut — no open session', () => {
    it('should throw BadRequestException when employee has no open check-in session', async () => {
      await buildService({
        attendance: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]), // no open sessions
          upsert: jest.fn(),
          update: jest.fn(),
        },
      });

      await expect(
        service.checkOut(1, {
          timestamp: localAt(17, 0).toISOString(),
          lat: 10.0,
          lng: 106.0,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── 9. Direct checkout via attendanceId ─────────────────────────────────────

  describe('checkOut — by attendanceId', () => {
    it('should close a previous-day unclosed session directly by attendanceId', async () => {
      const checkinTs = localAt(8, 0);

      await buildService({
        attendance: {
          findUnique: jest.fn().mockResolvedValue({
            id: 42,
            employeeId: 1,
            checkinTime: checkinTs,
            checkoutTime: null,
            shift: MORNING_SHIFT,
          }),
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          upsert: jest.fn(),
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 42, ...data })),
        },
      });

      const result = await service.checkOut(1, {
        attendanceId: 42,
        timestamp: localAt(9, 0).toISOString(), // next day morning
        lat: 10.0,
        lng: 106.0,
      });

      expect(result.attendance).toBeDefined();
      expect(prismaMock.attendance.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 42 } }),
      );
    });
  });

  // ── 10. Shift returned in check-in response ──────────────────────────────────

  describe('checkIn — response shape', () => {
    it('should return shift info and location in the response', async () => {
      await buildService();

      const result = await service.checkIn(1, {
        timestamp: localAt(8, 5).toISOString(),
        lat: 10.0,
        lng: 106.0,
      });

      expect(result.shift).toMatchObject({
        id: MORNING_SHIFT.id,
        startTime: MORNING_SHIFT.startTime,
        endTime: MORNING_SHIFT.endTime,
      });
      expect(result.locationSource).toBe('GPS');
    });
  });
});
