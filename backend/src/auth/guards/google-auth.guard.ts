import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const isCallback = !!req.query.code;

    if (!isCallback) {
      // Initiation route — let passport redirect to Google consent screen
      return super.canActivate(context) as Promise<boolean>;
    }

    // Callback route — catch any passport/state errors and redirect to frontend
    try {
      return (await super.canActivate(context)) as boolean;
    } catch {
      const redirectBase =
        process.env.FRONTEND_OAUTH_REDIRECT_URL ?? 'http://localhost:3001/auth/callback';
      res.redirect(`${redirectBase}?error=oauth_failed`);
      return false;
    }
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err ?? new UnauthorizedException('oauth_failed');
    }
    return user;
  }
}
