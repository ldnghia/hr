import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class DailySummaryQueryDto {
  @ApiPropertyOptional({ example: '2026-05-01', description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-05-31', description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filter by employee ID (admin/hr/manager only)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;
}
