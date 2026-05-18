import { Controller, Post, Get, Patch, Body, UseGuards, Req, Res } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiOkResponse({ description: 'Returns JWT access token and employee profile' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('profile')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser('id') id: number) {
    return this.authService.getProfile(id);
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  @ApiExcludeEndpoint()
  googleAuth() {
    // passport redirects to Google consent screen
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  @ApiExcludeEndpoint()
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const redirectBase = process.env.FRONTEND_OAUTH_REDIRECT_URL ?? 'http://localhost:3001/auth/callback';
    try {
      const { token } = await this.authService.loginWithGoogle(req.user as any);
      return res.redirect(`${redirectBase}?token=${token}`);
    } catch (err: any) {
      const code: string = err.code ?? 'oauth_failed';
      return res.redirect(`${redirectBase}?error=${encodeURIComponent(code)}`);
    }
  }

  @Patch('change-password')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Change own password' })
  changePassword(
    @CurrentUser('id') id: number,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(id, dto);
  }
}
