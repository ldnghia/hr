import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  IsDateString,
} from 'class-validator';

export class UpdateCorrectionDto {
  @ApiPropertyOptional({ description: 'Requested check-in time (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  requestedCheckinTime?: string;

  @ApiPropertyOptional({ description: 'Requested check-out time (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  requestedCheckoutTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  requestedCheckinNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  requestedCheckoutNote?: string;

  @ApiPropertyOptional({ description: 'Requested shift ID' })
  @IsOptional()
  @IsInt()
  requestedShiftId?: number;

  @ApiPropertyOptional({ description: 'Reason for correction request' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
