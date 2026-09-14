import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Session, SessionData } from 'express-session';
import { PrismaService } from '../common/prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { GoogleOAuthService } from './google-oauth.service';
import { UnlockKeyStoreService } from './unlock-key-store.service';

type AppSession = Session & Partial<SessionData>;

const MIN_MASTER_PASSWORD_LENGTH = 8;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly unlockKeyStore: UnlockKeyStoreService,
  ) {}

  createGoogleAuthUrl(session: AppSession): string {
    const state = this.googleOAuth.generateState();
    session.oauthState = state;
    return this.googleOAuth.buildAuthUrl(state);
  }

  // 기술설계서 3.1: 콜백은 User 조회/생성 후 세션 생성까지 담당한다.
  // 단, User.master_password_hash/master_kdf_salt가 NOT NULL이라 Google 프로필만으로는
  // 아직 User row를 만들 수 없다 (최초 로그인 시 마스터 비밀번호가 없음) — 이 경우
  // 프로필을 세션에 잠시 보관해두고 /auth/master-password/setup에서 실제로 생성한다.
  async handleGoogleCallback(code: string, state: string, session: AppSession) {
    if (!state || state !== session.oauthState) {
      throw new BadRequestException('OAuth state가 일치하지 않습니다.');
    }
    delete session.oauthState;

    const profile = await this.googleOAuth.exchangeCodeForProfile(code);
    const user = await this.prisma.user.findUnique({
      where: { googleSubId: profile.sub },
    });

    if (user) {
      session.userId = user.id;
      session.unlocked = false;
      return { status: 'logged_in' as const, needsMasterPassword: false };
    }

    session.pendingGoogle = profile;
    return {
      status: 'needs_master_password_setup' as const,
      email: profile.email,
    };
  }

  async setupMasterPassword(session: AppSession, password: string) {
    if (session.userId) {
      throw new ConflictException('이미 마스터 비밀번호가 설정된 계정입니다.');
    }
    const pending = session.pendingGoogle;
    if (!pending) {
      throw new UnauthorizedException('Google 로그인을 먼저 진행해주세요.');
    }
    if (!password || password.length < MIN_MASTER_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `마스터 비밀번호는 ${MIN_MASTER_PASSWORD_LENGTH}자 이상이어야 합니다.`,
      );
    }

    const masterKdfSalt = this.crypto.generateKdfSalt();
    const [masterPasswordHash, encryptionKey] = await Promise.all([
      this.crypto.hashMasterPassword(password),
      this.crypto.deriveEncryptionKey(password, masterKdfSalt),
    ]);

    const user = await this.prisma.user.create({
      data: {
        googleSubId: pending.sub,
        googleEmail: pending.email,
        masterPasswordHash,
        masterKdfSalt,
      },
    });

    delete session.pendingGoogle;
    session.userId = user.id;
    session.unlocked = true;
    this.unlockKeyStore.set(session.id, encryptionKey);

    return { id: user.id, googleEmail: user.googleEmail };
  }

  async unlock(session: AppSession, userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    const valid = await this.crypto.verifyMasterPassword(password, user.masterPasswordHash);
    if (!valid) {
      throw new UnauthorizedException('마스터 비밀번호가 올바르지 않습니다.');
    }

    const encryptionKey = await this.crypto.deriveEncryptionKey(password, user.masterKdfSalt);
    this.unlockKeyStore.set(session.id, encryptionKey);
    session.unlocked = true;
  }

  lock(session: AppSession): void {
    this.unlockKeyStore.delete(session.id);
    session.unlocked = false;
  }

  logout(session: AppSession): void {
    this.unlockKeyStore.delete(session.id);
  }
}
