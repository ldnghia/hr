import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializeMonthDto {
  @ApiProperty()
  @IsInt()
  @Min(2020)
  year: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  departmentId?: number;
}

export class CopyFromPreviousDto {
  @ApiProperty()
  @IsInt()
  @Min(2020)
  year: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  departmentId?: number;
}

export class ResetToDefaultDto {
  @ApiProperty()
  @IsInt()
  @Min(2020)
  year: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  employeeId?: number;
}
