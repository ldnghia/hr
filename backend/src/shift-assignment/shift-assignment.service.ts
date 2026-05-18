import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignShiftDto } from './dto/assign-shift.dto';
import { BulkAssignShiftDto } from './dto/bulk-assign-shift.dto';
import { InitializeMonthDto, CopyFromPreviousDto, ResetToDefaultDto } from './dto/initialize-month.dto';

@Injectable()
export class ShiftAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Scope helpers ─────────────────────────────────────────────────────────

  /** Build employee WHERE clause based on requester role */
  private buildEmployeeScope(
    requesterId: number,
    requesterRole: string,
    filters: { departmentId?: number; branchId?: number },
  ) {
    const where: Record<string, unknown> = {
      status: { notIn: ['resigned', 'inactive'] },
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
    };

    // manager: dept scoping handled in getMonthMatrix, no extra restriction here

    return where;
  }

  // ── GET matrix ────────────────────────────────────────────────────────────

  async getMonthMatrix(
    year: number,
    month: number,
    filters: { departmentId?: number; branchId?: number },
    requesterId: number,
    requesterRole: string,
  ) {
    // For managers: auto-scope to their own department (includes themselves)
    let effectiveFilters = { ...filters };
    if (requesterRole === 'manager' && !filters.departmentId && !filters.branchId) {
      const mgr = await this.prisma.employee.findUnique({
        where: { id: requesterId },
        select: { departmentId: true, branchId: true },
      });
      if (mgr?.departmentId) effectiveFilters.departmentId = mgr.departmentId;
      else if (mgr?.branchId) effectiveFilters.branchId = mgr.branchId;
    }

    const employeeWhere = this.buildEmployeeScope(requesterId, requesterRole, effectiveFilters);

    const [employees, shifts] = await Promise.all([
      this.prisma.employee.findMany({
        where: employeeWhere,
        select: {
          id: true,
          code: true,
          fullName: true,
          shiftId: true,
          workingMode: true,
          department: { select: { id: true, name: true } },
        },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.shift.findMany({
        where: { isActive: true },
        select: { id: true, name: true, startTime: true, endTime: true, departmentId: true, isDefault: true },
        // isDefault=true first, then by startTime
        orderBy: [{ isDefault: 'desc' }, { startTime: 'asc' }],
      }),
    ]);

    if (employees.length === 0) {
      return { initialized: false, rows: [], shifts };
    }

    const employeeIds = employees.map((e) => e.id);

    const assignments = await this.prisma.employeeShiftAssignment.findMany({
      where: { year, month, employeeId: { in: employeeIds } },
      select: {
        id: true,
        employeeId: true,
        shiftId: true,
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
    });

    const initialized = assignments.length > 0;

    // Build per-employee assignment map
    const assignMap = new Map<number, typeof assignments>();
    for (const a of assignments) {
      if (!assignMap.has(a.employeeId)) assignMap.set(a.employeeId, []);
      assignMap.get(a.employeeId)!.push(a);
    }

    const rows = employees.map((emp) => ({
      employee: {
        id: emp.id,
        code: emp.code,
        fullName: emp.fullName,
        department: emp.department,
        defaultShiftId: emp.shiftId,
        workingMode: emp.workingMode ?? 'FIXED',
      },
      assignments: (assignMap.get(emp.id) ?? []).map((a) => ({
        assignmentId: a.id,
        shiftId: a.shiftId,
        shiftName: a.shift.name,
        startTime: a.shift.startTime,
        endTime: a.shift.endTime,
        isDefault: a.shiftId === emp.shiftId,
      })),
    }));

    return { initialized, rows, shifts };
  }

  // ── GET my assignments ────────────────────────────────────────────────────

  async getMyAssignments(year: number, month: number, employeeId: number) {
    const assignments = await this.prisma.employeeShiftAssignment.findMany({
      where: { year, month, employeeId },
      include: {
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
    });
    return assignments;
  }

  // ── Initialize month ──────────────────────────────────────────────────────

  async initializeMonth(dto: InitializeMonthDto) {
    const { year, month, departmentId } = dto;

    const [employees, deptShifts, fixedShift] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          status: { notIn: ['resigned', 'inactive'] },
          ...(departmentId ? { departmentId } : {}),
        },
        select: { id: true, shiftId: true, departmentId: true, workingMode: true },
      }),
      // Dept-linked shifts for SHIFT employees
      this.prisma.shift.findMany({
        where: { isActive: true, departmentId: { not: null } },
        select: { id: true, departmentId: true },
      }),
      // The system-default shift for FIXED employees
      this.prisma.shift.findFirst({
        where: { isActive: true, isDefault: true },
        select: { id: true },
      }),
    ]);

    const deptToShift = new Map<number, number>();
    for (const s of deptShifts) {
      if (s.departmentId !== null) deptToShift.set(s.departmentId, s.id);
    }

    const effectiveDate = new Date(year, month - 1, 1);

    const data = employees
      .map((e) => {
        let resolvedShiftId: number | null;

        if (e.workingMode === 'FIXED') {
          // FIXED employees always use the system-default (isDefault=true) shift
          resolvedShiftId = fixedShift?.id ?? e.shiftId ?? null;
        } else {
          // SHIFT employees: dept-linked shift → employee default
          resolvedShiftId =
            (e.departmentId ? deptToShift.get(e.departmentId) : undefined) ??
            e.shiftId ??
            null;
        }

        if (resolvedShiftId === null) return null;
        return { employeeId: e.id, shiftId: resolvedShiftId, year, month, effectiveDate };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    const result = await this.prisma.employeeShiftAssignment.createMany({
      data,
      skipDuplicates: true,
    });

    return { created: result.count, skipped: data.length - result.count };
  }

  // ── Copy from previous month ──────────────────────────────────────────────

  async copyFromPrevious(dto: CopyFromPreviousDto) {
    const { year, month, departmentId } = dto;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;

    const prev = await this.prisma.employeeShiftAssignment.findMany({
      where: {
        year: prevYear,
        month: prevMonth,
        ...(departmentId
          ? { employee: { departmentId } }
          : {}),
      },
      select: { employeeId: true, shiftId: true },
    });

    if (prev.length === 0) {
      return { copied: 0 };
    }

    const result = await this.prisma.employeeShiftAssignment.createMany({
      data: prev.map((a) => ({
        employeeId: a.employeeId,
        shiftId: a.shiftId,
        year,
        month,
        effectiveDate: new Date(year, month - 1, 1),
      })),
      skipDuplicates: true,
    });

    return { copied: result.count };
  }

  // ── Assign one ────────────────────────────────────────────────────────────

  async assign(
    dto: AssignShiftDto,
    requesterId: number,
    requesterRole: string,
  ) {
    await this.assertCanManageEmployee(dto.employeeId, requesterId, requesterRole);

    const assignment = await this.prisma.employeeShiftAssignment.create({
      data: {
        employeeId: dto.employeeId,
        shiftId: dto.shiftId,
        year: dto.year,
        month: dto.month,
        effectiveDate: new Date(dto.year, dto.month - 1, 1),
      },
      include: {
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
        employee: { select: { id: true, code: true, fullName: true } },
      },
    });

    return assignment;
  }

  // ── Unassign ──────────────────────────────────────────────────────────────

  async unassign(
    id: number,
    requesterId: number,
    requesterRole: string,
  ) {
    const asgn = await this.prisma.employeeShiftAssignment.findUnique({
      where: { id },
    });
    if (!asgn) throw new NotFoundException(`Shift assignment #${id} not found`);

    await this.assertCanManageEmployee(asgn.employeeId, requesterId, requesterRole);

    // Guard: check existing attendance in this month/shift
    const hasAttendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId: asgn.employeeId,
        shiftId: asgn.shiftId,
        date: {
          gte: new Date(asgn.year, asgn.month - 1, 1),
          lte: new Date(asgn.year, asgn.month, 0),
        },
      },
    });

    if (hasAttendance) {
      throw new BadRequestException(
        'Cannot remove shift assignment: attendance records exist for this shift in the selected month.',
      );
    }

    await this.prisma.employeeShiftAssignment.delete({ where: { id } });
  }

  // ── Bulk assign ───────────────────────────────────────────────────────────

  async bulkAssign(
    dto: BulkAssignShiftDto,
    requesterId: number,
    requesterRole: string,
  ) {
    // Scope check for each employee
    for (const empId of dto.employeeIds) {
      await this.assertCanManageEmployee(empId, requesterId, requesterRole);
    }

    const data = dto.employeeIds.map((employeeId) => ({
      employeeId,
      shiftId: dto.shiftId,
      year: dto.year,
      month: dto.month,
      effectiveDate: new Date(dto.year, dto.month - 1, 1),
    }));

    const result = await this.prisma.employeeShiftAssignment.createMany({
      data,
      skipDuplicates: true,
    });

    return { assigned: result.count, skipped: data.length - result.count };
  }

  // ── Apply department-linked shifts ───────────────────────────────────────
  // Upsert assignments for employees whose department has a linked shift.
  // Does NOT touch employees in departments without a linked shift.

  async applyDepartmentShifts(dto: InitializeMonthDto) {
    const { year, month, departmentId } = dto;

    // 1. All active shifts that are linked to a department
    const deptShifts = await this.prisma.shift.findMany({
      where: {
        isActive: true,
        departmentId: { not: null },
        ...(departmentId ? { departmentId } : {}),
      },
      select: { id: true, departmentId: true },
    });

    if (deptShifts.length === 0) return { updated: 0 };

    const deptToShift = new Map<number, number>();
    for (const s of deptShifts) {
      if (s.departmentId !== null) deptToShift.set(s.departmentId, s.id);
    }

    // 2. All non-resigned employees in the affected departments
    const employees = await this.prisma.employee.findMany({
      where: {
        status: { notIn: ['resigned', 'inactive'] },
        departmentId: { in: [...deptToShift.keys()] },
      },
      select: { id: true, departmentId: true },
    });

    if (employees.length === 0) return { updated: 0 };

    const effectiveDate = new Date(year, month - 1, 1);

    // 3. Upsert: delete then recreate for affected employees
    const employeeIds = employees.map((e) => e.id);

    await this.prisma.$transaction([
      this.prisma.employeeShiftAssignment.deleteMany({
        where: { year, month, employeeId: { in: employeeIds } },
      }),
      this.prisma.employeeShiftAssignment.createMany({
        data: employees.map((e) => ({
          employeeId: e.id,
          shiftId: deptToShift.get(e.departmentId!)!,
          year,
          month,
          effectiveDate,
        })),
        skipDuplicates: true,
      }),
    ]);

    return { updated: employees.length };
  }

  // ── Reset to default ──────────────────────────────────────────────────────

  async resetToDefault(dto: ResetToDefaultDto) {
    const { year, month, employeeId } = dto;

    const deleteWhere: Record<string, unknown> = { year, month };
    if (employeeId) deleteWhere.employeeId = employeeId;

    const deleted = await this.prisma.employeeShiftAssignment.deleteMany({
      where: deleteWhere,
    });

    const empWhere: Record<string, unknown> = { status: { notIn: ['resigned', 'inactive'] } };
    if (employeeId) empWhere.id = employeeId;

    const [employees, deptShifts, fixedShift] = await Promise.all([
      this.prisma.employee.findMany({
        where: empWhere,
        select: { id: true, shiftId: true, departmentId: true, workingMode: true },
      }),
      this.prisma.shift.findMany({
        where: { isActive: true, departmentId: { not: null } },
        select: { id: true, departmentId: true },
      }),
      this.prisma.shift.findFirst({
        where: { isActive: true, isDefault: true },
        select: { id: true },
      }),
    ]);

    const deptToShift = new Map<number, number>();
    for (const s of deptShifts) {
      if (s.departmentId !== null) deptToShift.set(s.departmentId, s.id);
    }

    const effectiveDate = new Date(year, month - 1, 1);

    const createData = employees
      .map((e) => {
        let resolvedShiftId: number | null;
        if (e.workingMode === 'FIXED') {
          resolvedShiftId = fixedShift?.id ?? e.shiftId ?? null;
        } else {
          resolvedShiftId =
            (e.departmentId ? deptToShift.get(e.departmentId) : undefined) ??
            e.shiftId ??
            null;
        }
        if (resolvedShiftId === null) return null;
        return { employeeId: e.id, shiftId: resolvedShiftId, year, month, effectiveDate };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    const created = await this.prisma.employeeShiftAssignment.createMany({
      data: createData,
      skipDuplicates: true,
    });

    return { deleted: deleted.count, created: created.count };
  }

  // ── Auth helper ───────────────────────────────────────────────────────────

  private async assertCanManageEmployee(
    employeeId: number,
    requesterId: number,
    requesterRole: string,
  ) {
    if (requesterRole === 'admin' || requesterRole === 'hr') return;

    if (requesterRole === 'manager') {
      const emp = await this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { managerId: true },
      });
      if (!emp) throw new NotFoundException(`Employee #${employeeId} not found`);
      if (emp.managerId !== requesterId) {
        throw new ForbiddenException('You can only manage employees in your team');
      }
      return;
    }

    throw new ForbiddenException('Insufficient permissions');
  }
}
