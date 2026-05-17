import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignShiftDto {
  @ApiProperty()
  @IsInt()
  employeeId: number;

  @ApiProperty()
  @IsInt()
  shiftId: number;

  @ApiProperty()
  @IsInt()
  @Min(2020)
  year: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}
