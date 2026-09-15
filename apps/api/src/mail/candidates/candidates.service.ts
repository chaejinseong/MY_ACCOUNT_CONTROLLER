import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailProviderRegistryService } from '../providers/mail-provider-registry.service';
import { messageMatchesRule } from '../rules/rule-matcher.util';

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: MailProviderRegistryService,
  ) {}

  findPending(userId: string) {
    return this.prisma.emailCandidate.findMany({
      where: { status: 'PENDING', emailAccount: { userId } },
      orderBy: { receivedAt: 'desc' },
    });
  }

  // 기획서 3.4.4: 중요 메일 알림 = actionType이 "important"인 규칙에 매칭되어 승인된
  // 후보를 계정별로 집계한 요약. EmailCandidate를 따로 건드리지 않고 개수만 센다.
  async importantSummary(userId: string) {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { userId },
      select: { id: true, displayName: true },
    });

    const counts = await this.prisma.emailCandidate.groupBy({
      by: ['emailAccountId'],
      where: { status: 'APPROVED', rule: { actionType: 'important' }, emailAccount: { userId } },
      _count: { id: true },
    });
    const countByAccount = new Map(counts.map((c) => [c.emailAccountId, c._count.id]));

    return accounts.map((account) => ({
      emailAccountId: account.id,
      displayName: account.displayName,
      importantCount: countByAccount.get(account.id) ?? 0,
    }));
  }

  // Gmail 토큰은 서버 관리 키로 복호화되므로(mail-provider.interface.ts 참고) 기술적으로는
  // 세션 잠금 없이도 스캔할 수 있다. 다만 후보 메일의 발신자/제목이 드러나는 화면이라
  // 컨트롤러는 여전히 UnlockedGuard로 로그인+잠금해제를 요구한다(RulesController와 동일한
  // 정책 — email-candidates.controller.ts 참고). 사용자가 화면에서 "지금 스캔"을 눌렀을
  // 때만 도는 구조이고, 완전 자동 백그라운드 스캔은 아직 별도 배선이 필요하다.
  async scan(userId: string) {
    const accounts = await this.prisma.emailAccount.findMany({ where: { userId, isActive: true } });

    let scannedAccounts = 0;
    let createdCandidates = 0;

    for (const account of accounts) {
      const provider = this.providerRegistry.get(account.providerType);
      const rules = await this.prisma.emailRule.findMany({
        where: { emailAccountId: account.id, isActive: true },
        include: { conditions: true },
      });
      if (rules.length === 0) continue;

      const messages = await provider.listCandidateMessages(account.id);
      scannedAccounts++;

      for (const message of messages) {
        for (const rule of rules) {
          if (!messageMatchesRule(message, rule)) continue;

          try {
            await this.prisma.emailCandidate.create({
              data: {
                ruleId: rule.id,
                emailAccountId: account.id,
                externalMessageId: message.externalMessageId,
                sender: message.sender,
                subject: message.subject,
                receivedAt: message.receivedAt,
              },
            });
            createdCandidates++;
          } catch (err: any) {
            // 이미 같은 (rule, message) 조합으로 쌓인 후보면 건너뛴다(재스캔 시 중복 방지).
            if (err.code !== 'P2002') throw err;
          }
        }
      }
    }

    return { scannedAccounts, createdCandidates };
  }

  // action_type이 delete_candidate/spam_candidate면 실제로 Gmail에도 반영한다.
  // important는 승인해도 원본 메일함을 건드릴 필요가 없어서 상태만 바꾼다.
  async approve(userId: string, id: string) {
    const candidate = await this.findOwned(userId, id);

    if (candidate.rule.actionType === 'delete_candidate' || candidate.rule.actionType === 'spam_candidate') {
      const provider = this.providerRegistry.get(candidate.emailAccount.providerType);
      const action = candidate.rule.actionType === 'delete_candidate' ? 'delete' : 'spam';
      await provider.applyAction(candidate.emailAccountId, candidate.externalMessageId, action);
    }

    return this.prisma.emailCandidate.update({
      where: { id },
      data: { status: 'APPROVED', processedAt: new Date() },
    });
  }

  async exclude(userId: string, id: string) {
    await this.findOwned(userId, id);
    return this.prisma.emailCandidate.update({
      where: { id },
      data: { status: 'EXCLUDED', processedAt: new Date() },
    });
  }

  private async findOwned(userId: string, id: string) {
    const candidate = await this.prisma.emailCandidate.findFirst({
      where: { id, emailAccount: { userId } },
      include: { rule: true, emailAccount: true },
    });
    if (!candidate) {
      throw new NotFoundException('후보 메일을 찾을 수 없습니다.');
    }
    return candidate;
  }
}
