/**
 * Inline DTOs used only by AttendanceController.
 * Extracted to keep the controller under 200 lines.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Legacy manual check-in / check-out body (no GPS) */
export class CheckInOutDto {
  @ApiPropertyOptional({ enum: ['check_in', 'check_out'] })
  @IsIn(['check_in', 'check_out'])
  type: 'check_in' | 'check_out';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timestamp?: string;
}

/** Query params for GET /attendance/me */
export class MyRecordsQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateTo?: string;
}
