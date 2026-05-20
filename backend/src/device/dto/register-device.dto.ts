import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'SHA-256 browser fingerprint (64-char hex)' })
  @IsString()
  @MaxLength(255)
  deviceFingerprint: string;

  @ApiPropertyOptional({ example: 'Chrome - Laptop văn phòng' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userAgent?: string;
}
