import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  // 목록 조회에서는 비밀번호를 복호화하지 않는다 (기술설계서 3.2 — 복호화는 상세 조회에서만).
  findAll(userId: string, category?: string, q?: string) {
    return this.prisma.account.findMany({
      where: {
        userId,
        ...(category ? { category } : {}),
        ...(q
          ? {
              OR: [
                { serviceName: { contains: q, mode: 'insensitive' } },
                { urlOrAppName: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        serviceName: true,
        urlOrAppName: true,
        category: true,
        loginId: true,
        memo: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(userId: string, id: string, encryptionKey: Buffer) {
    const account = await this.prisma.account.findFirst({ where: { id, userId } });
    if (!account) {
      throw new NotFoundException('계정을 찾을 수 없습니다.');
    }
    const { encryptedPassword, ...rest } = account;
    return { ...rest, password: this.crypto.decrypt(encryptedPassword, encryptionKey) };
  }

  async create(
    userId: string,
    encryptionKey: Buffer,
    data: {
      serviceName: string;
      urlOrAppName: string;
      category: string;
      loginId: string;
      password: string;
      memo?: string;
    },
  ) {
    const { password, ...rest } = data;
    try {
      return await this.prisma.account.create({
        data: {
          userId,
          ...rest,
          encryptedPassword: this.crypto.encrypt(password, encryptionKey),
        },
      });
    } catch (err: any) {
      // 이슈 2: (userId, urlOrAppName, loginId) 중복이면 Prisma가 P2002를 던진다 → 409로 변환
      if (err.code === 'P2002') {
        throw new ConflictException(
          '이미 같은 사이트에 같은 아이디로 등록된 계정이 있습니다.',
        );
      }
      throw err;
    }
  }
}
