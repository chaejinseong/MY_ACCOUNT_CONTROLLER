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
    this.unlockKeyStore.set(session.id, encryptionKey, user.autoLockMinutes);

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
    this.unlockKeyStore.set(session.id, encryptionKey, user.autoLockMinutes);
    session.unlocked = true;
  }

  lock(session: AppSession): void {
    this.unlockKeyStore.delete(session.id);
    session.unlocked = false;
  }

  logout(session: AppSession): void {
    this.unlockKeyStore.delete(session.id);
  }

  // /auth/me가 매 네비게이션마다 부른다 — idle 타임아웃(자동 잠금)을 UnlockedGuard를 타지
  // 않는 화면 전환 시점에도 반영되게 하는 지점이다 (apps/web의 proxy.ts 참고).
  checkStillUnlocked(session: AppSession): boolean {
    if (!session.unlocked) return false;
    const key = this.unlockKeyStore.touch(session.id);
    if (!key) {
      session.unlocked = false;
      return false;
    }
    return true;
  }

  async getSettings(userId: string): Promise<{ autoLockMinutes: number }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { autoLockMinutes: true } });
    return { autoLockMinutes: user.autoLockMinutes };
  }

  // 자동 잠금 시간(분) 변경 — 다음 잠금해제를 기다리지 않고 현재 세션에도 바로 반영한다.
  async updateAutoLockMinutes(session: AppSession, userId: string, autoLockMinutes: number): Promise<void> {
    if (!Number.isInteger(autoLockMinutes) || autoLockMinutes < 1 || autoLockMinutes > 240) {
      throw new BadRequestException('자동 잠금 시간은 1분~240분 사이로 설정해주세요.');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { autoLockMinutes } });
    this.unlockKeyStore.updateAutoLockMinutes(session.id, autoLockMinutes);
  }

  // 마스터 비밀번호 변경: 새 키 유도 → 이 사용자의 모든 Account 비밀번호를 새 키로
  // 재암호화 → User.masterPasswordHash/masterKdfSalt 갱신 → 현재 세션은 새 키로 계속
  // 잠금해제 상태 유지. Gmail 토큰은 서버 관리 키(기술설계서 7.2 옵션 a)라 영향 없음.
  // WebAuthn으로 기기에 감싸 저장해둔 옛 비밀번호는 더 이상 유효하지 않으므로 등록된
  // 기기를 전부 해제한다 — 기획서 7장 "생체인증은 마스터 비밀번호를 대체하지 않는다"
  // 원칙상 사용자가 새 비밀번호로 다시 등록해야 한다.
  async changeMasterPassword(
    session: AppSession,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ revokedDevices: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }
    const valid = await this.crypto.verifyMasterPassword(currentPassword, user.masterPasswordHash);
    if (!valid) {
      throw new UnauthorizedException('현재 마스터 비밀번호가 올바르지 않습니다.');
    }
    if (!newPassword || newPassword.length < MIN_MASTER_PASSWORD_LENGTH) {
      throw new BadRequestException(`마스터 비밀번호는 ${MIN_MASTER_PASSWORD_LENGTH}자 이상이어야 합니다.`);
    }

    const oldKey = await this.crypto.deriveEncryptionKey(currentPassword, user.masterKdfSalt);
    const newKdfSalt = this.crypto.generateKdfSalt();
    const [newHash, newKey] = await Promise.all([
      this.crypto.hashMasterPassword(newPassword),
      this.crypto.deriveEncryptionKey(newPassword, newKdfSalt),
    ]);

    const accounts = await this.prisma.account.findMany({ where: { userId }, select: { id: true, encryptedPassword: true } });

    const { count: revokedDevices } = await this.prisma.$transaction(async (tx) => {
      for (const account of accounts) {
        await tx.account.update({
          where: { id: account.id },
          data: { encryptedPassword: this.crypto.encrypt(this.crypto.decrypt(account.encryptedPassword, oldKey), newKey) },
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: { masterPasswordHash: newHash, masterKdfSalt: newKdfSalt },
      });
      return tx.trustedDevice.deleteMany({ where: { userId } });
    });

    this.unlockKeyStore.set(session.id, newKey, user.autoLockMinutes);
    session.unlocked = true;

    return { revokedDevices };
  }
}
