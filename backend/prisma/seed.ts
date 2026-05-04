import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ── Branches ──────────────────────────────────────────────
  const branchHCM = await prisma.branch.create({
    data: { name: 'Ho Chi Minh City Branch' },
  });

  const branchHN = await prisma.branch.create({
    data: { name: 'Hanoi Branch' },
  });

  console.log('Branches created:', branchHCM.name, '|', branchHN.name);

  // ── Departments ────────────────────────────────────────────
  const deptIT = await prisma.department.create({
    data: { name: 'Information Technology', code: 'IT', branchId: branchHCM.id },
  });

  const deptHR = await prisma.department.create({
    data: { name: 'Human Resources', code: 'HR', branchId: branchHN.id },
  });

  const deptCC = await prisma.department.create({
    data: { name: 'Command Center', code: 'CC', workingType: 'SHIFT', branchId: branchHCM.id },
  });

  // Global default shift for FIXED departments
  await prisma.shift.upsert({
    where: { code: 'STANDARD' },
    update: {},
    create: {
      name: 'Standard Working Shift',
      code: 'STANDARD',
      startTime: '08:00',
      endTime: '18:00',
      isCrossDay: false,
      breakMinutes: 60,
      graceLateMinutes: 15,
      graceEarlyMinutes: 15,
      isDefault: true,
      isActive: true,
    },
  });

  // Auto-create CC shifts
  await prisma.shift.createMany({
    data: [
      { name: 'Morning',   code: 'CC_MORNING',   startTime: '07:00', endTime: '15:00', isCrossDay: false, departmentId: deptCC.id, breakMinutes: 0 },
      { name: 'Afternoon', code: 'CC_AFTERNOON', startTime: '15:00', endTime: '23:00', isCrossDay: false, departmentId: deptCC.id, breakMinutes: 0 },
      { name: 'Night',     code: 'CC_NIGHT',     startTime: '23:00', endTime: '07:00', isCrossDay: true,  departmentId: deptCC.id, breakMinutes: 0 },
    ],
    skipDuplicates: true,
  });

  console.log('Departments created:', deptIT.name, '|', deptHR.name, '|', deptCC.name);

  // ── Positions ──────────────────────────────────────────────
  const posAdmin = await prisma.position.create({
    data: { name: 'System Administrator', code: 'SYS-ADMIN', departmentId: deptIT.id },
  });

  const posSWE = await prisma.position.create({
    data: { name: 'Software Engineer', code: 'SWE', departmentId: deptIT.id },
  });

  const posNOC = await prisma.position.create({
    data: { name: 'Network Operations Engineer', code: 'NOC', departmentId: deptCC.id },
  });

  console.log('Positions created');

  // ── Office Locations ───────────────────────────────────────
  const officeHCM = await prisma.officeLocation.create({
    data: {
      name: 'HCM',
      latitude: 10.7719,
      longitude: 106.7042,
      radius: 100,
    },
  });

  const officeHN = await prisma.officeLocation.create({
    data: {
      name: 'Hanoi',
      latitude: 21.0285,
      longitude: 105.8342,
      radius: 100,
    },
  });

  console.log('Office locations created:', officeHCM.name, '|', officeHN.name);

  // ── Employees ──────────────────────────────────────────────
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash('password123', saltRounds);

  const adminEmp = await prisma.employee.create({
    data: {
      code: 'E001',
      fullName: 'System Admin',
      email: 'admin@company.com',
      password: hashedPassword,
      role: 'admin',
      status: 'official',
      branchId: branchHCM.id,
      departmentId: deptIT.id,
      positionId: posAdmin.id,
      officeId: officeHCM.id,
    },
  });

  const hrEmp = await prisma.employee.create({
    data: {
      code: 'E002',
      fullName: 'HR Manager',
      email: 'hr@company.com',
      password: hashedPassword,
      role: 'hr',
      status: 'official',
      branchId: branchHN.id,
      departmentId: deptHR.id,
      positionId: posSWE.id,
      officeId: officeHN.id,
    },
  });

  const managerEmp = await prisma.employee.create({
    data: {
      code: 'E003',
      fullName: 'Department Manager',
      email: 'manager@company.com',
      password: hashedPassword,
      role: 'manager',
      status: 'official',
      branchId: branchHCM.id,
      departmentId: deptIT.id,
      positionId: posSWE.id,
      officeId: officeHCM.id,
    },
  });

  const regularEmp = await prisma.employee.create({
    data: {
      code: 'E004',
      fullName: 'Regular Employee',
      email: 'employee@company.com',
      password: hashedPassword,
      role: 'employee',
      status: 'probation',
      branchId: branchHCM.id,
      departmentId: deptIT.id,
      positionId: posSWE.id,
      managerId: managerEmp.id,
      officeId: officeHCM.id,
    },
  });

  console.log(
    'Employees created:',
    adminEmp.email,
    '|',
    hrEmp.email,
    '|',
    managerEmp.email,
    '|',
    regularEmp.email,
  );

  // ── Leave Balance for E004 ────────────────────────────────
  await prisma.leaveBalance.create({
    data: {
      employeeId: regularEmp.id,
      total: 12,
      used: 0,
      remaining: 12,
    },
  });

  console.log('Leave balance created for E004');

  // ── System Config ──────────────────────────────────────────
  await prisma.systemConfig.upsert({
    where: { key: 'attendance_correction_monthly_limit' },
    update: {},
    create: {
      key: 'attendance_correction_monthly_limit',
      value: '3',
      description: 'Max attendance correction requests per employee per month',
    },
  });

  console.log('\nSeed completed successfully!');
  console.log('\nDefault accounts (password: password123):');
  console.log('  Admin    -> admin@company.com');
  console.log('  HR       -> hr@company.com');
  console.log('  Manager  -> manager@company.com');
  console.log('  Employee -> employee@company.com');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
