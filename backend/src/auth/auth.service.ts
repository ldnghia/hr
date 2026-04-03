import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { email: dto.email },
      include: {
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
      },
    });

    if (!employee || !employee.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (employee.status === 'resigned' || employee.status === 'inactive') {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isValid = await bcrypt.compare(dto.password, employee.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.auditLog.create({
      data: {
        userId: employee.id,
        action: 'LOGIN',
        entity: 'employee',
        entityId: employee.id,
      },
    });

    const token = this.jwtService.sign({
      sub: employee.id,
      email: employee.email,
      role: employee.role,
    });

    const { password: _, ...profile } = employee;
    return { accessToken: token, employee: profile };
  }

  async getProfile(employeeId: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
        manager: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!employee) throw new UnauthorizedException('Employee not found');

    const { password: _, ...profile } = employee;
    return profile;
  }

  async changePassword(employeeId: number, dto: ChangePasswordDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee || !employee.password) {
      throw new UnauthorizedException('Employee not found');
    }

    const isValid = await bcrypt.compare(dto.currentPassword, employee.password);
    if (!isValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashed = await bcrypt.hash(
      dto.newPassword,
      parseInt(process.env.BCRYPT_SALT_ROUNDS || '12'),
    );

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { password: hashed },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: employeeId,
        action: 'CHANGE_PASSWORD',
        entity: 'employee',
        entityId: employeeId,
      },
    });

    return { message: 'Password changed successfully' };
  }
}
