import { IsInt, IsOptional, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListSchedulesQueryDto {
  @ApiPropertyOptional({ example: 2026 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(2020) @Max(2099)
  year?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12)
  month?: number;

  /** For range queries (e.g. weekly view) — YYYY-MM-DD */
  @ApiPropertyOptional({ example: '2026-05-05' })
  @IsOptional() @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-05-11' })
  @IsOptional() @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  branchId?: number;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  employeeId?: number;
}
