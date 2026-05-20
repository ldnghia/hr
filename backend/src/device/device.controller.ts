import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DeviceService } from './device.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { ListDevicesQueryDto } from './dto/list-devices-query.dto';

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('devices')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  // ─── Employee self-service ────────────────────────────────────────────────

  @Post('register')
  async registerMine(
    @CurrentUser('id') employeeId: number,
    @Body() dto: RegisterDeviceDto,
  ) {
    const data = await this.deviceService.registerMine(employeeId, dto, employeeId);
    return { data, message: 'Đăng ký thiết bị thành công', statusCode: 201 };
  }

  @Get('me')
  async listMine(@CurrentUser('id') employeeId: number) {
    const data = await this.deviceService.listMine(employeeId);
    return { data, message: 'OK', statusCode: 200 };
  }

  @Delete('me/:id')
  async deactivateMine(
    @CurrentUser('id') employeeId: number,
    @Param('id', ParseIntPipe) deviceId: number,
  ) {
    const data = await this.deviceService.deactivateMine(employeeId, deviceId);
    return { data, message: 'Thiết bị đã được vô hiệu hóa', statusCode: 200 };
  }

  // ─── Admin / HR ───────────────────────────────────────────────────────────

  @Get()
  @Roles('admin', 'hr')
  async listAll(@Query() query: ListDevicesQueryDto) {
    const result = await this.deviceService.listAll(query);
    return { ...result, message: 'OK', statusCode: 200 };
  }

  @Post()
  @Roles('admin', 'hr')
  async registerForEmployee(
    @CurrentUser('id') adminId: number,
    @Body() dto: RegisterDeviceDto & { employeeId: number },
  ) {
    const data = await this.deviceService.registerForEmployee(dto.employeeId, dto, adminId);
    return { data, message: 'Đăng ký thiết bị thành công', statusCode: 201 };
  }

  @Patch(':id')
  @Roles('admin', 'hr')
  async updateDevice(
    @Param('id', ParseIntPipe) deviceId: number,
    @Body() dto: UpdateDeviceDto,
  ) {
    const data = await this.deviceService.updateDevice(deviceId, dto);
    return { data, message: 'Cập nhật thành công', statusCode: 200 };
  }

  @Delete(':id')
  @Roles('admin', 'hr')
  async deactivateDevice(@Param('id', ParseIntPipe) deviceId: number) {
    const data = await this.deviceService.deactivateDevice(deviceId);
    return { data, message: 'Thiết bị đã được vô hiệu hóa', statusCode: 200 };
  }
}
