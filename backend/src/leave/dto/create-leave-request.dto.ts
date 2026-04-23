import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsDateString, IsString, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export const LEAVE_TYPES = ['annual', 'sick', 'unpaid', 'compensatory'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export class CreateLeaveRequestDto {
  @ApiProperty({
    example: 'annual',
    enum: LEAVE_TYPES,
    description: 'Leave type',
  })
  @IsIn(LEAVE_TYPES)
  leaveType: LeaveType;

  @ApiProperty({ example: '2024-03-10', description: 'First day of leave (YYYY-MM-DD)' })
  @IsDateString()
  fromDate: string;

  @ApiProperty({ example: '2024-03-12', description: 'Last day of leave (YYYY-MM-DD)' })
  @IsDateString()
  toDate: string;

  @ApiPropertyOptional({ example: false, description: 'True if requesting half day (0.5 day)' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isHalfDay?: boolean;

  @ApiProperty({ example: 'Annual family trip' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ example: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
