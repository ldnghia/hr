import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsInt, IsString, IsISO8601, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CheckInDto {
  @ApiPropertyOptional({ description: 'Override shift ID (skips auto-detect)', example: 1 })
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
    description: 'Reason for check-in without GPS (required when lat/lng are absent)',
    example: 'Working from client site — GPS unavailable indoors',
  })
  @IsOptional()
  @IsString()
  locationNote?: string;

  @ApiPropertyOptional({ description: 'Override timestamp (ISO 8601). Defaults to now.' })
  @IsOptional()
  @IsISO8601()
  timestamp?: string;

  @ApiPropertyOptional({
    description: 'Reason for late check-in (required when check-in is beyond shift grace-late window)',
    example: 'Kẹt xe trên đường đi làm',
  })
  @IsOptional()
  @IsString()
  lateReason?: string;
}
