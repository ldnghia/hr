import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminEditAttendanceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  checkinTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  checkoutTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  checkinNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  checkoutNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  shiftId?: number;

  @ApiProperty({ description: 'Reason for admin edit' })
  @IsString()
  @MaxLength(1000)
  reason: string;
}
