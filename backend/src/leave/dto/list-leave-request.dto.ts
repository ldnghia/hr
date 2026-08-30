import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListLeaveRequestDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected', 'cancelled'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ['annual', 'sick', 'unpaid'] })
  @IsOptional()
  @IsString()
  leaveType?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;

  @ApiPropertyOptional({ description: 'Search by employee name or code' })
  @IsOptional()
  @IsString()
  search?: string;
}
