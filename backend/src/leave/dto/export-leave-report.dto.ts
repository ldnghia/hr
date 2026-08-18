import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ExportLeaveReportDto {
  @ApiPropertyOptional({ type: Number, example: 2026, description: 'Filter by year (leave requests overlapping this calendar year), minimum 2026' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2026)
  year?: number;

  @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected', 'cancelled'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ['annual', 'sick', 'unpaid', 'compensatory'] })
  @IsOptional()
  @IsString()
  leaveType?: string;

  @ApiPropertyOptional({ type: Number, description: 'Filter by department ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ example: '2024-03-01', description: 'From date (YYYY-MM-DD), inclusive — matches requests overlapping this range' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2024-03-31', description: 'To date (YYYY-MM-DD), inclusive — matches requests overlapping this range' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
