import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        fullName: true,
        code: true,
        branchId: true,
        departmentId: true,
        managerId: true,
      },
    });

    if (!employee) {
      throw new UnauthorizedException('Token invalid or user not found');
    }

    if (employee.status === 'resigned' || employee.status === 'inactive') {
      throw new UnauthorizedException('Account is deactivated');
    }

    return employee;
  }
}
