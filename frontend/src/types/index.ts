// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: 'admin' | 'hr' | 'manager' | 'employee';
}

export interface LoginResponse {
  accessToken: string;   // backend key: accessToken (camelCase)
  employee: AuthUser;    // backend key: employee (not user)
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ─── Office Location ──────────────────────────────────────────────────────────

export interface OfficeLocation {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // metres
}

// ─── Organization ─────────────────────────────────────────────────────────────

export type WorkingType = 'FIXED' | 'SHIFT';
export type WorkingMode = 'FIXED' | 'SHIFT';

export interface Department {
  id: number;
  name: string;
  code: string;
  workingType: WorkingType;
  description?: string | null;
  isActive: boolean;
  branchId?: number | null;
  createdAt?: string;
  updatedAt?: string;
  branch?: Pick<Branch, 'id' | 'name'>;
  positions?: Pick<Position, 'id' | 'name' | 'code'>[];
  shifts?: DepartmentShift[];
  _count?: { employees: number; positions: number; shifts: number };
}

export interface DepartmentShift {
  id: number;
  name: string;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  isCrossDay: boolean;
  departmentId: number;
}

export interface Position {
  id: number;
  name: string;
  code: string;
  departmentId?: number | null;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  department?: Pick<Department, 'id' | 'name' | 'code' | 'workingType'>;
  _count?: { employees: number };
}

export interface Branch {
  id: number;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  radius: number; // metres, default 50
  _count?: { employees: number };
}

// ─── Employee ─────────────────────────────────────────────────────────────────

export interface Employee {
  id: number;
  code: string;
  fullName: string;
  email: string;
  phone?: string;
  status: 'probation' | 'official' | 'resigned' | 'inactive';
  role: 'admin' | 'hr' | 'manager' | 'employee';
  branchId?: number;
  departmentId?: number;
  positionId?: number;
  managerId?: number;
  joinDate?: string;
  probationEndDate?: string;
  createdAt?: string;
  updatedAt?: string;
  workingMode?: WorkingMode;
  shiftId?: number | null;
  telegramId?: string | null;
  branch?: Branch;
  department?: Pick<Department, 'id' | 'name' | 'code' | 'workingType'>;
  position?: Pick<Position, 'id' | 'name' | 'code'>;
  manager?: Pick<Employee, 'id' | 'fullName' | 'email' | 'code'>;
  office?: OfficeLocation;
  currentShift?: Pick<DepartmentShift, 'id' | 'name' | 'startTime' | 'endTime' | 'isCrossDay'>;
}

// ─── Contract ─────────────────────────────────────────────────────────────────

export interface Contract {
  id: number;
  employeeId?: number;
  type?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  createdAt?: string;
  employee?: Pick<Employee, 'id' | 'fullName' | 'code' | 'department' | 'position'>;
}

// ─── Leave ────────────────────────────────────────────────────────────────────

export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'compensatory';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveApproval {
  id: number;
  step: number;
  approverRole: string;
  approverId?: number;
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
  actionTime?: string;
}

export interface LeaveRequest {
  id: number;
  employeeId: number;
  fromDate: string;
  toDate: string;
  type: LeaveType;
  status: LeaveStatus;
  currentStep: number;
  reason: string;
  days: number;
  isHalfDay?: boolean;
  createdAt: string;
  employee?: Pick<Employee, 'id' | 'fullName' | 'email' | 'code' | 'department' | 'manager'>;
  approvals?: LeaveApproval[];
}

export interface LeaveBalance {
  employeeId: number;
  total: number;
  used: number;
  remaining: number;
  updatedAt?: string;
}

export interface LeaveAccrualLog {
  id: number;
  employeeId: number;
  days: number;
  note?: string | null;
  accrualDate: string;
  createdAt: string;
}

export interface LeaveBalanceWithLog {
  balance: LeaveBalance | null;
  accrualLog: LeaveAccrualLog[];
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export interface Shift {
  id: number;
  name: string;
  code: string;
  startTime: string;      // "HH:MM"
  endTime: string;        // "HH:MM"
  isCrossDay: boolean;
  breakMinutes: number;
  graceLateMinutes: number;
  graceEarlyMinutes: number;
  isDefault: boolean;
  isActive: boolean;
  departmentId?: number | null;
  department?: Pick<Department, 'id' | 'name' | 'code'>;
  _count?: { currentEmployees: number; attendances: number };
}

export interface WorkLocation {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radius: number;      // metres
  address?: string;
}

export interface AttendanceRecord {
  id: number;
  employeeId: number;
  date: string;
  checkinTime?: string;
  checkoutTime?: string;
  workingHours?: number | string;  // Prisma Decimal serializes as string in JSON
  // WFM fields
  shiftId?: number;
  shift?: Shift;
  isLate: boolean;
  isEarlyOut: boolean;
  isOvertime: boolean;
  overtimeHours?: number | string;  // Prisma Decimal serializes as string in JSON
  checkinLat?: number;
  checkinLng?: number;
  checkoutLat?: number;
  checkoutLng?: number;
  officeDistanceM?: number;
  // Location integration
  isInOffice?: boolean;
  checkinNote?: string | null;
  checkoutNote?: string | null;
  locationNote?: string | null;
  // Leave integration
  isOnLeave?: boolean;
  leaveRequestId?: number | null;
  employee?: Pick<Employee, 'id' | 'fullName' | 'code' | 'department' | 'position'>;
}

export interface AttendanceLog {
  id: number;
  employeeId: number;
  time: string;
  type: 'check_in' | 'check_out';
  lat?: number;
  lng?: number;
  locationId?: number;
  deviceId?: string;
  distanceM?: number;
  note?: string | null;
  attendanceId?: number;
}

export interface TodayStatus {
  date: string;
  attendance: AttendanceRecord | null;
  checkedIn: boolean;
  checkedOut: boolean;
  dayInfo?: DayInfo;
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export type DayType = 'WORKING' | 'WEEKEND' | 'HOLIDAY' | 'COMPENSATION';

export interface DayInfo {
  date: string;
  type: DayType;
  isPaid: boolean;
  note?: string | null;
  isWorkingDay: boolean;
}

export interface CalendarYear {
  id: number;
  year: number;
  weekendDays: number[];  // 0=Sun … 6=Sat
  country?: string;
  description?: string;
  _count?: { days: number };
}

export interface CalendarDay {
  id: number;
  year: number;
  date: string;
  type: DayType;
  isPaid: boolean;
  note?: string | null;
}

export interface Holiday {
  id: number;
  name: string;
  fromDate: string;
  toDate: string;
  isPaid: boolean;
  isRecurring: boolean;
  description?: string | null;
  createdAt: string;
}

export interface CalendarSummary {
  year: number;
  WORKING: number;
  WEEKEND: number;
  HOLIDAY: number;
  COMPENSATION: number;
  total: number;
}

// ─── Resignation ──────────────────────────────────────────────────────────────

export type ResignationStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface ResignationApproval {
  id: number;
  step: number;
  approverRole: string;
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
  actionTime?: string;
}

export interface ResignationRequest {
  id: number;
  employeeId: number;
  lastWorkingDate: string;
  reason: string;
  status: ResignationStatus;
  currentStep: number;
  createdAt: string;
  employee?: Pick<Employee, 'id' | 'fullName' | 'email' | 'code' | 'department' | 'manager'>;
  approvals?: ResignationApproval[];
}
