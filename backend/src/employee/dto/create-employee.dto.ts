import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  IsBoolean,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'E001' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'nguyen.vana@company.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password@123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'Branch ID' })
  @Type(() => Number)
  @IsInt()
  branchId: number;

  @ApiProperty({ description: 'Department ID' })
  @Type(() => Number)
  @IsInt()
  departmentId: number;

  @ApiProperty({ description: 'Position ID' })
  @Type(() => Number)
  @IsInt()
  positionId: number;

  @ApiPropertyOptional({ description: 'Manager Employee ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  managerId?: number;

  @ApiPropertyOptional({ example: 'probation', default: 'probation' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'employee', default: 'employee' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Office Location ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  officeId?: number;

  @ApiPropertyOptional({
    enum: ['FIXED', 'SHIFT'],
    default: 'FIXED',
    description: 'FIXED for standard schedule; SHIFT for Command Center rotating shifts',
  })
  @IsOptional()
  @IsIn(['FIXED', 'SHIFT'])
  workingMode?: 'FIXED' | 'SHIFT';

  @ApiPropertyOptional({ description: 'Shift ID (required when workingMode = SHIFT)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  shiftId?: number;
  @ApiPropertyOptional({ example: '@telegram_user' })
  @IsOptional()
  @IsString()
  telegramId?: string;

  @ApiPropertyOptional({ example: 12, default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  initialLeaveBalance?: number;

  @ApiPropertyOptional({ description: 'Nhân viên ưu tiên — không bắt buộc chấm công', default: false })
  @IsOptional()
  @IsBoolean()
  attendanceExempt?: boolean;
}
