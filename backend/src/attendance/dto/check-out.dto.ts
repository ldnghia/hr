import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsInt, IsString, IsISO8601, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CheckOutDto {
  @ApiPropertyOptional({ description: 'Direct attendance record ID — use when closing an unclosed session from a previous day' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  attendanceId?: number;

  @ApiPropertyOptional({ description: 'Target shift ID when multiple sessions are open', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  shiftId?: number;

  @ApiPropertyOptional({ example: 10.7769, description: 'GPS latitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ example: 106.7009, description: 'GPS longitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({ example: 'mobile-001', description: 'Device identifier' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({
    description: 'Reason for check-out without GPS (required when lat/lng are absent)',
    example: 'Left client site — GPS unavailable outdoors',
  })
  @IsOptional()
  @IsString()
  locationNote?: string;

  @ApiPropertyOptional({ description: 'Override timestamp (ISO 8601). Defaults to now.' })
  @IsOptional()
  @IsISO8601()
  timestamp?: string;
}
