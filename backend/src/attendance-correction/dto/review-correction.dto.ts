import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveCorrectionDto {
  @ApiPropertyOptional({ description: 'Optional note from reviewer' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}

export class RejectCorrectionDto {
  @ApiProperty({ description: 'Required rejection reason' })
  @IsString()
  @MaxLength(1000)
  reviewNote: string;
}
