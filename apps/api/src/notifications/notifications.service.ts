import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // 이슈 6: 채널 연결 없이, 중요 메일을 계정별로 묶은 개수 요약만 제공
  async summary() {
    const grouped = await this.prisma.emailCandidate.groupBy({
      by: ['emailAccountId'],
      where: { status: 'PENDING' },
      _count: { _all: true },
    });
    return grouped.map((g) => ({
      emailAccountId: g.emailAccountId,
      count: g._count._all,
    }));
  }
}
