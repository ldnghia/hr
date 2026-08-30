import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListEmployeeDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  managerId?: number;

  @ApiPropertyOptional({
    description:
      'Khi true, loại bỏ nhân viên ưu tiên (miễn chấm công) nếu setting report_exclude_attendance_exempt đang bật. Dùng cho các màn báo cáo.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  excludeAttendanceExempt?: boolean;
}
