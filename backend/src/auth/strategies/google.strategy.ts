import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleProfile {
  email: string;
  googleId: string;
  displayName: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    const clientID = process.env.GOOGLE_CLIENT_ID ?? '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
    if (!clientID || !clientSecret) {
      console.warn('[GoogleStrategy] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google login disabled');
    }
    super({
      clientID,
      clientSecret,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): void {
    const email: string = profile.emails?.[0]?.value ?? '';
    done(null, {
      email,
      googleId: profile.id,
      displayName: profile.displayName,
    } as GoogleProfile);
  }
}
