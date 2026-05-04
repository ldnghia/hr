import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  IsDateString,
} from 'class-validator';

export class CreateCorrectionDto {
  @ApiProperty({ description: 'Attendance record ID to correct' })
  @IsInt()
  attendanceId: number;

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

  @ApiProperty({ description: 'Reason for correction request' })
  @IsString()
  @MaxLength(1000)
  reason: string;
}
