import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  findPending() {
    return this.prisma.emailCandidate.findMany({
      where: { status: 'PENDING' },
      orderBy: { receivedAt: 'desc' },
    });
  }

  // TODO: 승인 시 실제 GmailProvider.applyAction 호출해서 삭제/스팸 처리해야 함 (아직 미구현)
  approve(id: string) {
    return this.prisma.emailCandidate.update({
      where: { id },
      data: { status: 'APPROVED', processedAt: new Date() },
    });
  }

  exclude(id: string) {
    return this.prisma.emailCandidate.update({
      where: { id },
      data: { status: 'EXCLUDED', processedAt: new Date() },
    });
  }
}
