import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsOptional,
  IsInt,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateEmployeeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  positionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  managerId?: number;

  @ApiPropertyOptional({ description: 'Office Location ID (null to unassign)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  officeId?: number;

  @ApiPropertyOptional({ enum: ['FIXED', 'SHIFT'] })
  @IsOptional()
  @IsIn(['FIXED', 'SHIFT'])
  workingMode?: 'FIXED' | 'SHIFT';

  @ApiPropertyOptional({ description: 'Shift ID (required when workingMode = SHIFT)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  shiftId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telegramId?: string;

  @ApiPropertyOptional({ example: 12, description: 'Initial leave balance (admin/HR only)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  initialLeaveBalance?: number;
}
