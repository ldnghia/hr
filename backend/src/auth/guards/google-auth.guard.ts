import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  // Ensures strategy errors redirect gracefully rather than returning a 401 JSON body
  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err ?? new UnauthorizedException('oauth_failed');
    }
    return user;
  }
}
