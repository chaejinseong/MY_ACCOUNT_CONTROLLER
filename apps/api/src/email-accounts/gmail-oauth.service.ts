import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { randomBytes } from 'node:crypto';

export interface GmailTokens {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number | null;
}

// 앱 로그인(auth/google-oauth.service.ts)과 완전히 별개의 client 인스턴스 —
// Gmail 스코프만 따로 요청한다(기술설계서 1장 incremental authorization).
// gmail.modify: 메일 읽기 + 라벨(스팸 처리)/휴지통 이동에 필요한 최소 범위.
// 전체 계정 접근 권한(mail.google.com)은 요청하지 않는다 (기획서 7장).
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

@Injectable()
export class GmailOAuthService {
  private readonly client: OAuth2Client;

  constructor() {
    this.client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_EMAIL_CALLBACK_URL ?? process.env.GOOGLE_CALLBACK_URL,
    );
  }

  generateState(): string {
    return randomBytes(16).toString('hex');
  }

  buildAuthUrl(state: string): string {
    return this.client.generateAuthUrl({
      access_type: 'offline', // refresh_token을 받으려면 필수
      prompt: 'consent', // 재연동 시에도 매번 refresh_token을 다시 받기 위해 강제
      scope: GMAIL_SCOPES,
      state,
    });
  }

  async exchangeCodeForTokens(code: string): Promise<GmailTokens> {
    const { tokens } = await this.client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error(
        'Google이 refresh_token을 반환하지 않았습니다. 이미 연동된 계정이면 Google 계정 설정에서 앱 연결을 해제한 뒤 다시 시도해주세요.',
      );
    }

    this.client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: this.client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    if (!profile.data.emailAddress) {
      throw new Error('Gmail 프로필을 확인할 수 없습니다.');
    }

    return {
      email: profile.data.emailAddress,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date ?? null,
    };
  }
}
