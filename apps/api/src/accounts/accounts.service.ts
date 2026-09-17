import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
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

  // password를 안 보내면 기존 암호문을 그대로 둔다 — 매번 재입력을 강요하지 않기 위함.
  async update(
    userId: string,
    id: string,
    encryptionKey: Buffer,
    data: {
      serviceName?: string;
      urlOrAppName?: string;
      category?: string;
      loginId?: string;
      password?: string;
      memo?: string;
    },
  ) {
    const existing = await this.prisma.account.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new NotFoundException('계정을 찾을 수 없습니다.');
    }

    const { password, ...rest } = data;
    try {
      return await this.prisma.account.update({
        where: { id },
        data: {
          ...rest,
          ...(password ? { encryptedPassword: this.crypto.encrypt(password, encryptionKey) } : {}),
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException(
          '이미 같은 사이트에 같은 아이디로 등록된 계정이 있습니다.',
        );
      }
      throw err;
    }
  }

  // 기술설계서 3.2: 비밀번호 생성기. 헷갈리는 문자(I/l/O/0/1)는 기본 문자셋에서 제외했다.
  generatePassword(options: {
    length?: number;
    includeUppercase?: boolean;
    includeLowercase?: boolean;
    includeNumbers?: boolean;
    includeSymbols?: boolean;
  }): { password: string } {
    const length = Math.min(Math.max(options.length ?? 16, 8), 64);
    const includeUppercase = options.includeUppercase ?? true;
    const includeLowercase = options.includeLowercase ?? true;
    const includeNumbers = options.includeNumbers ?? true;
    const includeSymbols = options.includeSymbols ?? true;

    const charsets: string[] = [];
    if (includeUppercase) charsets.push('ABCDEFGHJKLMNPQRSTUVWXYZ');
    if (includeLowercase) charsets.push('abcdefghijkmnpqrstuvwxyz');
    if (includeNumbers) charsets.push('23456789');
    if (includeSymbols) charsets.push('!@#$%^&*()-_=+[]{}');

    // 옵션을 전부 껐으면 기본 4종 문자셋으로 폴백 (빈 비밀번호 방지).
    const activeCharsets = charsets.length > 0
      ? charsets
      : ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%^&*()-_=+[]{}'];

    const allChars = activeCharsets.join('');
    const pick = (charset: string) => charset[randomInt(charset.length)];

    // 선택된 문자 종류가 최소 1개씩은 포함되도록 보장한 뒤, 나머지를 무작위로 채운다.
    const required = activeCharsets.map((set) => pick(set));
    const remaining = Array.from({ length: Math.max(length - required.length, 0) }, () => pick(allChars));

    // Fisher-Yates 셔플 — required 문자들이 항상 앞쪽에 몰리지 않도록.
    const chars = [...required, ...remaining];
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return { password: chars.join('') };
  }

  // 기획서 "백업/내보내기" 기능. 마스터 비밀번호와는 별개의 "내보내기 비밀번호"로
  // 파일을 재암호화한다 — 평문으로 내보내면 PC가 털렸을 때 잠금 상태와 무관하게 파일 하나로
  // 전 계정이 유출되는 위험이 생기기 때문 (2026-09-17 논의). 내보내기 비밀번호를 잊으면 그
  // 백업 파일 하나만 못 쓰게 될 뿐 — 마스터 비밀번호 정책(옵션 B+C)과 같은 "복구 수단 없음"
  // 원칙을 이 파일에도 그대로 적용한 것이다.
  async exportAccounts(
    userId: string,
    encryptionKey: Buffer,
    exportPassword: string,
  ): Promise<{ version: 1; exportedAt: string; salt: string; payload: string }> {
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    const plain = accounts.map(({ encryptedPassword, id, userId: _userId, createdAt, updatedAt, ...rest }) => ({
      ...rest,
      password: this.crypto.decrypt(encryptedPassword, encryptionKey),
    }));

    const salt = this.crypto.generateKdfSalt();
    const exportKey = await this.crypto.deriveEncryptionKey(exportPassword, salt);
    const payload = this.crypto.encrypt(JSON.stringify(plain), exportKey);

    return { version: 1, exportedAt: new Date().toISOString(), salt, payload };
  }

  async importAccounts(
    userId: string,
    encryptionKey: Buffer,
    exportPassword: string,
    file: { version: number; salt: string; payload: string },
  ): Promise<{ imported: number; skipped: number }> {
    if (file.version !== 1) {
      throw new BadRequestException('지원하지 않는 백업 파일 버전입니다.');
    }

    const exportKey = await this.crypto.deriveEncryptionKey(exportPassword, file.salt);

    let json: string;
    try {
      json = this.crypto.decrypt(file.payload, exportKey);
    } catch {
      // AES-GCM 인증 태그 불일치 = 내보내기 비밀번호가 틀렸거나 파일이 손상됨.
      throw new BadRequestException('내보내기 비밀번호가 올바르지 않거나 파일이 손상되었습니다.');
    }

    const entries: Array<{
      serviceName: string;
      urlOrAppName: string;
      category: string;
      loginId: string;
      password: string;
      memo?: string | null;
    }> = JSON.parse(json);

    let imported = 0;
    let skipped = 0;
    for (const entry of entries) {
      try {
        await this.create(userId, encryptionKey, { ...entry, memo: entry.memo ?? undefined });
        imported++;
      } catch (err: any) {
        // 이미 같은 (urlOrAppName, loginId) 조합이 있으면 건너뛴다 — 복원을 여러 번 눌러도 안전.
        if (err instanceof ConflictException) {
          skipped++;
          continue;
        }
        throw err;
      }
    }

    return { imported, skipped };
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.account.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new NotFoundException('계정을 찾을 수 없습니다.');
    }
    await this.prisma.account.delete({ where: { id } });
  }
}
