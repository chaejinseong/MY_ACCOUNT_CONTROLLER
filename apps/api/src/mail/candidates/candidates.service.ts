import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailProviderRegistryService } from '../providers/mail-provider-registry.service';
import { messageMatchesRule } from '../rules/rule-matcher.util';

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: MailProviderRegistryService,
  ) {}

  // 프론트에서 "승인"이 실제로 뭘 하는지(삭제/스팸/중요 표시) 보여줄 수 있도록 actionType을 같이 내려준다.
  findPending(userId: string) {
    return this.prisma.emailCandidate.findMany({
      where: { status: 'PENDING', emailAccount: { userId } },
      orderBy: { receivedAt: 'desc' },
      include: { rule: { select: { actionType: true } } },
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

  // 사용자가 화면에서 "지금 스캔"을 눌렀을 때 호출 — 그 사용자 소유 계정만 대상으로 한다.
  async scan(userId: string) {
    return this.scanAccounts(await this.prisma.emailAccount.findMany({ where: { userId, isActive: true } }));
  }

  // ScanSchedulerService(@Cron)가 주기적으로 호출 — 모든 사용자의 활성 계정을 대상으로 한다.
  // Gmail 토큰이 서버 관리 키로 복호화되므로(mail-provider.interface.ts 참고) 세션 잠금 상태와
  // 무관하게 항상 돌 수 있다 — 옵션 (a)로 전환하면서 없앤 기술적 걸림돌(기획서 3.4.2).
  async scanAll() {
    return this.scanAccounts(await this.prisma.emailAccount.findMany({ where: { isActive: true } }));
  }

  // 계정 하나가 실패(토큰 만료, Gmail API 일시 오류 등)해도 나머지 계정 스캔은 계속 진행한다 —
  // scanAll()이 사용자 감시 없이 도는 크론 작업이라 한 계정의 오류가 전체를 막으면 안 된다.
  private async scanAccounts(accounts: { id: string; providerType: string }[]) {
    let scannedAccounts = 0;
    let createdCandidates = 0;
    let failedAccounts = 0;

    for (const account of accounts) {
      try {
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
      } catch (err: any) {
        failedAccounts++;
        this.logger.error(`메일 계정 스캔 실패 (emailAccountId=${account.id}): ${err.message}`, err.stack);
      }
    }

    return { scannedAccounts, createdCandidates, failedAccounts };
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
