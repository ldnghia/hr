import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleProfile } from './strategies/google.strategy';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const employee = await this.prisma.employee.findUnique({
      where: { email },
      include: {
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
      },
    });

    if (!employee || !employee.password) {
      this.logger.warn(`Login attempt failed: employee not found or no password for ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (employee.status === 'resigned' || employee.status === 'inactive') {
      this.logger.warn(`Login attempt for deactivated account: ${email}`);
      throw new ForbiddenException('Account is deactivated');
    }

    const isValid = await bcrypt.compare(dto.password, employee.password);
    if (!isValid) {
      this.logger.warn(`Invalid password for: ${email}`);
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

  async loginWithGoogle(profile: GoogleProfile): Promise<{ token: string }> {
    // Guard against Google returning no email (scope denied)
    if (!profile?.email) {
      const err = new UnauthorizedException('oauth_failed');
      (err as any).code = 'oauth_failed';
      throw err;
    }

    const email = profile.email.trim().toLowerCase();
    const employee = await this.prisma.employee.findUnique({ where: { email } });

    if (!employee) {
      const err = new UnauthorizedException('not_registered');
      (err as any).code = 'not_registered';
      throw err;
    }

    if (employee.status === 'resigned' || employee.status === 'inactive') {
      const err = new ForbiddenException('account_disabled');
      (err as any).code = 'account_disabled';
      throw err;
    }

    if (employee.googleId && employee.googleId !== profile.googleId) {
      const err = new ConflictException('account_conflict');
      (err as any).code = 'account_conflict';
      throw err;
    }

    // Link googleId atomically on first login — only updates if still null
    if (!employee.googleId) {
      await this.prisma.employee.updateMany({
        where: { id: employee.id, googleId: null },
        data: { googleId: profile.googleId },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: employee.id,
        action: 'LOGIN_GOOGLE',
        entity: 'employee',
        entityId: employee.id,
      },
    });

    const token = this.jwtService.sign({
      sub: employee.id,
      email: employee.email,
      role: employee.role,
    });

    return { token };
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
