import { IsArray, IsInt, IsISO8601, IsOptional, IsString, Min, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkAssignRangeDto {
  @ApiProperty({ example: [5, 6, 7] })
  @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) @Min(1, { each: true })
  employeeIds: number[];

  @ApiProperty({ example: 2 })
  @IsInt() @Min(1)
  shiftId: number;

  /** Start date inclusive: YYYY-MM-DD */
  @ApiProperty({ example: '2026-05-01' })
  @IsISO8601({ strict: true })
  dateFrom: string;

  /** End date inclusive: YYYY-MM-DD */
  @ApiProperty({ example: '2026-05-31' })
  @IsISO8601({ strict: true })
  dateTo: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  note?: string;
}
