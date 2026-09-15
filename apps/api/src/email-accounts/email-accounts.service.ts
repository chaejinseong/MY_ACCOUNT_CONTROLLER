import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { GmailTokenKeyService } from '../common/crypto/gmail-token-key.service';
import { GmailTokens } from './gmail-oauth.service';

@Injectable()
export class EmailAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly tokenKey: GmailTokenKeyService,
  ) {}

  findAll(userId: string) {
    return this.prisma.emailAccount.findMany({
      where: { userId },
      select: {
        id: true,
        providerType: true,
        displayName: true,
        isActive: true,
        connectedAt: true,
      },
      orderBy: { connectedAt: 'desc' },
    });
  }

  // 서버 관리 키(GmailTokenKeyService)로 토큰을 암호화한다 — 마스터 비밀번호/세션 잠금
  // 상태와 무관하게 항상 사용 가능해야 자동 백그라운드 스캔이 성립한다 (기술설계서 7.2
  // 옵션 a, mail-provider.interface.ts 상단 설명 참고).
  async createFromGmail(userId: string, tokens: GmailTokens) {
    const key = this.tokenKey.key;
    return this.prisma.emailAccount.create({
      data: {
        userId,
        providerType: 'gmail',
        displayName: tokens.email,
        encryptedAccessToken: this.crypto.encrypt(tokens.accessToken, key),
        encryptedRefreshToken: this.crypto.encrypt(tokens.refreshToken, key),
        tokenExpiresAt: tokens.expiryDate ? new Date(tokens.expiryDate) : null,
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const account = await this.prisma.emailAccount.findFirst({ where: { id, userId } });
    if (!account) {
      throw new NotFoundException('연결된 메일 계정을 찾을 수 없습니다.');
    }
    await this.prisma.emailAccount.delete({ where: { id } });
  }
}
