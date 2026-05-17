import { IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignDayShiftDto {
  @ApiProperty({ example: 5 })
  @IsInt() @Min(1)
  employeeId: number;

  @ApiProperty({ example: 2 })
  @IsInt() @Min(1)
  shiftId: number;

  /** ISO date string: YYYY-MM-DD */
  @ApiProperty({ example: '2026-05-15' })
  @IsISO8601({ strict: true })
  date: string;

  @ApiPropertyOptional({ example: 'Tăng ca' })
  @IsOptional() @IsString()
  note?: string;
}
