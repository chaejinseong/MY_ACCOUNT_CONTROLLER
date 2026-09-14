import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes } from 'node:crypto';

export interface GoogleProfile {
  sub: string;
  email: string;
}

// 앱 로그인 전용 Google OAuth 래퍼. openid/email/profile 최소 스코프만 요청한다.
// Gmail 연동(email-accounts 모듈)은 완전히 별개의 client 인스턴스로 Gmail 스코프만
// 요청 시점에 나눠 받는다 (기술설계서 1장 incremental authorization).
@Injectable()
export class GoogleOAuthService {
  private readonly client: OAuth2Client;

  constructor() {
    this.client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL,
    );
  }

  generateState(): string {
    return randomBytes(16).toString('hex');
  }

  buildAuthUrl(state: string): string {
    return this.client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state,
    });
  }

  async exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
    const { tokens } = await this.client.getToken(code);
    if (!tokens.id_token) {
      throw new Error('Google 응답에 id_token이 없습니다.');
    }
    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new Error('Google ID 토큰에서 사용자 정보를 확인할 수 없습니다.');
    }
    return { sub: payload.sub, email: payload.email };
  }
}
