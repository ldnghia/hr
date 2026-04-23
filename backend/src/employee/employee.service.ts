import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { AdminUpdateEmployeeDto } from './dto/admin-update-employee.dto';
import { ListEmployeeDto } from './dto/list-employee.dto';
import { UpdateMeDto } from '../me/dto/update-me.dto';
import { ChangeMyPasswordDto } from '../me/dto/change-my-password.dto';
import { paginate, buildPaginatedResponse } from '../common/dto/pagination.dto';
import * as bcrypt from 'bcrypt';

const EMPLOYEE_SELECT = {
  id: true,
  code: true,
  fullName: true,
  email: true,
  phone: true,
  status: true,
  role: true,
  telegramId: true,
  branchId: true,
  departmentId: true,
  positionId: true,
  managerId: true,
  joinDate: true,
  createdAt: true,
  updatedAt: true,
  officeId: true,
  workingMode: true,
  shiftId: true,
  branch:      { select: { id: true, name: true } },
  department:  { select: { id: true, name: true, code: true, workingType: true } },
  position:    { select: { id: true, name: true, code: true } },
  manager:     { select: { id: true, fullName: true, code: true, email: true } },
  office:      { select: { id: true, name: true, latitude: true, longitude: true, radius: true } },
  currentShift:{ select: { id: true, name: true, startTime: true, endTime: true, isCrossDay: true } },
};

/** Fields that trigger an EmployeeHistory entry when changed. */
const TRACKED_FIELDS = ['departmentId', 'positionId', 'managerId', 'status', 'role', 'workingMode', 'shiftId', 'telegramId'] as const;
type TrackedField = (typeof TRACKED_FIELDS)[number];

@Injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Validates working-mode / shift consistency relative to the employee's department.
   * - SHIFT dept → workingMode must be SHIFT, shiftId required
   * - FIXED dept → workingMode must be FIXED, shiftId ignored
   */
  private async validateShiftAssignment(
    departmentId: number | undefined,
    workingMode: string | undefined,
    shiftId: number | undefined,
  ) {
    if (!departmentId) return;

    const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw new NotFoundException(`Department ${departmentId} not found`);

    if (dept.workingType === 'SHIFT') {
      if (workingMode && workingMode !== 'SHIFT') {
        throw new BadRequestException(
          `Department "${dept.name}" uses SHIFT working type — employee workingMode must be "SHIFT".`,
        );
      }
      if (!shiftId) {
        throw new BadRequestException(
          `Department "${dept.name}" uses SHIFT working type — a shiftId is required.`,
        );
      }
      // Validate the shift belongs to this department
      const shift = await this.prisma.shift.findFirst({
        where: { id: shiftId, departmentId: dept.id },
      });
      if (!shift) {
        throw new BadRequestException(
          `Shift ${shiftId} does not belong to department "${dept.name}".`,
        );
      }
    } else {
      // FIXED department
      if (workingMode === 'SHIFT') {
        throw new BadRequestException(
          `Department "${dept.name}" uses FIXED working type — employee workingMode cannot be "SHIFT".`,
        );
      }
    }
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(dto: CreateEmployeeDto, actorId: number) {
    const existing = await this.prisma.employee.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    await this.validateShiftAssignment(dto.departmentId, dto.workingMode, dto.shiftId);

    // Resolve effective workingMode from department when not explicitly set
    let workingMode = dto.workingMode ?? 'FIXED';
    if (!dto.workingMode) {
      const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (dept?.workingType === 'SHIFT') workingMode = 'SHIFT';
    }

    const hashedPassword = await bcrypt.hash(
      dto.password,
      parseInt(process.env.BCRYPT_SALT_ROUNDS || '12'),
    );

    const emp = await this.prisma.employee.create({
      data: {
        code:         dto.code,
        fullName:     dto.fullName,
        email:        dto.email,
        password:     hashedPassword,
        phone:        dto.phone,
        branchId:     dto.branchId,
        departmentId: dto.departmentId,
        positionId:   dto.positionId,
        managerId:    dto.managerId,
        status:       dto.status ?? 'probation',
        role:         dto.role   ?? 'employee',
        officeId:     dto.officeId,
        workingMode,
        shiftId:      dto.shiftId,
        telegramId:   dto.telegramId,
      },
      select: EMPLOYEE_SELECT,
    });

    // ── Create initial leave balance ──
    const initialLeave = (dto as any).initialLeaveBalance ?? 12;
    await this.prisma.leaveBalance.create({
      data: {
        employeeId: emp.id,
        total: initialLeave,
        used: 0,
        remaining: initialLeave,
      },
    });

    await this.prisma.leaveAccrualLog.create({
      data: {
        employeeId: emp.id,
        days: initialLeave,
        note: 'Initial balance on creation',
        accrualDate: new Date(),
      },
    });

    // Record initial shift assignment in history
    if (dto.shiftId) {
      await this.prisma.employeeShiftAssignment.create({
        data: {
          employeeId:    emp.id,
          shiftId:       dto.shiftId,
          effectiveDate: new Date(),
        },
      });
    }

    await this.auditService.log(actorId, 'EMPLOYEE_CREATED', 'employee', emp.id, {
      code: dto.code,
      email: dto.email,
      workingMode,
    });

    return emp;
  }

  // ─── Find all / one ───────────────────────────────────────────────────────

  async findAll(dto: ListEmployeeDto) {
    const { page = 1, limit = 20, search, status, role, branchId, departmentId, managerId } = dto;
    const { skip, take } = paginate(page, limit);

    const where: any = {};

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email:    { contains: search, mode: 'insensitive' } },
        { code:     { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status)       where.status       = status;
    if (role)         where.role         = role;
    if (branchId)     where.branchId     = branchId;
    if (departmentId) where.departmentId = departmentId;
    if (managerId)    where.managerId    = managerId;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({ where, select: EMPLOYEE_SELECT, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.employee.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: {
        ...EMPLOYEE_SELECT,
        subordinates: { select: { id: true, fullName: true, code: true, email: true } },
      },
    });
    if (!employee) throw new NotFoundException(`Employee with ID ${id} not found`);
    return employee;
  }

  // ─── Update (with auto history tracking) ─────────────────────────────────

  async update(id: number, dto: UpdateEmployeeDto, actorId: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee with ID ${id} not found`);

    if (dto.code && dto.code !== employee.code) {
      const codeTaken = await this.prisma.employee.findUnique({ where: { code: dto.code } });
      if (codeTaken) throw new ConflictException('Mã nhân viên đã tồn tại');
    }

    if (dto.email && dto.email !== employee.email) {
      const emailTaken = await this.prisma.employee.findUnique({ where: { email: dto.email } });
      if (emailTaken) throw new ConflictException('Email already in use');
    }

    const targetDeptId = dto.departmentId ?? (employee.departmentId ?? undefined);
    const targetMode   = dto.workingMode  ?? (employee.workingMode  ?? undefined);
    const targetShift  = dto.shiftId      ?? (employee.shiftId      ?? undefined);

    // Only validate when department or shift-related fields change
    if (dto.departmentId !== undefined || dto.workingMode !== undefined || dto.shiftId !== undefined) {
      await this.validateShiftAssignment(targetDeptId, targetMode, targetShift);
    }

    // Auto-resolve workingMode on department transfer
    let resolvedWorkingMode = dto.workingMode;
    if (dto.departmentId !== undefined && dto.workingMode === undefined) {
      const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (dept?.workingType === 'SHIFT') resolvedWorkingMode = 'SHIFT';
      else                               resolvedWorkingMode = 'FIXED';
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        code:         dto.code,
        fullName:     dto.fullName,
        email:        dto.email,
        phone:        dto.phone,
        status:       dto.status,
        role:         dto.role,
        branchId:     dto.branchId,
        departmentId: dto.departmentId,
        positionId:   dto.positionId,
        managerId:    dto.managerId,
        officeId:     dto.officeId,
        workingMode:  resolvedWorkingMode,
        shiftId:      dto.shiftId,
        telegramId:   dto.telegramId,
      },
      select: EMPLOYEE_SELECT,
    });

    // ── Auto-insert EmployeeHistory for tracked fields that changed ──────────
    const today = new Date();
    const historyRecords: Array<{
      employeeId: number;
      field: string;
      oldValue: string | null;
      newValue: string | null;
      changedBy: number;
      effectiveDate: Date;
    }> = [];

    for (const field of TRACKED_FIELDS) {
      const dtoValue = dto[field as keyof UpdateEmployeeDto];
      if (dtoValue === undefined) continue;
      const oldRaw = employee[field as keyof typeof employee];
      const oldValue = oldRaw != null ? String(oldRaw) : null;
      const newValue = dtoValue != null ? String(dtoValue) : null;
      if (oldValue !== newValue) {
        historyRecords.push({ employeeId: id, field, oldValue, newValue, changedBy: actorId, effectiveDate: today });
      }
    }

    if (historyRecords.length > 0) {
      await this.prisma.employeeHistory.createMany({ data: historyRecords });
    }

    // Record shift assignment in history table when shift changes
    if (dto.shiftId !== undefined && dto.shiftId !== employee.shiftId) {
      if (dto.shiftId !== null) {
        await this.prisma.employeeShiftAssignment.create({
          data: { employeeId: id, shiftId: dto.shiftId, effectiveDate: today },
        });
      }
    }

    // ── Update initial Leave Balance (admin/hr only) ──
    if (dto.initialLeaveBalance !== undefined) {
      const bal = await this.prisma.leaveBalance.findUnique({ where: { employeeId: id } });
      if (!bal) {
        await this.prisma.leaveBalance.create({
          data: {
            employeeId: id,
            total: dto.initialLeaveBalance,
            used: 0,
            remaining: dto.initialLeaveBalance,
          },
        });
      } else {
        const used = bal.used ? Number(bal.used) : 0;
        const newTotal = dto.initialLeaveBalance;
        const newRemaining = Math.max(newTotal - used, 0);
        await this.prisma.leaveBalance.update({
          where: { employeeId: id },
          data: { total: newTotal, remaining: newRemaining },
        });
      }
      
      await this.prisma.leaveAccrualLog.create({
        data: {
          employeeId: id,
          days: dto.initialLeaveBalance,
          note: 'Admin/HR updated initial balance',
          accrualDate: new Date(),
        },
      });
    }

    await this.auditService.log(actorId, 'EMPLOYEE_UPDATED', 'employee', id, {
      changedFields: historyRecords.map((r) => r.field),
      ...(dto.initialLeaveBalance !== undefined && { updatedInitialLeave: dto.initialLeaveBalance }),
    });

    return updated;
  }

  // ─── Remove ───────────────────────────────────────────────────────────────

  async remove(id: number, actorId: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee with ID ${id} not found`);
    if (id === actorId) throw new ForbiddenException('Cannot deactivate your own account');

    const updated = await this.prisma.employee.update({
      where: { id },
      data: { status: 'resigned' },
      select: EMPLOYEE_SELECT,
    });

    await this.auditService.log(actorId, 'EMPLOYEE_DEACTIVATED', 'employee', id);
    return updated;
  }

  // ─── History ──────────────────────────────────────────────────────────────

  async getHistory(id: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee with ID ${id} not found`);

    return this.prisma.employeeHistory.findMany({
      where: { employeeId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Shift assignment history ──────────────────────────────────────────────

  async getShiftHistory(id: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee with ID ${id} not found`);

    return this.prisma.employeeShiftAssignment.findMany({
      where: { employeeId: id },
      include: { shift: { select: { id: true, name: true, startTime: true, endTime: true, isCrossDay: true } } },
      orderBy: { effectiveDate: 'desc' },
    });
  }

  // ─── Admin: restricted profile update (name/email/phone/status only) ─────────

  async adminUpdateProfile(id: number, dto: AdminUpdateEmployeeDto, actorId: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee with ID ${id} not found`);

    if (dto.email && dto.email !== employee.email) {
      const taken = await this.prisma.employee.findUnique({ where: { email: dto.email } });
      if (taken) throw new ConflictException('Email already in use');
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        email:    dto.email,
        phone:    dto.phone,
        status:   dto.status,
      },
      select: EMPLOYEE_SELECT,
    });

    // Track status change in history
    if (dto.status && dto.status !== employee.status) {
      await this.prisma.employeeHistory.create({
        data: {
          employeeId:    id,
          field:         'status',
          oldValue:      employee.status,
          newValue:      dto.status,
          changedBy:     actorId,
          effectiveDate: new Date(),
        },
      });
    }

    await this.auditService.log(actorId, 'EMPLOYEE_PROFILE_UPDATED', 'employee', id, {
      changedFields: Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined),
    });

    return updated;
  }

  // ─── Admin: reset employee password ───────────────────────────────────────

  async updatePassword(id: number, newPassword: string, actorId: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee with ID ${id} not found`);

    const hashed = await bcrypt.hash(
      newPassword,
      parseInt(process.env.BCRYPT_SALT_ROUNDS || '12'),
    );

    await this.prisma.employee.update({ where: { id }, data: { password: hashed } });
    await this.auditService.log(actorId, 'EMPLOYEE_PASSWORD_RESET', 'employee', id);

    return { success: true };
  }

  // ─── Self: get own profile ─────────────────────────────────────────────────

  async getMe(userId: number) {
    return this.findOne(userId);
  }

  // ─── Self: update own profile (name/email/phone) ───────────────────────────

  async updateMe(userId: number, dto: UpdateMeDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id: userId } });
    if (!employee) throw new NotFoundException('Profile not found');

    if (dto.email && dto.email !== employee.email) {
      const taken = await this.prisma.employee.findUnique({ where: { email: dto.email } });
      if (taken) throw new ConflictException('Email already in use');
    }

    const updated = await this.prisma.employee.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName,
        email:    dto.email,
        phone:    dto.phone,
      },
      select: EMPLOYEE_SELECT,
    });

    await this.auditService.log(userId, 'EMPLOYEE_SELF_UPDATED', 'employee', userId, {
      changedFields: Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined),
    });

    return updated;
  }

  // ─── Self: change own password ────────────────────────────────────────────

  async updateMyPassword(userId: number, dto: ChangeMyPasswordDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id: userId } });
    if (!employee) throw new NotFoundException('Profile not found');

    const valid = await bcrypt.compare(dto.currentPassword, employee.password ?? '');
    if (!valid) throw new ForbiddenException('Current password is incorrect');

    const hashed = await bcrypt.hash(
      dto.newPassword,
      parseInt(process.env.BCRYPT_SALT_ROUNDS || '12'),
    );

    await this.prisma.employee.update({ where: { id: userId }, data: { password: hashed } });
    await this.auditService.log(userId, 'EMPLOYEE_PASSWORD_CHANGED', 'employee', userId);

    return { success: true };
  }
}
