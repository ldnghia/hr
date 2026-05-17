import { IsInt, IsArray, ArrayMinSize, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkAssignShiftDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  employeeIds: number[];

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
