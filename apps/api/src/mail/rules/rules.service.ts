import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  // emailAccount.userId로 걸러서 다른 사용자의 규칙이 보이지 않게 한다.
  findAll(userId: string, emailAccountId?: string) {
    return this.prisma.emailRule.findMany({
      where: {
        emailAccount: { userId },
        ...(emailAccountId ? { emailAccountId } : {}),
      },
      include: { conditions: true },
    });
  }

  // 이슈 4: conditions는 1~5개, 2개 이상이면 logicalOperator(AND/OR) 필요
  async create(
    userId: string,
    data: {
      emailAccountId: string;
      logicalOperator: 'AND' | 'OR';
      actionType: string;
      conditions: { conditionType: string; conditionValue: any }[];
    },
  ) {
    const emailAccount = await this.prisma.emailAccount.findFirst({
      where: { id: data.emailAccountId, userId },
    });
    if (!emailAccount) {
      throw new NotFoundException('연결된 메일 계정을 찾을 수 없습니다.');
    }

    return this.prisma.emailRule.create({
      data: {
        emailAccountId: data.emailAccountId,
        logicalOperator: data.logicalOperator,
        actionType: data.actionType,
        conditions: { create: data.conditions },
      },
      include: { conditions: true },
    });
  }
}
