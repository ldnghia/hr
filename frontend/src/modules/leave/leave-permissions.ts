import type { AuthUser, LeaveRequest } from '@/types';

/**
 * Mirrors backend WorkflowEngineService.validateAuthorisation:
 * step 1 = the employee's assigned manager only, step 2 = any HR user, admin bypasses all.
 */
export function canActOnLeaveRequest(leave: LeaveRequest, user: AuthUser | null | undefined): boolean {
  if (!user || leave.status !== 'pending') return false;
  if (user.role === 'admin') return true;
  if (leave.currentStep === 1) {
    return user.role === 'manager' && leave.employee?.manager?.id === user.id;
  }
  if (leave.currentStep === 2) {
    return user.role === 'hr';
  }
  return false;
}
